from plane.db.models import Intake, IntakeIssue, Issue, Project, ProjectMember, State, StateGroup
from plane.db.models.intake import SourceType
from plane.db.models.project import ROLE

INTAKE_STATUS_LABELS = {
    -2: "pending",
    -1: "rejected",
    0: "snoozed",
    1: "accepted",
    2: "duplicate",
}


def _can_access_project(request_user, project_id: str, *, write: bool = False) -> bool:
    roles = [ROLE.ADMIN.value, ROLE.MEMBER.value] if write else [ROLE.ADMIN.value, ROLE.MEMBER.value, ROLE.GUEST.value]
    return ProjectMember.objects.filter(
        project_id=project_id,
        member=request_user,
        role__in=roles,
        is_active=True,
    ).exists()


def _get_or_create_intake(workspace_slug: str, project: Project) -> Intake:
    intake = Intake.objects.filter(workspace__slug=workspace_slug, project_id=project.id).first()
    if intake:
        return intake
    return Intake.objects.create(
        workspace_id=project.workspace_id,
        project_id=project.id,
        name="Intake",
        is_default=True,
    )


def _get_or_create_triage_state(workspace_slug: str, project: Project) -> State:
    triage_state = State.triage_objects.filter(project_id=project.id, workspace__slug=workspace_slug).first()
    if triage_state:
        return triage_state
    return State.objects.create(
        name="Triage",
        group=StateGroup.TRIAGE.value,
        project_id=project.id,
        workspace_id=project.workspace_id,
        color="#4E5355",
        sequence=65000,
        default=False,
    )


def _serialize_intake_issue(intake_issue: IntakeIssue) -> dict:
    issue = intake_issue.issue
    return {
        "intake_issue_id": str(intake_issue.id),
        "issue_id": str(issue.id),
        "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
        "name": issue.name,
        "status": INTAKE_STATUS_LABELS.get(intake_issue.status, str(intake_issue.status)),
        "priority": issue.priority,
    }


def list_intake_issues(
    request_user,
    workspace_slug: str,
    project_id: str,
    status: str | None = None,
    limit: int = 20,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id):
        return {"count": 0, "intake_issues": []}

    intake = Intake.objects.filter(workspace__slug=workspace_slug, project_id=project_id).first()
    if not intake:
        return {"count": 0, "intake_issues": []}

    qs = (
        IntakeIssue.objects.filter(intake_id=intake.id, project_id=project_id, deleted_at__isnull=True)
        .select_related("issue", "issue__project")
        .order_by("-created_at")
    )

    if status:
        status_map = {label: code for code, label in INTAKE_STATUS_LABELS.items()}
        status_codes = [status_map.get(s.strip(), s.strip()) for s in status.split(",")]
        parsed_codes = []
        for code in status_codes:
            try:
                parsed_codes.append(int(code))
            except (TypeError, ValueError):
                continue
        if parsed_codes:
            qs = qs.filter(status__in=parsed_codes)
    else:
        qs = qs.filter(status=-2)

    capped = max(1, min(limit or 20, 100))
    intake_issues = list(qs[:capped])
    return {
        "count": len(intake_issues),
        "intake_issues": [_serialize_intake_issue(ii) for ii in intake_issues],
    }


def create_intake_issue(
    request_user,
    workspace_slug: str,
    project_id: str,
    name: str,
    description: str = "",
    priority: str = "none",
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to create intake issues in this project.")

    project = Project.objects.filter(id=project_id, workspace__slug=workspace_slug).first()
    if not project:
        raise ValueError("Project not found.")

    triage_state = _get_or_create_triage_state(workspace_slug, project)
    intake = _get_or_create_intake(workspace_slug, project)

    issue = Issue.objects.create(
        workspace_id=project.workspace_id,
        project_id=project_id,
        state_id=triage_state.id,
        name=name,
        description_html=description or "<p></p>",
        priority=priority,
        created_by=request_user,
        updated_by=request_user,
    )
    intake_issue = IntakeIssue.objects.create(
        intake_id=intake.id,
        project_id=project_id,
        issue_id=issue.id,
        source=SourceType.IN_APP,
        created_by=request_user,
        updated_by=request_user,
    )
    return {
        "created": True,
        "intake_issue": _serialize_intake_issue(intake_issue),
    }


def update_intake_issue(
    request_user,
    workspace_slug: str,
    project_id: str,
    issue_id: str,
    status: str | None = None,
    name: str | None = None,
    description: str | None = None,
    **kwargs,
) -> dict:
    if not _can_access_project(request_user, project_id, write=True):
        raise PermissionError("You do not have permission to update intake issues in this project.")

    intake = Intake.objects.filter(workspace__slug=workspace_slug, project_id=project_id).first()
    if not intake:
        raise ValueError("Intake not found.")

    intake_issue = (
        IntakeIssue.objects.filter(
            intake_id=intake.id,
            project_id=project_id,
            issue_id=issue_id,
            deleted_at__isnull=True,
        )
        .select_related("issue", "issue__project")
        .first()
    )
    if not intake_issue:
        raise ValueError("Intake issue not found.")

    if name is not None:
        intake_issue.issue.name = name
    if description is not None:
        intake_issue.issue.description_html = description
    if name is not None or description is not None:
        intake_issue.issue.save()

    if status is not None:
        status_map = {label: code for code, label in INTAKE_STATUS_LABELS.items()}
        status_code = status_map.get(status.lower(), status)
        try:
            intake_issue.status = int(status_code)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid intake status: {status}") from exc
        intake_issue.save()

    return {"updated": True, "intake_issue": _serialize_intake_issue(intake_issue)}
