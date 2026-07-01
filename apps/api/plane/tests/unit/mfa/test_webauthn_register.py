# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""WebAuthn registration ceremony tests (R15) — authenticator I/O mocked."""

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
class TestWebAuthnRegistrationOptions:
    def test_begin_returns_options_with_challenge(self):
        options, challenge = mfa_utils.build_registration_options(
            user_id="00000000-0000-0000-0000-000000000001",
            user_name="alice@example.com",
            user_display_name="Alice",
            attachment="cross-platform",
        )
        assert isinstance(challenge, bytes) and len(challenge) > 0
        assert options.challenge == challenge
        # Serialisable to spec JSON for the browser.
        as_dict = mfa_utils.options_to_dict(options)
        assert "challenge" in as_dict
        assert as_dict["rp"]["id"]


@pytest.mark.unit
class TestExpectedOrigins:
    def test_accepts_both_schemes_for_https_config(self):
        assert mfa_utils._expected_origins("https://plan.example.com") == [
            "https://plan.example.com",
            "http://plan.example.com",
        ]

    def test_accepts_both_schemes_for_http_config(self):
        assert mfa_utils._expected_origins("http://localhost:3000") == [
            "http://localhost:3000",
            "https://localhost:3000",
        ]


@pytest.mark.unit
class TestWebAuthnRegistrationVerify:
    def _fake_verification(self):
        return SimpleNamespace(
            credential_id=b"\x01\x02\x03",
            credential_public_key=b"\x04\x05\x06",
            sign_count=7,
            aaguid="aaguid-test",
            credential_device_type="single_device",
            credential_backed_up=False,
        )

    def test_verify_persists_expected_fields(self):
        with patch.object(
            mfa_utils, "verify_registration_response", return_value=self._fake_verification()
        ):
            result = mfa_utils.verify_registration(
                credential="{}",
                expected_challenge=b"challenge",
            )
        assert result["credential_id"] == bytes_to_base64url(b"\x01\x02\x03")
        assert result["public_key"] == bytes_to_base64url(b"\x04\x05\x06")
        assert result["sign_count"] == 7
        assert result["aaguid"] == "aaguid-test"
        assert result["device_class"] == "single"
        assert result["backed_up"] is False

    def test_attestation_failure_falls_back_to_trust_on_use(self):
        from webauthn.helpers.exceptions import InvalidRegistrationResponse

        with patch.object(
            mfa_utils,
            "verify_registration_response",
            side_effect=InvalidRegistrationResponse("Attestation statement could not be verified"),
        ), patch.object(
            mfa_utils,
            "_verify_registration_trust_on_use",
            return_value=self._fake_verification(),
        ) as trust_on_use:
            result = mfa_utils.verify_registration(
                credential="{}",
                expected_challenge=b"challenge",
            )
        trust_on_use.assert_called_once()
        assert result["credential_id"] == bytes_to_base64url(b"\x01\x02\x03")


@pytest.mark.unit
class TestChallengeStore:
    def test_store_and_consume_round_trip(self):
        challenge = b"\x10\x11\x12\x13"
        mfa_utils.store_challenge("register", "unit-test-id", challenge)
        consumed = mfa_utils.consume_challenge("register", "unit-test-id")
        assert consumed == challenge

    def test_challenge_is_single_use(self):
        challenge = b"\x20\x21\x22"
        mfa_utils.store_challenge("register", "unit-test-id-2", challenge)
        assert mfa_utils.consume_challenge("register", "unit-test-id-2") == challenge
        # Second consume returns None (single-use).
        assert mfa_utils.consume_challenge("register", "unit-test-id-2") is None
