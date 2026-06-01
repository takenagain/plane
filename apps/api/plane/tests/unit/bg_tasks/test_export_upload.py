import io
from unittest.mock import patch

import pytest

from plane.bgtasks.export_task import upload_to_s3
from plane.db.models import ExporterHistory


@pytest.mark.unit
@pytest.mark.django_db
def test_upload_to_s3_uses_storage_without_acl(workspace, create_user):
    zip_buffer = io.BytesIO(b"zip-bytes")
    exporter = ExporterHistory.objects.create(
        workspace=workspace,
        project=[],
        initiated_by=create_user,
        provider="csv",
        type="issue_exports",
    )

    with patch("plane.bgtasks.export_task.S3Storage") as storage_cls:
        storage = storage_cls.return_value
        storage.upload_export_zip.return_value = "https://example.com/uploads/export.zip?sig=1"

        upload_to_s3(zip_buffer, workspace.id, exporter.token, workspace.slug)

        storage.upload_export_zip.assert_called_once()
        _, object_name = storage.upload_export_zip.call_args[0]
        assert str(workspace.id) in object_name
        assert object_name.endswith(".zip")
        assert storage.upload_export_zip.call_args.kwargs["expiration"] == 7 * 24 * 60 * 60

    exporter.refresh_from_db()
    assert exporter.status == "completed"
    assert exporter.url == "https://example.com/uploads/export.zip?sig=1"
    assert exporter.key.endswith(".zip")


@pytest.mark.unit
@pytest.mark.django_db
def test_upload_to_s3_marks_failed_when_presign_missing(workspace, create_user):
    exporter = ExporterHistory.objects.create(
        workspace=workspace,
        project=[],
        initiated_by=create_user,
        provider="csv",
        type="issue_exports",
    )

    with patch("plane.bgtasks.export_task.S3Storage") as storage_cls:
        storage_cls.return_value.upload_export_zip.return_value = None
        upload_to_s3(io.BytesIO(b"zip"), workspace.id, exporter.token, workspace.slug)

    exporter.refresh_from_db()
    assert exporter.status == "failed"
