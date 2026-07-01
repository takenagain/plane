import io
from unittest.mock import MagicMock, patch

import pytest

from plane.settings.storage import S3Storage


@pytest.mark.unit
def test_upload_export_zip_does_not_set_object_acl(monkeypatch):
    monkeypatch.setenv("USE_MINIO", "1")
    monkeypatch.setenv("WEB_URL", "http://localhost:8081")
    monkeypatch.setenv("AWS_S3_ENDPOINT_URL", "http://plane-minio:9000")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "access-key")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secret-key")
    monkeypatch.setenv("AWS_S3_BUCKET_NAME", "uploads")

    init_client = MagicMock()
    upload_client = MagicMock()
    download_client = MagicMock()
    download_client.generate_presigned_url.return_value = "https://localhost:8081/uploads/export.zip?sig=1"

    with patch(
        "plane.settings.storage.boto3.client",
        side_effect=[init_client, upload_client, download_client],
    ) as client_factory:
        storage = S3Storage(request=None)
        url = storage.upload_export_zip(io.BytesIO(b"zip"), "ws/export.zip", expiration=3600)

    assert url == "https://localhost:8081/uploads/export.zip?sig=1"
    assert client_factory.call_count == 3
    upload_client.upload_fileobj.assert_called_once()
    extra_args = upload_client.upload_fileobj.call_args.kwargs["ExtraArgs"]
    assert extra_args == {"ContentType": "application/zip"}
    assert "ACL" not in extra_args

    upload_endpoint = client_factory.call_args_list[1].kwargs.get("endpoint_url")
    download_endpoint = client_factory.call_args_list[2].kwargs.get("endpoint_url")
    assert upload_endpoint == "http://plane-minio:9000"
    assert download_endpoint == "http://localhost:8081/"
