# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Recovery-code generation / hashing / single-use tests (R13, R16, NFR8)."""

import re

import pytest

from plane.authentication.utils import mfa as mfa_utils


@pytest.mark.unit
class TestRecoveryCodes:
    def test_default_count_and_format(self):
        codes = mfa_utils.generate_recovery_codes()
        assert len(codes) == mfa_utils.RECOVERY_CODE_COUNT
        for code in codes:
            assert re.fullmatch(r"[A-Z2-9]{5}-[A-Z2-9]{5}", code)
        # Codes are unique within a set.
        assert len(set(codes)) == len(codes)

    def test_custom_count(self):
        assert len(mfa_utils.generate_recovery_codes(count=6)) == 6

    def test_hash_is_not_plaintext(self):
        code = mfa_utils.generate_recovery_codes(count=1)[0]
        code_hash = mfa_utils.hash_recovery_code(code)
        assert code not in code_hash
        assert code_hash != code

    def test_verify_matches(self):
        code = mfa_utils.generate_recovery_codes(count=1)[0]
        code_hash = mfa_utils.hash_recovery_code(code)
        assert mfa_utils.verify_recovery_code(code, code_hash) is True

    def test_verify_is_case_and_dash_insensitive(self):
        code = mfa_utils.generate_recovery_codes(count=1)[0]
        code_hash = mfa_utils.hash_recovery_code(code)
        # Display formatting / casing must not affect verification.
        assert mfa_utils.verify_recovery_code(code.lower(), code_hash) is True
        assert mfa_utils.verify_recovery_code(code.replace("-", ""), code_hash) is True

    def test_wrong_code_rejected(self):
        code = mfa_utils.generate_recovery_codes(count=1)[0]
        code_hash = mfa_utils.hash_recovery_code(code)
        assert mfa_utils.verify_recovery_code("AAAAA-BBBBB", code_hash) is False
