# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Test Settings"""

import os

from .common import *  # noqa

DEBUG = True

# Send it in a dummy outbox
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CELERY_BROKER_URL = "memory://"

APP_BASE_URL = "http://localhost:3000"

# Ensure EMAIL_HOST is set for tests (matches CI environment where EMAIL_HOST=localhost)
os.environ.setdefault("EMAIL_HOST", "localhost")

INSTALLED_APPS.append(  # noqa
    "plane.tests"
)
