"""Enroll the E2E admin user with a known TOTP secret for MFA-enforced instances."""
from plane.authentication.utils import mfa as mfa_utils
from plane.db.models import MFADevice, User, UserMFA

email = "admin@example.com".strip().lower()
e2e_totp_secret = "JBSWY3DPEHPK3PXP"

try:
    user = User.objects.get(email=email)
except User.DoesNotExist:
    print(f"E2E_MFA_SEED:skip user {email} not found")
else:
    user_mfa, _ = UserMFA.objects.get_or_create(user=user)
    user_mfa.is_enabled = True
    user_mfa.save()

    MFADevice.objects.filter(user=user, device_type=MFADevice.DeviceType.TOTP).delete()
    MFADevice.objects.create(
        user=user,
        device_type=MFADevice.DeviceType.TOTP,
        is_confirmed=True,
        secret_encrypted=mfa_utils.encrypt_secret(e2e_totp_secret),
        name="E2E Authenticator",
    )
    print(f"E2E_MFA_SEED:ok {user.id}")
