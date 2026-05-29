from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.views import BaseAPIView
from plane.integrations.config import get_github_app_credentials, is_github_sync_enabled
from plane.integrations.github.client import verify_webhook_signature
from plane.integrations.github.sync import handle_issue_webhook
from plane.utils.exception_logger import log_exception


class GithubWebhookEndpoint(BaseAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        if not is_github_sync_enabled():
            return Response(status=status.HTTP_403_FORBIDDEN)

        _, _, webhook_secret = get_github_app_credentials()
        signature = request.headers.get("X-Hub-Signature-256")
        if not verify_webhook_signature(request.body, signature, webhook_secret or ""):
            return Response({"error": "Invalid signature"}, status=status.HTTP_403_FORBIDDEN)

        event = request.headers.get("X-GitHub-Event", "")
        payload = request.data

        try:
            if event == "issues":
                handle_issue_webhook(payload)
            elif event == "ping":
                pass
        except Exception as exc:
            log_exception(exc)

        return Response({"status": "ok"}, status=status.HTTP_200_OK)
