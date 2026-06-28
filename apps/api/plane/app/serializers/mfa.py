# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import MFADevice, UserMFA
from .base import BaseSerializer


class MFADeviceSerializer(BaseSerializer):
    """Public, non-sensitive view of a single second factor.

    Never exposes the encrypted TOTP secret, the WebAuthn public key, or the
    raw credential id.
    """

    class Meta:
        model = MFADevice
        fields = [
            "id",
            "device_type",
            "name",
            "is_confirmed",
            "attachment",
            "transports",
            "aaguid",
            "device_class",
            "backed_up",
            "is_hardware_security_key",
            "last_used_at",
            "created_at",
        ]
        read_only_fields = fields


class UserMFASerializer(BaseSerializer):
    """Current MFA state: status + device list + lockdown eligibility."""

    devices = serializers.SerializerMethodField()
    hardware_key_count = serializers.SerializerMethodField()
    lockdown_eligible = serializers.SerializerMethodField()

    class Meta:
        model = UserMFA
        fields = [
            "id",
            "is_enabled",
            "is_enforced",
            "enabled_at",
            "last_verified_at",
            "devices",
            "hardware_key_count",
            "lockdown_eligible",
        ]
        read_only_fields = fields

    def _confirmed_devices(self, obj):
        # Prefer a prefetched / passed-in device list to avoid extra queries.
        devices = self.context.get("devices")
        if devices is None:
            devices = list(MFADevice.objects.filter(user_id=obj.user_id, is_confirmed=True))
        return devices

    def get_devices(self, obj):
        return MFADeviceSerializer(self._confirmed_devices(obj), many=True).data

    def get_hardware_key_count(self, obj):
        return sum(1 for d in self._confirmed_devices(obj) if d.is_hardware_security_key)

    def get_lockdown_eligible(self, obj):
        return self.get_hardware_key_count(obj) >= 2
