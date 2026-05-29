from rest_framework import serializers

from plane.db.models import Label, Page, PageLabel, Workspace
from .page import PageDetailSerializer, PageSerializer


class WikiPageSerializer(PageSerializer):
    is_global = serializers.BooleanField(read_only=True)

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ["is_global"]
        read_only_fields = PageSerializer.Meta.read_only_fields + ["is_global"]

    def create(self, validated_data):
        labels = validated_data.pop("labels", None)
        owned_by_id = self.context["owned_by_id"]
        workspace_slug = self.context["workspace_slug"]
        description_json = self.context.get("description_json", {})
        description_binary = self.context.get("description_binary")
        description_html = self.context.get("description_html", "<p></p>")

        workspace = Workspace.objects.get(slug=workspace_slug)

        page = Page.objects.create(
            **validated_data,
            description_json=description_json,
            description_binary=description_binary,
            description_html=description_html,
            owned_by_id=owned_by_id,
            workspace_id=workspace.id,
            is_global=True,
        )

        if labels is not None:
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=page,
                        workspace_id=page.workspace_id,
                        created_by_id=page.created_by_id,
                        updated_by_id=page.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )

        return page


class WikiPageDetailSerializer(PageDetailSerializer):
    is_global = serializers.BooleanField(read_only=True)

    class Meta(PageDetailSerializer.Meta):
        fields = PageDetailSerializer.Meta.fields + ["is_global"]
