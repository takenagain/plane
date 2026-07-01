# Third party imports
from rest_framework import serializers


class ProjectExportSerializer(serializers.Serializer):
    """Lightweight project metadata for workspace export manifests."""

    id = serializers.UUIDField()
    identifier = serializers.CharField()
    name = serializers.CharField()
    state_count = serializers.IntegerField()
