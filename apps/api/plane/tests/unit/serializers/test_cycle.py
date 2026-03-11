# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from types import SimpleNamespace
from uuid import uuid4

import pytest

from plane.api.serializers.cycle import CycleCreateSerializer


@pytest.mark.unit
class TestCycleCreateSerializer:
    @pytest.mark.django_db
    def test_validate_requires_project_id(self, create_user):
        serializer = CycleCreateSerializer(
            data={"name": "Cycle without project"},
            context={"request": SimpleNamespace(user=create_user)},
        )

        assert not serializer.is_valid()
        assert serializer.errors["non_field_errors"] == ["Project ID is required"]

    @pytest.mark.django_db
    def test_validate_reports_missing_project(self, create_user):
        serializer = CycleCreateSerializer(
            data={"name": "Cycle missing project", "project_id": str(uuid4())},
            context={"request": SimpleNamespace(user=create_user)},
        )

        assert not serializer.is_valid()
        assert serializer.errors["non_field_errors"] == ["Project not found"]
