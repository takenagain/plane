/* eslint-disable turbo/no-undeclared-env-vars */
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ensureE2ESeedData, resolveApiContainerName } from "./time-tracking";

export {
  BASE_URL,
  API_BASE_URL,
  signInAndEnsureWorkspace,
  signInViaApi,
  waitForPageLoad,
  ensureE2ESeedData,
} from "./time-tracking";

const E2E_SENTRY_CLIENT_ID = process.env.E2E_SENTRY_CLIENT_ID || "e2e-sentry-client-id";
const E2E_SENTRY_WEBHOOK_SECRET = process.env.E2E_SENTRY_WEBHOOK_SECRET || "e2e-webhook-secret";
const E2E_SENTRY_ORG_SLUG = process.env.E2E_SENTRY_ORG_SLUG || "e2e-org";
const E2E_SENTRY_PROJECT_SLUG = process.env.E2E_SENTRY_PROJECT_SLUG || "backend";

function runApiShell(script: string): string {
  const { runtime, container } = resolveApiContainerName();
  return execFileSync(runtime, ["exec", "-w", "/", container, "python", "/code/manage.py", "shell", "-c", script], {
    encoding: "utf-8",
    cwd: "/",
  });
}

/** Enable Sentry on the instance so the integrations card renders. */
export function enableSentryInstanceConfig(): void {
  const script = `
from django.core.cache import cache
from plane.license.models import InstanceConfiguration

for key, value in [
    ("ENABLE_SENTRY_SYNC", "1"),
    ("SENTRY_CLIENT_ID", "${E2E_SENTRY_CLIENT_ID}"),
]:
    obj, _ = InstanceConfiguration.objects.get_or_create(key=key)
    obj.value = value
    obj.is_encrypted = False
    obj.save()

cache.clear()
print("SENTRY_INSTANCE_OK")
`;
  const output = runApiShell(script);
  if (!output.includes("SENTRY_INSTANCE_OK")) {
    throw new Error(`Failed to enable Sentry instance config: ${output}`);
  }
}

export type SentryE2ESeed = {
  workspaceSlug: string;
  projectId: string;
  unresolvedStateId: string;
  resolvedStateId: string;
  webhookSecret: string;
  sentryProjectSlug: string;
};

/** Seed workspace Sentry connection + project mapping for webhook and mapping UI tests. */
export function seedSentryConnectionAndMapping(workspaceSlug?: string): SentryE2ESeed {
  const base = ensureE2ESeedData();
  const slug = workspaceSlug || base.workspaceSlug;
  const script = `
from django.core.cache import cache
from plane.db.models import Workspace, Project, State, SentryWorkspaceConnection, SentryProjectMapping

workspace = Workspace.objects.get(slug="${slug}")
project = Project.objects.get(id="${base.projectId}")
states = list(State.all_state_objects.filter(project=project, deleted_at__isnull=True).order_by("sequence"))
if len(states) < 2:
    raise RuntimeError("Need at least two project states for Sentry mapping")

unresolved = states[0]
resolved = states[-1]

SentryWorkspaceConnection.all_objects.filter(workspace=workspace).delete()
SentryProjectMapping.all_objects.filter(workspace=workspace, project=project).delete()

connection = SentryWorkspaceConnection.objects.create(
    workspace=workspace,
    sentry_org_slug="${E2E_SENTRY_ORG_SLUG}",
    webhook_secret="${E2E_SENTRY_WEBHOOK_SECRET}",
    access_token_encrypted="",
    refresh_token_encrypted="",
)
mapping = SentryProjectMapping.objects.create(
    workspace=workspace,
    project=project,
    sentry_project_slug="${E2E_SENTRY_PROJECT_SLUG}",
    unresolved_state=unresolved,
    resolved_state=resolved,
    created_by=workspace.owner,
    updated_by=workspace.owner,
)

cache.clear()
print(f"SENTRY_SEED:{unresolved.id}|{resolved.id}|{connection.webhook_secret}|{mapping.sentry_project_slug}")
`;
  const output = runApiShell(script);
  const match = output.match(/SENTRY_SEED:([^\n\r]+)/);
  if (!match?.[1]) {
    throw new Error(`Unable to parse Sentry seed output: ${output}`);
  }
  const [unresolvedStateId, resolvedStateId, webhookSecret, sentryProjectSlug] = match[1].trim().split("|");
  if (!unresolvedStateId || !resolvedStateId || !webhookSecret) {
    throw new Error(`Incomplete Sentry seed identifiers: ${match[1]}`);
  }
  return {
    workspaceSlug: slug,
    projectId: base.projectId,
    unresolvedStateId,
    resolvedStateId,
    webhookSecret,
    sentryProjectSlug: sentryProjectSlug || E2E_SENTRY_PROJECT_SLUG,
  };
}

/** Remove Sentry connection so disconnected UI can be asserted. */
export function clearSentryWorkspaceConnection(workspaceSlug: string): void {
  const script = `
from plane.db.models import Workspace, SentryWorkspaceConnection, SentryProjectMapping
workspace = Workspace.objects.get(slug="${workspaceSlug}")
SentryWorkspaceConnection.all_objects.filter(workspace=workspace).delete()
SentryProjectMapping.all_objects.filter(workspace=workspace).delete()
print("SENTRY_CLEARED")
`;
  const output = runApiShell(script);
  if (!output.includes("SENTRY_CLEARED")) {
    throw new Error(`Failed to clear Sentry connection: ${output}`);
  }
}

export function signSentryWebhook(body: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${digest}`;
}

export function buildSentryAlertPayload(issueId: string, projectSlug: string, title = "E2E Sentry alert") {
  return {
    action: "triggered",
    data: {
      issue: {
        id: issueId,
        title,
        permalink: `https://sentry.io/issues/${issueId}/`,
        project: { slug: projectSlug },
        level: "error",
      },
    },
  };
}
