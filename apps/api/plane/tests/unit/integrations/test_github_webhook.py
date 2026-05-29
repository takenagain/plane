import hashlib
import hmac
import pytest

from plane.integrations.github.client import issue_has_plane_label, verify_webhook_signature
from plane.integrations.github.sync import handle_issue_webhook


@pytest.mark.unit
class TestGithubWebhookSignature:
    def test_verify_valid_signature(self):
        secret = "test-secret"
        payload = b'{"action":"opened"}'
        signature = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        assert verify_webhook_signature(payload, signature, secret) is True

    def test_verify_invalid_signature(self):
        assert verify_webhook_signature(b"{}", "sha256=deadbeef", "secret") is False


@pytest.mark.unit
class TestPlaneLabelGate:
    def test_issue_has_plane_label(self):
        payload = {"labels": [{"name": "bug"}, {"name": "Plane"}]}
        assert issue_has_plane_label(payload) is True

    def test_issue_missing_plane_label(self):
        payload = {"labels": [{"name": "bug"}]}
        assert issue_has_plane_label(payload) is False


@pytest.mark.unit
class TestHandleIssueWebhook:
    def test_skips_without_plane_label(self):
        payload = {
            "action": "opened",
            "issue": {"id": 1, "title": "Test", "labels": [{"name": "bug"}]},
            "repository": {"id": 99},
        }
        assert handle_issue_webhook(payload) is False
