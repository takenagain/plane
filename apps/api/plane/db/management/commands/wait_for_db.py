# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import time

from django.core.management import BaseCommand
from django.db import connections
from django.db.utils import DatabaseError


class Command(BaseCommand):
    """Django command to pause execution until the database is available."""

    def handle(self, *args, **options):
        self.stdout.write("Waiting for database...")
        while True:
            try:
                conn = connections["default"]
                conn.ensure_connection()
                break
            except DatabaseError as exc:
                # Catches both OperationalError (server unreachable/down) and
                # InterfaceError (bad/missing connection parameters). psycopg3
                # raises InterfaceError for missing params — it is NOT a
                # subclass of OperationalError, so the previous narrow catch
                # would propagate it uncaught, causing an immediate container
                # exit and a tight Docker restart loop at 100% CPU.
                self.stdout.write(
                    f"Database unavailable ({type(exc).__name__}: {exc}), "
                    "retrying in 2 seconds..."
                )
                time.sleep(2)
            except Exception as exc:
                # Catch-all backstop: any unforeseen exception still sleeps
                # before retrying so the container never exits in a tight loop.
                self.stdout.write(
                    self.style.WARNING(
                        f"Unexpected error while waiting for DB "
                        f"({type(exc).__name__}: {exc}), retrying in 2 seconds..."
                    )
                )
                time.sleep(2)

        self.stdout.write(self.style.SUCCESS("Database available!"))
