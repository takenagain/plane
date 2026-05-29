from django.urls import re_path

from plane.consumers.user_time_analytics import UserTimeAnalyticsConsumer

websocket_urlpatterns = [
    re_path(
        r"^ws/workspaces/(?P<slug>[-\w]+)/user-time-analytics/(?P<user_id>[0-9a-f-]+)/$",
        UserTimeAnalyticsConsumer.as_asgi(),
    ),
]
