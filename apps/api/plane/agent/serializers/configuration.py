from rest_framework import serializers

from plane.app.views.external.base import SUPPORTED_PROVIDERS
from plane.db.models import AgentConfiguration
from plane.license.utils.encryption import encrypt_data


class AgentConfigSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=False)
    api_key_set = serializers.SerializerMethodField()
    available_models = serializers.SerializerMethodField()

    class Meta:
        model = AgentConfiguration
        exclude = ["api_key_encrypted"]

    def get_api_key_set(self, instance: AgentConfiguration) -> bool:
        return bool(instance.api_key_encrypted)

    def get_available_models(self, instance: AgentConfiguration) -> list[str]:
        provider_cls = SUPPORTED_PROVIDERS.get(instance.provider)
        if not provider_cls:
            return []
        return list(getattr(provider_cls, "models", []) or [])

    def create(self, validated_data):
        api_key = validated_data.pop("api_key", None)
        if api_key:
            validated_data["api_key_encrypted"] = encrypt_data(api_key)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        if api_key:
            validated_data["api_key_encrypted"] = encrypt_data(api_key)
        return super().update(instance, validated_data)
