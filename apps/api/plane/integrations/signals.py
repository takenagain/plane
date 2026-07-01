from django.db.models.signals import post_save
from django.dispatch import receiver

from plane.db.models import Issue
from plane.integrations.sentry.config import is_sentry_sync_enabled
from plane.integrations.sentry.sync import is_sentry_sync_in_progress, sync_plane_state_to_sentry
from plane.utils.exception_logger import log_exception


@receiver(post_save, sender=Issue)
def sentry_issue_state_sync(sender, instance: Issue, created: bool, update_fields=None, **kwargs):
    if created or not is_sentry_sync_enabled() or is_sentry_sync_in_progress():
        return
    if update_fields is not None and "state_id" not in update_fields and "state" not in update_fields:
        return
    try:
        sync_plane_state_to_sentry(instance)
    except Exception as exc:
        log_exception(exc)
