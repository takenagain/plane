# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import time

from django.core.management import BaseCommand
from django.db import connections
from django.db.utils import OperationalError


class Command(BaseCommand):
    """Django command to pause execution until db is available"""

    def handle(self, *args, **options):
        self.stdout.write("Waiting for database...")
        while True:
            try:
                conn = connections["default"]
                conn.ensure_connection()
                break
            except OperationalError:
                self.stdout.write("Database unavailable, waiting 2 seconds...")
                time.sleep(2)

        self.stdout.write(self.style.SUCCESS("Database available!"))
