# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""TOTP-secret encryption-at-rest tests (NFR1, R8)."""

import pytest

from plane.authentication.utils import mfa as mfa_utils


@pytest.mark.unit
class TestSecretEncryption:
    def test_round_trip(self):
        secret = mfa_utils.generate_totp_secret()
        encrypted = mfa_utils.encrypt_secret(secret)
        assert mfa_utils.decrypt_secret(encrypted) == secret

    def test_ciphertext_is_not_plaintext(self):
        secret = mfa_utils.generate_totp_secret()
        encrypted = mfa_utils.encrypt_secret(secret)
        # The stored value must be ciphertext, never the base32 secret.
        assert encrypted != secret
        assert secret not in encrypted

    def test_empty_secret(self):
        assert mfa_utils.encrypt_secret("") == ""
        assert mfa_utils.decrypt_secret("") == ""
