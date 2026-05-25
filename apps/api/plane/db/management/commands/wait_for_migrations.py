# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# wait_for_migrations.py
import time

from django.core.management.base import BaseCommand
from django.db import DEFAULT_DB_ALIAS, connections
from django.db.migrations.executor import MigrationExecutor
from django.db.utils import DatabaseError


class Command(BaseCommand):
    help = "Wait for database migrations to complete before starting Celery worker/beat"

    def handle(self, *args, **kwargs):
        # Build the migration graph once — the on-disk migration files don't
        # change while we're waiting, only the applied-set in the DB does.
        connection = connections[DEFAULT_DB_ALIAS]
        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()

        while True:
            try:
                if not self._pending_migrations(connection, targets):
                    break
                self.stdout.write("Waiting for database migrations to complete...")
                time.sleep(10)
            except DatabaseError as exc:
                # DB may be briefly unavailable while the migrator container is
                # running. Sleep and retry rather than exiting and triggering a
                # tight restart loop.
                self.stdout.write(
                    f"DB error while checking migrations "
                    f"({type(exc).__name__}: {exc}), retrying in 10 seconds..."
                )
                time.sleep(10)
            except Exception as exc:
                # Catch-all backstop to avoid tight restart loops on unexpected errors.
                self.stdout.write(
                    self.style.WARNING(
                        f"Unexpected error while waiting for migrations "
                        f"({type(exc).__name__}: {exc}), retrying in 10 seconds..."
                    )
                )
                time.sleep(10)

        self.stdout.write(
            self.style.SUCCESS("No migrations Pending. Starting processes ...")
        )

    @staticmethod
    def _pending_migrations(connection, targets):
        """Check whether every leaf migration has been applied.

        Instead of re-building the full ``MigrationLoader`` on each poll (which
        re-reads and parses every migration file on disk), we issue a single
        lightweight SQL query against the ``django_migrations`` table.
        """
        if not targets:
            return False

        with connection.cursor() as cursor:
            # Build a VALUES list of (app, name) tuples to check.
            placeholders = ", ".join(["(%s, %s)"] * len(targets))
            params = [v for pair in targets for v in pair]
            cursor.execute(
                f"SELECT COUNT(*) FROM (VALUES {placeholders}) AS t(app, name) "  # noqa: S608
                "WHERE NOT EXISTS ("
                "  SELECT 1 FROM django_migrations dm "
                "  WHERE dm.app = t.app AND dm.name = t.name"
                ")",
                params,
            )
            (missing,) = cursor.fetchone()
        return missing > 0
