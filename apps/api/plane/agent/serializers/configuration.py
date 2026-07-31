from rest_framework import serializers

from plane.agent.catalog import get_default_model, get_model, get_provider
from plane.db.models import AgentConfiguration
from plane.license.utils.encryption import encrypt_data


class AgentConfigSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=False)
    api_key_set = serializers.SerializerMethodField()
    default_model = serializers.SerializerMethodField()
    available_models = serializers.SerializerMethodField()
    available_model_details = serializers.SerializerMethodField()

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

    def get_default_model(self, instance: AgentConfiguration) -> str:
        return get_default_model(instance.provider)

    def get_available_models(self, instance: AgentConfiguration) -> list[str]:
        provider = get_provider(instance.provider)
        if not provider:
            return []
        return [model.id for model in provider.models]

    def get_available_model_details(self, instance: AgentConfiguration) -> list[dict]:
        provider = get_provider(instance.provider)
        if not provider:
            return []
        return [model.to_public_dict() for model in provider.models]

    def validate_provider(self, value: str) -> str:
        if not get_provider(value):
            raise serializers.ValidationError(f"Unsupported provider: {value}")
        return value

    def validate(self, attrs):
        provider = attrs.get("provider", getattr(self.instance, "provider", "openai"))
        model = attrs.get(
            "model",
            getattr(self.instance, "model", get_default_model(provider)),
        )
        if self.instance is None and "model" not in attrs:
            attrs["model"] = model
        if not get_model(provider, model):
            raise serializers.ValidationError({"model": f"Model is not supported by {provider}."})
        return attrs

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
