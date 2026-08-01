# Production Errors and Warnings Remediation

**Observed:** 2026-08-01 on the Plane production deployment

## Executive summary

| Priority      | Finding                                                                                              | Recommended action                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Resolved      | Production used a known placeholder `SECRET_KEY`                                                     | The key was securely rotated, affected services were recreated, and the environment file is now owner-readable only.                  |
| Resolved      | Celery received the unregistered task `plane.license.bgtasks.tracer.instance_traces` every six hours | The exact stale database-backed schedule was disabled reversibly.                                                                     |
| Resolved      | Celery workers ran as root                                                                           | Worker and beat now run as the image-provided unprivileged UID/GID, with only their log volumes ownership-adjusted.                   |
| Resolved      | Valkey started with `vm.overcommit_memory=0`                                                         | The host now uses and persists `vm.overcommit_memory=1`.                                                                              |
| In rollout    | RabbitMQ reports deprecated features                                                                 | Celery is configured for quorum task queues, per-consumer QoS detection, and exclusive temporary queues; apply after queue migration. |
| Resolved      | Valkey used its default configuration                                                                | A reviewed configuration matching the effective prior behavior is mounted explicitly.                                                 |
| In rollout    | Production models did not match migration state                                                      | Migration `0132_sync_production_model_state` reconciles the schema and a production-settings regression test prevents recurrence.     |
| Informational | RabbitMQ rebuilds indices and a connection closes during container recreation                        | Treat as expected during a controlled restart unless it repeats after the stack is healthy.                                           |
| Informational | Caddy skips HTTP/2 and HTTP/3 on an internal cleartext listener                                      | No action when TLS terminates elsewhere; HTTP/2 and HTTP/3 require TLS in the normal Caddy configuration.                             |

## Remediation record

The following production changes were applied on 2026-08-01 before the application-image rollout:

- Created a protected configuration backup and a validated PostgreSQL custom-format dump.
- Rotated `SECRET_KEY` without printing it, restricted `plane.env` to mode `0600`, recreated all consumers, and confirmed the placeholder warning stopped.
- Disabled only the stale `instance_traces` periodic-task row; the row was retained for rollback and audit purposes.
- Recreated worker and beat as UID/GID `65534:65534`, set their home to `/tmp`, and confirmed their restart counts remained zero without permission errors.
- Persisted `vm.overcommit_memory=1` in `/etc/sysctl.d/99-plane-valkey.conf`, mounted an explicit `valkey.conf`, recovered the existing RDB data, and confirmed `PING` succeeds.

The application rollout adds two safeguards:

- Celery declares the default task queue as a quorum queue with publisher confirms and automatic quorum detection, eliminating global QoS use. Event and control queues remain temporary but are exclusive, eliminating transient non-exclusive queues.
- Django migration `0132_sync_production_model_state` captures the previously uncommitted production model state. A smoke test now runs `makemigrations --check --dry-run` with production settings.

The RabbitMQ queue-type change requires a controlled cutover because RabbitMQ cannot redeclare an existing classic queue as quorum. Stop API, worker, and beat only after the `celery` queue has no ready or unacknowledged messages; delete that exact empty queue; run migrations; and then start the new API and workers so Celery declares it as quorum. Verify queue type and worker consumption before denying the deprecated broker features.

## Safe operating sequence

1. Take and verify a database backup before changing Celery beat rows or rotating secrets.
2. Record the currently deployed image tags and container names.
3. Apply one remediation at a time, recreate only affected services, and verify health before continuing.
4. Keep the current secret outside shell history and logs; never paste it into tickets or this report.
5. Do not delete queues, volumes, or periodic-task rows as a first response. Prefer inspection and reversible disablement.

Resolve the actual container names before using the examples below:

    docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sort

## 1. Known insecure Django `SECRET_KEY`

### Evidence and risk

The API emitted the repository's critical warning for a known placeholder key. Django requires a large, random, environment-specific secret. A known value can undermine signed cookies, password-reset links, CSRF-related signing, and other Django signing operations.

### Remediation

Generate the replacement without printing it into shared logs, store it in the production environment file or secret manager used by the Plane deployment, and recreate the API, migrator, background-worker, and beat-worker containers that consume it. The repository currently reads only `SECRET_KEY`; it does not configure `SECRET_KEY_FALLBACKS`, so a direct rotation will invalidate existing sessions and outstanding signed links.

One suitable generator is:

    python3 -c 'import secrets; print(secrets.token_urlsafe(64))'

Protect the environment file with owner-only permissions and do not commit it. Schedule a maintenance notice because users will need to sign in again.

### Verification

- Confirm the critical placeholder warning no longer appears after recreation.
- Run the production Django deployment checks inside the API container.
- Verify sign-in, sign-out, password-reset generation, and one authenticated API request.
- Confirm every Django/Celery service received the same new value without displaying the value.

Reference: [Django deployment checklist](https://docs.djangoproject.com/en/dev/howto/deployment/checklist/#secret-key).

## 2. Unregistered `instance_traces` Celery task

### Evidence and likely cause

The worker discards `plane.license.bgtasks.tracer.instance_traces` approximately every six hours as unregistered. Celery explicitly discards unregistered tasks. The staged source tree contains no implementation or import for this task, while the architecture describes it as telemetry and the deployment uses `django_celery_beat.schedulers.DatabaseScheduler`. This strongly indicates a database schedule left behind by an older or differently licensed image, rather than a transient broker fault.

### Inspect first

Check whether any worker advertises the task:

    docker exec <bgworker-container> celery -A plane inspect registered

Inspect the database schedule from the API container:

    docker exec <api-container> python manage.py shell -c "from django_celery_beat.models import PeriodicTask; print(list(PeriodicTask.objects.filter(task='plane.license.bgtasks.tracer.instance_traces').values('id','name','task','enabled','last_run_at','total_run_count')))"

### Remediation

- If the deployed edition is meant to provide this task, fix the image/package mismatch or task import and verify it appears in `celery inspect registered` before re-enabling its schedule.
- If this deployment does not provide the task, disable the exact matching `PeriodicTask` row. Disable rather than delete so the change is reversible:

      docker exec <api-container> python manage.py shell -c "from django_celery_beat.models import PeriodicTask; print(PeriodicTask.objects.filter(task='plane.license.bgtasks.tracer.instance_traces').update(enabled=False))"

Restarting the beat worker is usually unnecessary with the database scheduler, but recreate it if the schedule does not refresh.

### Verification

- Confirm the task is disabled or registered, according to the chosen resolution.
- Monitor at least one full six-hour interval.
- Confirm there are no further `Received unregistered task` messages and no growing queue backlog.

References: [Celery's unregistered-task behavior](https://docs.celeryq.dev/en/v5.4.0/_modules/celery/worker/consumer/consumer.html) and [Celery periodic tasks](https://docs.celeryq.dev/en/v5.4.0/userguide/periodic-tasks.html).

## 3. Celery workers running as root

### Risk

Celery warns because a worker executes task code with the worker process's operating-system privileges. Running it as root unnecessarily increases the impact of a compromised task, dependency, or deserialization path.

### Remediation

1. Inspect the current identity and writable paths:

   docker exec <bgworker-container> id
   docker inspect <bgworker-container> --format '{{json .Mounts}}'

2. Add a dedicated non-root user to the worker image, or set a numeric `user: UID:GID` for the background and beat services.
3. Ensure only the required application, temporary, log, and mounted-data paths are writable by that UID/GID.
4. Recreate one worker first and verify normal task execution before changing all workers.

Do not blindly add `user: 1000:1000`: numeric ownership must match the image and mounted volumes. Avoid `C_FORCE_ROOT`; it suppresses protection rather than removing the risk.

### Verification

- `docker exec <worker> id -u` returns a non-zero UID.
- Worker startup has no superuser warning.
- A representative background job and a scheduled task both complete.
- No permission-denied errors appear for logs, temporary files, or mounted storage.

Reference: [Celery daemonization and root-worker warning](https://docs.celeryq.dev/en/stable/userguide/daemonizing.html#running-the-worker-with-superuser-privileges-root).

## 4. Valkey `vm.overcommit_memory` warning

### Risk

Valkey uses `fork()` for background persistence. With Linux overcommit disabled, a background save can fail even when copy-on-write would have made the operation safe.

### Remediation

Inspect the host value:

    sysctl vm.overcommit_memory

Set it immediately on the Docker host:

    sudo sysctl vm.overcommit_memory=1

Persist the setting in a dedicated file such as `/etc/sysctl.d/99-valkey.conf` containing:

    vm.overcommit_memory = 1

Then load that file with the host's normal sysctl management process. This is a host-kernel setting; changing it inside the container is not sufficient.

### Verification

- `sysctl vm.overcommit_memory` reports `1` after a reboot.
- Valkey startup no longer emits the warning.
- `valkey-cli INFO persistence` shows no failed background saves.

References: [Valkey administration guidance](https://valkey.io/topics/admin/#linux) and [Valkey fork failure explanation](https://valkey.io/topics/faq/#background-saving-fails-with-a-fork-error-on-linux).

## 5. Valkey default-configuration notice

This notice is not itself a failure. The current compose service supplies a persistent `/data` volume but no explicit `valkey.conf`. Create and mount a reviewed configuration only after deciding:

- whether this instance is disposable cache, durable coordination state, or both;
- whether RDB snapshots, AOF, or neither are required;
- the memory ceiling and the correct eviction policy;
- authentication and network exposure requirements.

Do not select an eviction policy merely to remove the notice; evicting Celery or coordination keys can cause functional failures. After adding a configuration, verify `CONFIG GET`, persistence, restart recovery, memory behavior, and Plane background jobs.

## 6. RabbitMQ recovery and deprecated features

### Recovery messages

Index rebuilding during broker startup is expected after an image change, unclean stop, or queue recovery. A client connection closing while containers are being recreated is also expected. Investigate if index rebuilding occurs on every clean restart, recovery time grows, messages are lost, or connection churn continues after health checks pass.

### Deprecated features

RabbitMQ's warnings named `management_metrics_collection`, `transient_nonexcl_queues`, and `global_qos`. First distinguish features merely permitted by the broker from features actively used:

    docker exec <rabbitmq-container> rabbitmq-diagnostics list_deprecated_features
    docker exec <rabbitmq-container> rabbitmq-diagnostics check_if_any_deprecated_features_are_used

Then remediate active use:

- `management_metrics_collection`: migrate monitoring to the RabbitMQ Prometheus plugin before disabling legacy management metrics.
- `global_qos`: use per-consumer QoS; confirm the deployed Celery/Kombu versions and worker prefetch behavior before changing broker policy.
- `transient_nonexcl_queues`: identify the declaring application. Prefer durable queues, exclusive transient queues, or durable queues with an appropriate queue TTL.

Test with deprecated features denied in staging before a RabbitMQ upgrade. Do not disable a feature in production merely to silence a warning; declarations can begin failing immediately.

### Verification

- The diagnostics command reports no active deprecated features targeted for removal.
- Celery workers connect, consume, acknowledge, retry, and schedule jobs normally.
- Queue depth and unacknowledged-message counts return to normal after restart.
- Broker logs stop showing repeated recovery or connection churn once healthy.

References: [RabbitMQ deprecated features](https://www.rabbitmq.com/docs/deprecated-features), [deprecated feature migration list](https://www.rabbitmq.com/release-information/deprecated-features-list), and [queue durability guidance](https://www.rabbitmq.com/docs/next/queues).

## 7. Caddy HTTP/2 and HTTP/3 notices on internal port 80

Caddy's messages about skipping HTTP/2 and HTTP/3 on an internal cleartext `:80` listener are informational. Standard HTTP/2 and HTTP/3 require TLS; HTTP/3 always requires it. If another proxy or load balancer terminates TLS before forwarding to this listener, retain HTTP/1.1 internally and take no action.

Only change this when Caddy itself should terminate public TLS. In that case configure the public hostname and certificates, expose the required TCP/UDP ports, and verify redirects and forwarded headers. Do not enable experimental cleartext HTTP/2 solely to remove the notice.

Reference: [Caddy HTTP transport versions](https://caddyserver.com/docs/json/apps/http/servers/errors/routes/handle/reverse_proxy/transport/http/versions/).

## Post-change monitoring checklist

- All Plane containers remain healthy with stable restart counts.
- Migrations complete once and the API becomes ready.
- No critical `SECRET_KEY` warning appears.
- No unregistered `instance_traces` task is discarded for at least six hours.
- Celery workers run as non-root and execute representative jobs.
- Valkey reports successful persistence and no overcommit warning.
- RabbitMQ has no sustained recovery, connection churn, or growing backlog.
- Caddy emits no unexpected TLS, upstream, or routing failures.
- Agent chat displays provider rejection details without exposing API keys.
