from django.urls import path

from plane.integrations.github.webhooks import GithubWebhookEndpoint
from plane.integrations.sentry.views import SentryWebhookEndpoint

urlpatterns = [
    path("github/", GithubWebhookEndpoint.as_view(), name="github-webhook"),
    path("sentry/", SentryWebhookEndpoint.as_view(), name="sentry-webhook"),
]
