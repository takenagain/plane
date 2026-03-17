# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Third Party imports
from rest_framework import serializers

from plane.db.models import (
    CommentReaction,
    CycleIssue,
    FileAsset,
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    IssueLink,
    IssueReaction,
    IssueRelation,
    IssueVote,
    Label,
    ModuleIssue,
    User,
)
from plane.utils.content_validator import (
    validate_binary_data,
    validate_html_content,
)
from plane.utils.issue_recurrence import (
    compute_issue_recurrence_next_run_at,
    get_effective_issue_recurrence_values,
    get_issue_recurrence_validation_error,
    should_recompute_issue_recurrence,
)

# Module imports
from .base import BaseSerializer
from .cycle import CycleBaseSerializer
from .module import ModuleBaseSerializer
from .project import ProjectLiteSerializer
from .state import StateLiteSerializer, StateSerializer
from .user import UserLiteSerializer
from .workspace import WorkspaceLiteSerializer


class IssueStateFlatSerializer(BaseSerializer):
    state_detail = StateLiteSerializer(read_only=True, source="state")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")

    class Meta:
        model = Issue
        fields = ["id", "sequence_id", "name", "state_detail", "project_detail"]


class LabelSerializer(BaseSerializer):
    workspace_detail = WorkspaceLiteSerializer(source="workspace", read_only=True)
    project_detail = ProjectLiteSerializer(source="project", read_only=True)

    class Meta:
        model = Label
        fields = "__all__"
        read_only_fields = ["workspace", "project"]


class IssueProjectLiteSerializer(BaseSerializer):
    project_detail = ProjectLiteSerializer(source="project", read_only=True)

    class Meta:
        model = Issue
        fields = ["id", "project_detail", "name", "sequence_id"]
        read_only_fields = fields


class IssueRelationSerializer(BaseSerializer):
    issue_detail = IssueProjectLiteSerializer(read_only=True, source="related_issue")

    class Meta:
        model = IssueRelation
        fields = ["issue_detail", "relation_type", "related_issue", "issue", "id"]
        read_only_fields = ["workspace", "project"]


class RelatedIssueSerializer(BaseSerializer):
    issue_detail = IssueProjectLiteSerializer(read_only=True, source="issue")

    class Meta:
        model = IssueRelation
        fields = ["issue_detail", "relation_type", "related_issue", "issue", "id"]
        read_only_fields = ["workspace", "project"]


class IssueCycleDetailSerializer(BaseSerializer):
    cycle_detail = CycleBaseSerializer(read_only=True, source="cycle")

    class Meta:
        model = CycleIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssueModuleDetailSerializer(BaseSerializer):
    module_detail = ModuleBaseSerializer(read_only=True, source="module")

    class Meta:
        model = ModuleIssue
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


class IssueLinkSerializer(BaseSerializer):
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")

    class Meta:
        model = IssueLink
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "issue",
        ]

    # Validation if url already exists
    def create(self, validated_data):
        if IssueLink.objects.filter(url=validated_data.get("url"), issue_id=validated_data.get("issue_id")).exists():
            raise serializers.ValidationError({"error": "URL already exists for this Issue"})
        return IssueLink.objects.create(**validated_data)


class IssueAttachmentSerializer(BaseSerializer):
    class Meta:
        model = FileAsset
        fields = "__all__"
        read_only_fields = [
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "workspace",
            "project",
            "issue",
        ]


class IssueReactionSerializer(BaseSerializer):
    class Meta:
        model = IssueReaction
        fields = ["issue", "reaction", "workspace", "project", "actor"]
        read_only_fields = ["workspace", "project", "issue", "actor"]


class IssueSerializer(BaseSerializer):
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    state_detail = StateSerializer(read_only=True, source="state")
    parent_detail = IssueStateFlatSerializer(read_only=True, source="parent")
    label_details = LabelSerializer(read_only=True, source="labels", many=True)
    assignee_details = UserLiteSerializer(read_only=True, source="assignees", many=True)
    related_issues = IssueRelationSerializer(read_only=True, source="issue_relation", many=True)
    issue_relations = RelatedIssueSerializer(read_only=True, source="issue_related", many=True)
    issue_cycle = IssueCycleDetailSerializer(read_only=True)
    issue_module = IssueModuleDetailSerializer(read_only=True)
    issue_link = IssueLinkSerializer(read_only=True, many=True)
    issue_attachment = IssueAttachmentSerializer(read_only=True, many=True)
    sub_issues_count = serializers.IntegerField(read_only=True)
    time_logged = serializers.IntegerField(read_only=True)
    issue_reactions = IssueReactionSerializer(read_only=True, many=True)
    recurrence_source_issue_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Issue
        exclude = ["recurrence_source_issue"]
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "recurrence_generated_count",
            "recurrence_next_run_at",
            "recurrence_last_run_at",
            "recurrence_source_issue_id",
        ]


class IssueFlatSerializer(BaseSerializer):
    ## Contain only flat fields

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "description_json",
            "description_html",
            "priority",
            "start_date",
            "target_date",
            "sequence_id",
            "sort_order",
            "is_draft",
        ]


class CommentReactionLiteSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")

    class Meta:
        model = CommentReaction
        fields = ["id", "reaction", "comment", "actor_detail"]


class IssueCommentSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(read_only=True, source="actor")
    issue_detail = IssueFlatSerializer(read_only=True, source="issue")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    workspace_detail = WorkspaceLiteSerializer(read_only=True, source="workspace")
    comment_reactions = CommentReactionLiteSerializer(read_only=True, many=True)
    is_member = serializers.BooleanField(read_only=True)

    class Meta:
        model = IssueComment
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "issue",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


##TODO: Find a better way to write this serializer
## Find a better approach to save manytomany?
class IssueCreateSerializer(BaseSerializer):
    state_detail = StateSerializer(read_only=True, source="state")
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")
    project_detail = ProjectLiteSerializer(read_only=True, source="project")
    workspace_detail = WorkspaceLiteSerializer(read_only=True, source="workspace")

    assignees = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=User.objects.all()),
        write_only=True,
        required=False,
    )

    labels = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Label.objects.all()),
        write_only=True,
        required=False,
    )
    recurrence_source_issue_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Issue
        exclude = ["recurrence_source_issue"]
        read_only_fields = [
            "workspace",
            "project",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "recurrence_generated_count",
            "recurrence_next_run_at",
            "recurrence_last_run_at",
            "recurrence_source_issue_id",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["assignees"] = [str(assignee.id) for assignee in instance.assignees.all()]
        data["labels"] = [str(label.id) for label in instance.labels.all()]
        return data

    def validate(self, data):
        if (
            data.get("start_date", None) is not None
            and data.get("target_date", None) is not None
            and data.get("start_date", None) > data.get("target_date", None)
        ):
            raise serializers.ValidationError("Start date cannot exceed target date")

        # Validate description content for security
        if "description_html" in data and data["description_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(data["description_html"])
            if not is_valid:
                raise serializers.ValidationError({"error": "html content is not valid"})
            # Update the data with sanitized HTML if available
            if sanitized_html is not None:
                data["description_html"] = sanitized_html

        if "description_binary" in data and data["description_binary"]:
            is_valid, error_msg = validate_binary_data(data["description_binary"])
            if not is_valid:
                raise serializers.ValidationError({"description_binary": "Invalid binary data"})

        recurrence_values = get_effective_issue_recurrence_values(data, self.instance)
        recurrence_error = get_issue_recurrence_validation_error(**recurrence_values)
        if recurrence_error:
            raise serializers.ValidationError(recurrence_error)

        if should_recompute_issue_recurrence(data, self.instance):
            data["recurrence_next_run_at"] = compute_issue_recurrence_next_run_at(
                project_id=self.context.get("project_id") or getattr(self.instance, "project_id", None),
                **recurrence_values,
            )

        return data

    def create(self, validated_data):
        assignees = validated_data.pop("assignees", None)
        labels = validated_data.pop("labels", None)

        project_id = self.context["project_id"]
        workspace_id = self.context["workspace_id"]
        default_assignee_id = self.context["default_assignee_id"]

        issue = Issue.objects.create(**validated_data, project_id=project_id)

        # Issue Audit Users
        created_by_id = issue.created_by_id
        updated_by_id = issue.updated_by_id

        if assignees is not None and len(assignees):
            IssueAssignee.objects.bulk_create(
                [
                    IssueAssignee(
                        assignee=user,
                        issue=issue,
                        project_id=project_id,
                        workspace_id=workspace_id,
                        created_by_id=created_by_id,
                        updated_by_id=updated_by_id,
                    )
                    for user in assignees
                ],
                batch_size=10,
            )
        else:
            # Then assign it to default assignee
            if default_assignee_id is not None:
                IssueAssignee.objects.create(
                    assignee_id=default_assignee_id,
                    issue=issue,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    created_by_id=created_by_id,
                    updated_by_id=updated_by_id,
                )

        if labels is not None and len(labels):
            IssueLabel.objects.bulk_create(
                [
                    IssueLabel(
                        label=label,
                        issue=issue,
                        project_id=project_id,
                        workspace_id=workspace_id,
                        created_by_id=created_by_id,
                        updated_by_id=updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )

        return issue

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignees", None)
        labels = validated_data.pop("labels", None)

        # Related models
        project_id = instance.project_id
        workspace_id = instance.workspace_id
        created_by_id = instance.created_by_id
        updated_by_id = instance.updated_by_id

        if assignees is not None:
            IssueAssignee.objects.filter(issue=instance).delete()
            IssueAssignee.objects.bulk_create(
                [
                    IssueAssignee(
                        assignee=user,
                        issue=instance,
                        project_id=project_id,
                        workspace_id=workspace_id,
                        created_by_id=created_by_id,
                        updated_by_id=updated_by_id,
                    )
                    for user in assignees
                ],
                batch_size=10,
            )

        if labels is not None:
            IssueLabel.objects.filter(issue=instance).delete()
            IssueLabel.objects.bulk_create(
                [
                    IssueLabel(
                        label=label,
                        issue=instance,
                        project_id=project_id,
                        workspace_id=workspace_id,
                        created_by_id=created_by_id,
                        updated_by_id=updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )

        # Time updation occues even when other related models are updated
        instance.updated_at = timezone.now()
        return super().update(instance, validated_data)


class CommentReactionSerializer(BaseSerializer):
    class Meta:
        model = CommentReaction
        fields = "__all__"
        read_only_fields = ["workspace", "project", "comment", "actor"]


class IssueVoteSerializer(BaseSerializer):
    class Meta:
        model = IssueVote
        fields = ["issue", "vote", "workspace", "project", "actor"]
        read_only_fields = fields


class IssuePublicSerializer(BaseSerializer):
    reactions = IssueReactionSerializer(read_only=True, many=True, source="issue_reactions")
    votes = IssueVoteSerializer(read_only=True, many=True)
    module_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    label_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    assignee_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "sequence_id",
            "state",
            "project",
            "workspace",
            "priority",
            "target_date",
            "reactions",
            "votes",
            "module_ids",
            "created_by",
            "label_ids",
            "assignee_ids",
        ]
        read_only_fields = fields


class LabelLiteSerializer(BaseSerializer):
    class Meta:
        model = Label
        fields = ["id", "name", "color"]
