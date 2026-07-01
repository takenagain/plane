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
        read_only_fields = [
            "id",
            "workspace",
            "project",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]

    def get_api_key_set(self, instance: AgentConfiguration) -> bool:
        return bool(instance.api_key_encrypted)

    def get_available_models(self, instance: AgentConfiguration) -> list[str]:
        provider_cls = SUPPORTED_PROVIDERS.get(instance.provider)
        if not provider_cls:
            return []
        return list(getattr(provider_cls, "models", []) or [])

    def validate_provider(self, value: str) -> str:
        if value not in SUPPORTED_PROVIDERS:
            raise serializers.ValidationError(f"Unsupported provider: {value}")
        return value

    def validate_max_steps(self, value: int | None) -> int | None:
        if value is None:
            return value
        return max(1, min(50, value))

    def _encrypt_api_key(self, api_key: str) -> str:
        encrypted = encrypt_data(api_key)
        if not encrypted:
            raise serializers.ValidationError({"api_key": "Failed to encrypt API key."})
        return encrypted

    def create(self, validated_data):
        api_key = validated_data.pop("api_key", None)
        if api_key:
            validated_data["api_key_encrypted"] = self._encrypt_api_key(api_key)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        new_provider = validated_data.get("provider")
        if api_key:
            validated_data["api_key_encrypted"] = self._encrypt_api_key(api_key)
        elif new_provider is not None and new_provider != instance.provider:
            validated_data["api_key_encrypted"] = ""
        return super().update(instance, validated_data)
