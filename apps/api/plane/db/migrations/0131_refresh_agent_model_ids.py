from django.db import migrations, models


SUPPORTED_MODELS = {
    "openai": {
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5",
    },
    "anthropic": {
        "claude-fable-5",
        "claude-opus-5",
        "claude-opus-4-8",
        "claude-sonnet-5",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    },
    "gemini": {
        "gemini-3.1-pro-preview",
        "gemini-2.5-pro",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
    },
    "mistral": {
        "mistral-medium-3-5",
        "mistral-small-2603",
        "mistral-large-2512",
    },
}

DEFAULT_MODELS = {
    "openai": "gpt-5.6-sol",
    "anthropic": "claude-sonnet-5",
    "gemini": "gemini-3.6-flash",
    "mistral": "mistral-small-2603",
}

REPLACEMENTS = {
    "openai": {
        "gpt-4o-mini": "gpt-5.6-luna",
        "gpt-5.5-mini": "gpt-5.6-terra",
        "gpt-5.5-nano": "gpt-5.6-luna",
        "gpt-5.5-pro": "gpt-5.6-sol",
    },
    "anthropic": {
        "claude-opus-4-7": "claude-opus-4-8",
    },
    "gemini": {
        "gemini-3-flash-preview": "gemini-3.6-flash",
        "gemini-3.1-flash-lite-preview": "gemini-3.5-flash-lite",
        "gemini-2.0-flash": "gemini-3.6-flash",
        "gemini-2.0-flash-lite": "gemini-3.5-flash-lite",
    },
    "mistral": {
        "mistral-medium-3.5": "mistral-medium-3-5",
        "mistral-small-4": "mistral-small-2603",
        "mistral-large-3-2512": "mistral-large-2512",
    },
}


def refresh_agent_model_ids(apps, schema_editor):
    AgentConfiguration = apps.get_model("db", "AgentConfiguration")

    for provider, replacements in REPLACEMENTS.items():
        for old_model, new_model in replacements.items():
            AgentConfiguration.objects.filter(
                provider=provider,
                model=old_model,
            ).update(model=new_model)

    for provider, supported_models in SUPPORTED_MODELS.items():
        AgentConfiguration.objects.filter(provider=provider).exclude(model__in=supported_models).update(
            model=DEFAULT_MODELS[provider]
        )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0130_user_mfa"),
    ]

    operations = [
        migrations.RunPython(refresh_agent_model_ids, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="agentconfiguration",
            name="model",
            field=models.CharField(default="gpt-5.6-sol", max_length=100),
        ),
    ]
