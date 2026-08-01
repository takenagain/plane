# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Celery settings required for forward-compatible RabbitMQ operation."""

from django.conf import settings


def test_task_queue_uses_quorum_semantics():
    assert settings.CELERY_TASK_DEFAULT_QUEUE_TYPE == "quorum"
    assert settings.CELERY_TASK_DEFAULT_EXCHANGE_TYPE == "topic"
    assert settings.CELERY_BROKER_TRANSPORT_OPTIONS == {"confirm_publish": True}
    assert settings.CELERY_WORKER_DETECT_QUORUM_QUEUES is True


def test_temporary_monitoring_queues_are_exclusive():
    assert settings.CELERY_EVENT_QUEUE_DURABLE is False
    assert settings.CELERY_EVENT_QUEUE_EXCLUSIVE is True
    assert settings.CELERY_CONTROL_QUEUE_DURABLE is False
    assert settings.CELERY_CONTROL_QUEUE_EXCLUSIVE is True
