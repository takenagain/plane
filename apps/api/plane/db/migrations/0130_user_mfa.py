# Generated for local 2FA / MFA support

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0129_sentry_integration"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserMFA",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("is_enabled", models.BooleanField(default=False)),
                ("is_enforced", models.BooleanField(default=False)),
                ("enabled_at", models.DateTimeField(blank=True, null=True)),
                ("last_verified_at", models.DateTimeField(blank=True, null=True)),
                ("step_up_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mfa",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "User MFA",
                "verbose_name_plural": "User MFA",
                "db_table": "user_mfa",
            },
        ),
        migrations.CreateModel(
            name="MFADevice",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "device_type",
                    models.CharField(
                        choices=[
                            ("TOTP", "Authenticator app (TOTP)"),
                            ("WEBAUTHN", "Security key / passkey (WebAuthn)"),
                        ],
                        max_length=20,
                    ),
                ),
                ("name", models.CharField(blank=True, max_length=255)),
                ("is_confirmed", models.BooleanField(default=False)),
                ("secret_encrypted", models.TextField(blank=True, default="")),
                ("credential_id", models.TextField(blank=True, default="")),
                ("public_key", models.TextField(blank=True, default="")),
                ("sign_count", models.PositiveBigIntegerField(default=0)),
                ("transports", models.JSONField(default=list)),
                ("attachment", models.CharField(blank=True, max_length=20)),
                ("aaguid", models.CharField(blank=True, max_length=64)),
                ("device_class", models.CharField(blank=True, max_length=10)),
                ("backed_up", models.BooleanField(default=False)),
                ("is_hardware_security_key", models.BooleanField(default=False)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mfa_devices",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "MFA Device",
                "verbose_name_plural": "MFA Devices",
                "db_table": "mfa_devices",
            },
        ),
        migrations.CreateModel(
            name="MFARecoveryCode",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("code_hash", models.CharField(max_length=128)),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="mfa_recovery_codes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "MFA Recovery Code",
                "verbose_name_plural": "MFA Recovery Codes",
                "db_table": "mfa_recovery_codes",
            },
        ),
        migrations.AddIndex(
            model_name="mfadevice",
            index=models.Index(fields=["user", "device_type"], name="mfa_device_user_type_idx"),
        ),
        migrations.AddIndex(
            model_name="mfadevice",
            index=models.Index(fields=["user", "is_confirmed"], name="mfa_device_user_conf_idx"),
        ),
        migrations.AddConstraint(
            model_name="mfadevice",
            constraint=models.UniqueConstraint(
                condition=models.Q(("device_type", "WEBAUTHN")),
                fields=("credential_id",),
                name="uq_mfa_webauthn_credential_id",
            ),
        ),
        migrations.AddIndex(
            model_name="mfarecoverycode",
            index=models.Index(fields=["user", "used_at"], name="mfa_recovery_user_used_idx"),
        ),
    ]
