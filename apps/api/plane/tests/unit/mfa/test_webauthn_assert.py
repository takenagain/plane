# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WebAuthn assertion / replay-protection tests (R12, NFR2) — I/O mocked."""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from plane.authentication.utils import mfa as mfa_utils
from webauthn.helpers import bytes_to_base64url


@pytest.fixture(autouse=True)
def _mock_rp_config():
    with patch.object(
        mfa_utils,
        "get_webauthn_rp_config",
        return_value=("localhost", "Plane", "http://localhost"),
    ):
        yield


@pytest.mark.unit
class TestWebAuthnAuthentication:
    def test_valid_assertion_returns_new_sign_count(self):
        with patch.object(
            mfa_utils,
            "verify_authentication_response",
            return_value=SimpleNamespace(new_sign_count=42),
        ):
            new_count = mfa_utils.verify_authentication(
                credential="{}",
                expected_challenge=b"challenge",
                public_key=bytes_to_base64url(b"\x01"),
                current_sign_count=41,
            )
        assert new_count == 42

    def test_zero_counter_tolerated(self):
        # Many platform authenticators always report 0; that is allowed.
        with patch.object(
            mfa_utils,
            "verify_authentication_response",
            return_value=SimpleNamespace(new_sign_count=0),
        ):
            new_count = mfa_utils.verify_authentication(
                credential="{}",
                expected_challenge=b"challenge",
                public_key=bytes_to_base64url(b"\x01"),
                current_sign_count=0,
            )
        assert new_count == 0

    def test_stale_counter_rejected(self):
        # py_webauthn raises when the returned counter is not greater than the
        # stored one (clone / replay). The helper propagates the exception.
        from webauthn.helpers.exceptions import InvalidAuthenticationResponse

        with patch.object(
            mfa_utils,
            "verify_authentication_response",
            side_effect=InvalidAuthenticationResponse("counter did not increase"),
        ):
            with pytest.raises(InvalidAuthenticationResponse):
                mfa_utils.verify_authentication(
                    credential="{}",
                    expected_challenge=b"challenge",
                    public_key=bytes_to_base64url(b"\x01"),
                    current_sign_count=100,
                )

    def test_bad_origin_rejected(self):
        from webauthn.helpers.exceptions import InvalidAuthenticationResponse

        with patch.object(
            mfa_utils,
            "verify_authentication_response",
            side_effect=InvalidAuthenticationResponse("origin mismatch"),
        ):
            with pytest.raises(InvalidAuthenticationResponse):
                mfa_utils.verify_authentication(
                    credential="{}",
                    expected_challenge=b"challenge",
                    public_key=bytes_to_base64url(b"\x01"),
                    current_sign_count=1,
                )

    def test_extract_credential_id_from_json(self):
        assert mfa_utils.extract_credential_id('{"id": "abc123"}') == "abc123"
        assert mfa_utils.extract_credential_id({"id": "xyz"}) == "xyz"
        assert mfa_utils.extract_credential_id("not-json") is None
