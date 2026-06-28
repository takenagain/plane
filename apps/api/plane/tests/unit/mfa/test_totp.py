# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""TOTP generation / verification / drift-window tests (R11, R14)."""

import re

import pyotp
import pytest

from plane.authentication.utils import mfa as mfa_utils


@pytest.mark.unit
class TestTOTP:
    def test_secret_is_base32(self):
        secret = mfa_utils.generate_totp_secret()
        # pyotp.random_base32() returns a 32-char base32 secret.
        assert len(secret) == 32
        assert re.fullmatch(r"[A-Z2-7]+", secret)

    def test_provisioning_uri(self):
        secret = mfa_utils.generate_totp_secret()
        uri = mfa_utils.get_totp_provisioning_uri(secret, "alice@example.com", issuer_name="Plane")
        assert uri.startswith("otpauth://totp/")
        assert "issuer=Plane" in uri
        assert secret in uri

    def test_verify_current_code(self):
        secret = mfa_utils.generate_totp_secret()
        code = pyotp.TOTP(secret).now()
        assert mfa_utils.verify_totp(secret, code) is True

    def test_drift_plus_minus_one_step_accepted(self):
        secret = mfa_utils.generate_totp_secret()
        totp = pyotp.TOTP(secret)
        import time

        now = time.time()
        # ±1 step (±30s) is within the default window.
        assert mfa_utils.verify_totp(secret, totp.at(now - 30)) is True
        assert mfa_utils.verify_totp(secret, totp.at(now + 30)) is True

    def test_drift_two_steps_rejected(self):
        secret = mfa_utils.generate_totp_secret()
        totp = pyotp.TOTP(secret)
        import time

        now = time.time()
        # ±2 steps (±60s) is outside the ±1 window.
        assert mfa_utils.verify_totp(secret, totp.at(now - 60)) is False
        assert mfa_utils.verify_totp(secret, totp.at(now + 60)) is False

    def test_wrong_code_rejected(self):
        secret = mfa_utils.generate_totp_secret()
        assert mfa_utils.verify_totp(secret, "000000") is False or mfa_utils.verify_totp(secret, "111111") is False

    def test_empty_inputs_rejected(self):
        assert mfa_utils.verify_totp("", "123456") is False
        assert mfa_utils.verify_totp(mfa_utils.generate_totp_secret(), "") is False
