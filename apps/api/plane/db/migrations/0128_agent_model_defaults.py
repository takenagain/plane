# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0127_agent_models"),
    ]

    operations = [
        migrations.AlterField(
            model_name="agentconfiguration",
            name="model",
            field=models.CharField(default="gpt-5.5", max_length=100),
        ),
        migrations.AlterField(
            model_name="agentconfiguration",
            name="max_steps",
            field=models.PositiveSmallIntegerField(default=25),
        ),
    ]
