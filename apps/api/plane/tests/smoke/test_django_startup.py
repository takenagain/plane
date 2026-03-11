# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.core.management import call_command


@pytest.mark.smoke
def test_wait_for_db_runs_django_startup_checks():
    call_command("wait_for_db")
