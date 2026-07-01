from django.utils import timezone
import uuid

from plane.license.models import Instance, InstanceConfiguration

instance, _ = Instance.objects.update_or_create(
    id=Instance.objects.first().id if Instance.objects.exists() else uuid.uuid4(),
    defaults={
        "instance_name": "E2E Instance",
        "instance_id": str(uuid.uuid4()),
        "current_version": "1.0.0",
        "domain": "http://localhost:3003",
        "last_checked_at": timezone.now(),
        "is_setup_done": True,
    },
)
for key, value in [
    ("MFA_ENABLED", "1"),
    ("MFA_ENFORCED", "1"),
    ("ENABLE_SIGNUP", "1"),
    ("ENABLE_EMAIL_PASSWORD", "1"),
]:
    InstanceConfiguration.objects.update_or_create(
        key=key,
        defaults={"value": value, "category": "AUTHENTICATION"},
    )
print("seeded", instance.id)
