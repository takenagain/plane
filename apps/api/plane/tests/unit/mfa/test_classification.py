# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Hardware-security-key vs passkey classification tests (R3)."""

import pytest

from plane.authentication.utils import mfa as mfa_utils


@pytest.mark.unit
class TestClassification:
    def test_yubikey_is_hardware_security_key(self):
        # cross-platform + roaming transport + single-device + not backed up.
        assert (
            mfa_utils.classify_authenticator(
                attachment="cross-platform",
                transports=["usb"],
                device_class="single",
                backed_up=False,
            )
            is True
        )

    def test_nfc_yubikey_is_hardware_security_key(self):
        assert (
            mfa_utils.classify_authenticator(
                attachment="cross-platform",
                transports=["nfc"],
                device_class="single",
                backed_up=False,
            )
            is True
        )

    def test_platform_touch_id_passkey_is_not_hardware(self):
        assert (
            mfa_utils.classify_authenticator(
                attachment="platform",
                transports=["internal"],
                device_class="multi",
                backed_up=True,
            )
            is False
        )

    def test_backed_up_synced_passkey_is_not_hardware(self):
        # Even cross-platform + usb, a backed-up multi-device credential is a
        # synced passkey, not a discrete security key.
        assert (
            mfa_utils.classify_authenticator(
                attachment="cross-platform",
                transports=["usb"],
                device_class="multi",
                backed_up=True,
            )
            is False
        )

    def test_no_roaming_transport_is_not_hardware(self):
        assert (
            mfa_utils.classify_authenticator(
                attachment="cross-platform",
                transports=["internal"],
                device_class="single",
                backed_up=False,
            )
            is False
        )

    def test_device_type_mapping(self):
        assert mfa_utils._device_type_to_class("single_device") == "single"
        assert mfa_utils._device_type_to_class("multi_device") == "multi"
