# Time Tracking (Worklog) — Technical Design

> **Feature:** Time Tracking / Worklogs for Plane Community Edition
> **Status:** Draft
> **Last Updated:** 2025-02-18
> **Related:** [requirements.md](./requirements.md) · [tasks.md](./tasks.md) · [ARCHITECTURE.md](../../../ARCHITECTURE.md) · [ACTIVATION.md](../../../ACTIVATION.md)

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
  - [1.1 Module Substitution Strategy](#11-module-substitution-strategy)
  - [1.2 System Context Diagram](#12-system-context-diagram)
- [2. Backend Design](#2-backend-design)
  - [2.1 Data Model](#21-data-model)
  - [2.2 Migration](#22-migration)
  - [2.3 Serializer](#23-serializer)
  - [2.4 ViewSet & Endpoints](#24-viewset--endpoints)
  - [2.5 URL Routing](#25-url-routing)
  - [2.6 Permissions](#26-permissions)
  - [2.7 Activity Tracking](#27-activity-tracking)
  - [2.8 Cascading Deletes & Referential Integrity](#28-cascading-deletes--referential-integrity)
- [3. Frontend Design](#3-frontend-design)
  - [3.1 Type Definitions](#31-type-definitions)
  - [3.2 API Service](#32-api-service)
  - [3.3 MobX Store](#33-mobx-store)
  - [3.4 Component Architecture](#34-component-architecture)
  - [3.5 Extended Directory Structure](#35-extended-directory-structure)
  - [3.6 Store Wiring](#36-store-wiring)
- [4. Data Flow](#4-data-flow)
  - [4.1 Create Worklog Flow](#41-create-worklog-flow)
  - [4.2 Issue Detail Load Flow](#42-issue-detail-load-flow)
- [5. API Contract](#5-api-contract)
  - [5.1 Create Worklog](#51-create-worklog)
  - [5.2 List Worklogs](#52-list-worklogs)
  - [5.3 Get Total Duration](#53-get-total-duration)
  - [5.4 Update Worklog](#54-update-worklog)
  - [5.5 Delete Worklog](#55-delete-worklog)
- [6. Error Handling](#6-error-handling)
- [7. Testing Strategy](#7-testing-strategy)
- [8. Migration & Rollback](#8-migration--rollback)
- [9. Future Considerations](#9-future-considerations)

---

## 1. Architecture Overview

### 1.1 Module Substitution Strategy

Plane CE uses a compile-time module alias (`@/plane-web/*` → `./ce/*`) to provide stub implementations for paid features. Our approach creates a parallel `extended/` directory that replaces these stubs with real implementations while leaving `ce/` untouched for clean upstream merges.

```
apps/web/
├── ce/                          ← UNTOUCHED (upstream CE stubs)
│   └── components/issues/worklog/
│       ├── property/root.tsx        → <></>
│       ├── activity/root.tsx        → <></>
│       └── activity/worklog-create-button.tsx → <></>
│
├── extended/                    ← NEW (real implementations)
│   ├── components/issues/worklog/
│   │   ├── property/root.tsx        → IssueWorklogProperty (real)
│   │   ├── activity/root.tsx        → IssueActivityWorklog (real)
│   │   ├── activity/worklog-create-button.tsx → real button
│   │   ├── activity/filter-root.tsx → with worklog filter
│   │   └── activity/worklog-form.tsx → NEW creation/edit form
│   └── store/
│       └── root.store.ts           → extends CoreRootStore + WorklogStore
│
├── core/                        ← UNTOUCHED (shared core code)
│   └── store/root.store.ts         → CoreRootStore
│
└── tsconfig.json                ← MODIFIED: @/plane-web/* → ./extended/*
```

**tsconfig.json change:**

```json
{
  "compilerOptions": {
    "paths": {
      "@/plane-web/*": ["./extended/*"],
      "@/*": ["./core/*"]
    }
  }
}
```

### 1.2 System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Browser (React App)                          │
│                                                                         │
│  ┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │ IssueWorklog     │   │ IssueActivity    │   │ IssueActivity      │  │
│  │ Property         │   │ Worklog          │   │ WorklogCreate      │  │
│  │ (sidebar badge)  │   │ (feed entry)     │   │ Button + Form      │  │
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬───────────┘  │
│           │                      │                       │              │
│           └──────────┬───────────┴───────────────────────┘              │
│                      │                                                  │
│              ┌───────▼────────┐                                         │
│              │  WorklogStore  │ (MobX observable)                       │
│              │  (per-issue    │                                         │
│              │   cache map)   │                                         │
│              └───────┬────────┘                                         │
│                      │                                                  │
│              ┌───────▼────────┐                                         │
│              │ WorklogService │ (axios HTTP client)                     │
│              └───────┬────────┘                                         │
│                      │                                                  │
└──────────────────────┼──────────────────────────────────────────────────┘
                       │ HTTP (JSON)
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Django REST API                                   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────┐            │
│  │ WorklogViewSet                                           │            │
│  │                                                           │            │
│  │  POST   .../worklogs/          → create                  │            │
│  │  GET    .../worklogs/          → list                    │            │
│  │  GET    .../worklogs/total/    → total                   │            │
│  │  PATCH  .../worklogs/{id}/     → partial_update          │            │
│  │  DELETE .../worklogs/{id}/     → destroy                 │            │
│  └────────────────────┬────────────────────────────────────┘            │
│                       │                                                  │
│              ┌────────▼────────┐     ┌─────────────────────┐            │
│              │ WorklogSerializer│     │ issue_activity.delay│            │
│              └────────┬────────┘     │ (Celery background  │            │
│                       │              │  task)               │            │
│                       ▼              └──────────┬──────────┘            │
│              ┌─────────────────┐               │                        │
│              │  Worklog Model  │               ▼                        │
│              │  (PostgreSQL)   │     ┌──────────────────┐               │
│              └─────────────────┘     │  IssueActivity   │               │
│                                      │  (activity feed) │               │
│                                      └──────────────────┘               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Backend Design

### 2.1 Data Model

**File:** `apps/api/plane/db/models/worklog.py` (new)

The `Worklog` model inherits from `ProjectBaseModel` which provides:
- `id` (UUID, primary key) — from `BaseModel`
- `created_by`, `updated_by` (FK to User, auto-set) — from `AuditModel` via `BaseModel`
- `created_at`, `updated_at` (datetime, auto) — from `AuditModel` via `BaseModel`
- `project` (FK to Project) — from `ProjectBaseModel`
- `workspace` (FK to Workspace, auto-set from project) — from `ProjectBaseModel`

**Additional fields:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `issue` | ForeignKey(Issue) | `on_delete=CASCADE`, `related_name="issue_worklogs"` | The issue this worklog belongs to |
| `actor` | ForeignKey(User) | `on_delete=SET_NULL`, `null=True`, `related_name="worklogs"` | The user who performed the work |
| `description` | TextField | `blank=True`, `default=""` | Optional description of the work done |
| `duration` | PositiveIntegerField | `validators=[MinValueValidator(1), MaxValueValidator(99999)]` | Duration in minutes |
| `logged_at` | DateField | Required | The date the work was performed |

**Model definition:**

```python
# apps/api/plane/db/models/worklog.py

from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models

from plane.db.models.issue import Issue
from plane.db.models.project import ProjectBaseModel


class Worklog(ProjectBaseModel):
    """Tracks time logged against an issue by a user."""

    issue = models.ForeignKey(
        Issue,
        on_delete=models.CASCADE,
        related_name="issue_worklogs",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="worklogs",
    )
    description = models.TextField(
        verbose_name="Work Description",
        blank=True,
        default="",
    )
    duration = models.PositiveIntegerField(
        verbose_name="Duration (minutes)",
        validators=[MinValueValidator(1), MaxValueValidator(99999)],
        help_text="Time spent in minutes",
    )
    logged_at = models.DateField(
        verbose_name="Date Logged",
        help_text="The date the work was performed",
    )

    class Meta:
        verbose_name = "Worklog"
        verbose_name_plural = "Worklogs"
        db_table = "worklogs"
        ordering = ("-logged_at", "-created_at")

    def __str__(self):
        return f"{self.actor} — {self.duration}m on {self.issue}"
```

**Entity Relationship:**

```
Workspace ──1:N── Project ──1:N── Issue ──1:N── Worklog
                                                   │
User ──────────────────────────────────────────1:N──┘
                                               (actor)
```

**Database indexes** (auto-created by Django for ForeignKey fields):
- `worklogs_issue_id` — on `issue_id`
- `worklogs_project_id` — on `project_id` (from ProjectBaseModel)
- `worklogs_workspace_id` — on `workspace_id` (from ProjectBaseModel)
- `worklogs_actor_id` — on `actor_id`

**Additional index** (add explicitly for common query pattern):
- `worklogs_issue_logged_at` — composite on `(issue_id, logged_at)` for efficient per-issue listing

```python
class Meta:
    # ... existing meta ...
    indexes = [
        models.Index(fields=["issue", "-logged_at"], name="worklogs_issue_logged_at"),
    ]
```

### 2.2 Migration

**File:** `apps/api/plane/db/migrations/XXXX_worklog.py` (auto-generated)

Generated via:
```bash
cd apps/api
python manage.py makemigrations db --name worklog
```

The migration will:
1. Create the `worklogs` table with all fields and constraints.
2. Add foreign key constraints for `issue`, `actor`, `project`, `workspace`.
3. Add the composite index on `(issue_id, logged_at)`.

### 2.3 Serializer

**File:** `apps/api/plane/app/serializers/worklog.py` (new)

```python
# apps/api/plane/app/serializers/worklog.py

from datetime import date
from rest_framework import serializers

from plane.db.models import Worklog


class WorklogSerializer(serializers.ModelSerializer):
    class Meta:
        model = Worklog
        fields = [
            "id",
            "issue",
            "actor",
            "description",
            "duration",
            "logged_at",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "issue",
            "actor",
            "project",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def validate_logged_at(self, value):
        """Ensure logged_at is not in the future."""
        if value > date.today():
            raise serializers.ValidationError(
                "logged_at cannot be in the future."
            )
        return value

    def validate_duration(self, value):
        """Ensure duration is positive and within bounds."""
        if value < 1:
            raise serializers.ValidationError(
                "Duration must be at least 1 minute."
            )
        if value > 99999:
            raise serializers.ValidationError(
                "Duration cannot exceed 99,999 minutes."
            )
        return value

    def validate_description(self, value):
        """Enforce description length limit."""
        if len(value) > 10000:
            raise serializers.ValidationError(
                "Description cannot exceed 10,000 characters."
            )
        return value


class WorklogTotalSerializer(serializers.Serializer):
    """Read-only serializer for the total duration aggregation response."""
    total_duration = serializers.IntegerField(read_only=True)
```

### 2.4 ViewSet & Endpoints

**File:** `apps/api/plane/app/views/issue/worklog.py` (new)

The viewset follows the exact same patterns as `IssueCommentViewSet`:

```python
# apps/api/plane/app/views/issue/worklog.py

import json

from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Sum

from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action

from plane.app.views import BaseViewSet
from plane.app.serializers import WorklogSerializer
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import Worklog, ProjectMember, Project, Issue
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.host import base_host


class WorklogViewSet(BaseViewSet):
    serializer_class = WorklogSerializer
    model = Worklog

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("actor", "project", "workspace", "issue")
            .distinct()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        serializer = WorklogSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                issue_id=issue_id,
                actor=request.user,
            )
            issue_activity.delay(
                type="worklog.activity.created",
                requested_data=json.dumps(
                    serializer.data, cls=DjangoJSONEncoder
                ),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=False,
                origin=base_host(request=request, is_app=True),
            )
            return Response(
                serializer.data, status=status.HTTP_201_CREATED
            )
        return Response(
            serializer.errors, status=status.HTTP_400_BAD_REQUEST
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_id):
        queryset = self.get_queryset()
        filters = {}
        if request.GET.get("created_at__gt"):
            filters["created_at__gt"] = request.GET.get("created_at__gt")
        queryset = queryset.filter(**filters)
        serializer = WorklogSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="total")
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def total(self, request, slug, project_id, issue_id):
        total = (
            self.get_queryset().aggregate(
                total_duration=Sum("duration")
            )["total_duration"]
            or 0
        )
        return Response(
            {"total_duration": total}, status=status.HTTP_200_OK
        )

    @allow_permission(
        allowed_roles=[ROLE.ADMIN], creator=True, model=Worklog
    )
    def partial_update(self, request, slug, project_id, issue_id, pk):
        worklog = Worklog.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            issue_id=issue_id,
            pk=pk,
        )
        current_instance = json.dumps(
            WorklogSerializer(worklog).data, cls=DjangoJSONEncoder
        )
        serializer = WorklogSerializer(
            worklog, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            issue_activity.delay(
                type="worklog.activity.updated",
                requested_data=json.dumps(
                    request.data, cls=DjangoJSONEncoder
                ),
                actor_id=str(request.user.id),
                issue_id=str(issue_id),
                project_id=str(project_id),
                current_instance=current_instance,
                epoch=int(timezone.now().timestamp()),
                notification=False,
                origin=base_host(request=request, is_app=True),
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(
            serializer.errors, status=status.HTTP_400_BAD_REQUEST
        )

    @allow_permission(
        allowed_roles=[ROLE.ADMIN], creator=True, model=Worklog
    )
    def destroy(self, request, slug, project_id, issue_id, pk):
        worklog = Worklog.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            issue_id=issue_id,
            pk=pk,
        )
        current_instance = json.dumps(
            WorklogSerializer(worklog).data, cls=DjangoJSONEncoder
        )
        worklog.delete()
        issue_activity.delay(
            type="worklog.activity.deleted",
            requested_data=json.dumps(
                {"worklog_id": str(pk)}, cls=DjangoJSONEncoder
            ),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=current_instance,
            epoch=int(timezone.now().timestamp()),
            notification=False,
            origin=base_host(request=request, is_app=True),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
```

### 2.5 URL Routing

**File:** `apps/api/plane/app/urls/worklog.py` (new)

```python
# apps/api/plane/app/urls/worklog.py

from django.urls import path

from plane.app.views import WorklogViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/",
        WorklogViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-worklogs",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/total/",
        WorklogViewSet.as_view({"get": "total"}),
        name="issue-worklogs-total",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/<uuid:pk>/",
        WorklogViewSet.as_view(
            {
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="issue-worklog-detail",
    ),
]
```

**Integration:** Add to `apps/api/plane/app/urls/__init__.py`:

```python
from .worklog import urlpatterns as worklog_urls

urlpatterns = [
    # ... existing patterns ...
] + worklog_urls
```

### 2.6 Permissions

The viewset uses the same permission model as `IssueCommentViewSet`:

| Method | Decorator | Behavior |
|--------|-----------|----------|
| `create` | `@allow_permission([ROLE.ADMIN, ROLE.MEMBER])` | Admins and members can create worklogs |
| `list` | `@allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])` | All project members can read |
| `total` | `@allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])` | All project members can read |
| `partial_update` | `@allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=Worklog)` | Admin or original creator |
| `destroy` | `@allow_permission(allowed_roles=[ROLE.ADMIN], creator=True, model=Worklog)` | Admin or original creator |

The `creator=True, model=Worklog` parameter tells the permission system to also allow the request if `request.user == worklog.created_by`, matching the pattern used for `IssueComment`.

### 2.7 Activity Tracking

Worklog CRUD events are dispatched to the Celery `issue_activity` task with these types:

| Event | `type` value | `requested_data` | `current_instance` |
|-------|-------------|---|---|
| Create | `worklog.activity.created` | Serialized new worklog | `None` |
| Update | `worklog.activity.updated` | Request data (changed fields) | Serialized old worklog |
| Delete | `worklog.activity.deleted` | `{"worklog_id": "<id>"}` | Serialized deleted worklog |

**Activity handler functions** (new, added to `apps/api/plane/bgtasks/issue_activities_task.py`):

```python
def create_worklog_activity(
    requested_data, current_instance, issue_id, project_id,
    workspace_id, actor_id, issue_activities, epoch,
):
    requested_data = json.loads(requested_data) if requested_data else {}
    duration = requested_data.get("duration", 0)
    hours = duration // 60
    minutes = duration % 60
    time_str = f"{hours}h {minutes}m" if hours else f"{minutes}m"

    issue_activities.append(
        IssueActivity(
            issue_id=issue_id,
            actor_id=actor_id,
            project_id=project_id,
            workspace_id=workspace_id,
            verb="created",
            field="worklog",
            new_value=time_str,
            new_identifier=requested_data.get("id"),
            old_value=requested_data.get("description", ""),
            epoch=epoch,
        )
    )


def update_worklog_activity(
    requested_data, current_instance, issue_id, project_id,
    workspace_id, actor_id, issue_activities, epoch,
):
    requested_data = json.loads(requested_data) if requested_data else {}
    current_instance = (
        json.loads(current_instance) if current_instance else {}
    )

    if "duration" in requested_data:
        old_dur = current_instance.get("duration", 0)
        new_dur = requested_data.get("duration", old_dur)
        old_h, old_m = old_dur // 60, old_dur % 60
        new_h, new_m = new_dur // 60, new_dur % 60

        issue_activities.append(
            IssueActivity(
                issue_id=issue_id,
                actor_id=actor_id,
                project_id=project_id,
                workspace_id=workspace_id,
                verb="updated",
                field="worklog",
                old_value=f"{old_h}h {old_m}m",
                new_value=f"{new_h}h {new_m}m",
                new_identifier=current_instance.get("id"),
                epoch=epoch,
            )
        )


def delete_worklog_activity(
    requested_data, current_instance, issue_id, project_id,
    workspace_id, actor_id, issue_activities, epoch,
):
    current_instance = (
        json.loads(current_instance) if current_instance else {}
    )
    duration = current_instance.get("duration", 0)
    hours = duration // 60
    minutes = duration % 60
    time_str = f"{hours}h {minutes}m" if hours else f"{minutes}m"

    issue_activities.append(
        IssueActivity(
            issue_id=issue_id,
            actor_id=actor_id,
            project_id=project_id,
            workspace_id=workspace_id,
            verb="deleted",
            field="worklog",
            old_value=time_str,
            old_identifier=current_instance.get("id"),
            epoch=epoch,
        )
    )
```

**Registration in `ACTIVITY_MAPPER`** (in `issue_activity` function):

```python
ACTIVITY_MAPPER = {
    # ... existing entries ...
    "worklog.activity.created": create_worklog_activity,
    "worklog.activity.updated": update_worklog_activity,
    "worklog.activity.deleted": delete_worklog_activity,
}
```

### 2.8 Cascading Deletes & Referential Integrity

| Parent | FK on Worklog | `on_delete` | Behavior |
|--------|---------------|-------------|----------|
| `Issue` | `issue` | `CASCADE` | Deleting an issue deletes all its worklogs |
| `User` | `actor` | `SET_NULL` | Deleting a user preserves worklogs (actor becomes null) |
| `Project` | `project` | `CASCADE` | Deleting a project deletes all worklogs (via ProjectBaseModel) |
| `Workspace` | `workspace` | `CASCADE` | Deleting a workspace cascades (via ProjectBaseModel) |

---

## 3. Frontend Design

### 3.1 Type Definitions

**File:** `packages/types/src/worklog.ts` (new)

```typescript
/**
 * Core worklog interface matching the backend Worklog model serialization.
 */
export interface IWorklog {
  id: string;
  issue: string;
  actor: string;
  description: string;
  duration: number; // minutes
  logged_at: string; // ISO date string "YYYY-MM-DD"
  project: string;
  workspace: string;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  created_by: string;
}

/**
 * Payload for creating a new worklog.
 */
export interface IWorklogCreatePayload {
  description?: string;
  duration: number; // minutes
  logged_at?: string; // defaults to today on backend
}

/**
 * Payload for updating an existing worklog.
 */
export interface IWorklogUpdatePayload {
  description?: string;
  duration?: number;
  logged_at?: string;
}

/**
 * Response from the total duration aggregation endpoint.
 */
export interface IWorklogTotalResponse {
  total_duration: number; // total minutes
}
```

**Export from `packages/types/src/index.ts`:**

```typescript
export * from "./worklog";
```

### 3.2 API Service

**File:** `packages/services/src/worklog/worklog.service.ts` (new)

```typescript
import { API_BASE_URL } from "@plane/constants";
import type {
  IWorklog,
  IWorklogCreatePayload,
  IWorklogUpdatePayload,
  IWorklogTotalResponse,
} from "@plane/types";
import { APIService } from "../api.service";

/**
 * Service for managing issue worklogs (time tracking).
 */
export class WorklogService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  private basePath(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): string {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
  }

  /**
   * Create a new worklog for an issue.
   */
  async create(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: IWorklogCreatePayload
  ): Promise<IWorklog> {
    return this.post(this.basePath(workspaceSlug, projectId, issueId), data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * List all worklogs for an issue.
   */
  async list(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IWorklog[]> {
    return this.get(this.basePath(workspaceSlug, projectId, issueId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Get total duration logged for an issue.
   */
  async getTotal(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IWorklogTotalResponse> {
    return this.get(
      `${this.basePath(workspaceSlug, projectId, issueId)}total/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Update an existing worklog.
   */
  async update(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: IWorklogUpdatePayload
  ): Promise<IWorklog> {
    return this.patch(
      `${this.basePath(workspaceSlug, projectId, issueId)}${worklogId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  /**
   * Delete a worklog.
   */
  async remove(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string
  ): Promise<void> {
    return this.delete(
      `${this.basePath(workspaceSlug, projectId, issueId)}${worklogId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
```

**Index file:** `packages/services/src/worklog/index.ts`

```typescript
export * from "./worklog.service";
```

**Export from `packages/services/src/index.ts`:**

```typescript
export * from "./worklog";
```

### 3.3 MobX Store

**File:** `apps/web/extended/store/worklog.store.ts` (new)

```typescript
import { action, makeObservable, observable, runInAction } from "mobx";
import type {
  IWorklog,
  IWorklogCreatePayload,
  IWorklogUpdatePayload,
} from "@plane/types";
import { WorklogService } from "@plane/services";

const worklogService = new WorklogService();

export interface IWorklogStore {
  // observables
  worklogsByIssue: Record<string, IWorklog[]>; // issueId → worklogs
  totalByIssue: Record<string, number>; // issueId → total minutes
  isLoading: boolean;

  // actions
  fetchWorklogs: (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ) => Promise<IWorklog[]>;

  fetchTotal: (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ) => Promise<number>;

  createWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: IWorklogCreatePayload
  ) => Promise<IWorklog>;

  updateWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: IWorklogUpdatePayload
  ) => Promise<IWorklog>;

  deleteWorklog: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string
  ) => Promise<void>;
}

export class WorklogStore implements IWorklogStore {
  worklogsByIssue: Record<string, IWorklog[]> = {};
  totalByIssue: Record<string, number> = {};
  isLoading = false;

  constructor() {
    makeObservable(this, {
      worklogsByIssue: observable,
      totalByIssue: observable,
      isLoading: observable,
      fetchWorklogs: action,
      fetchTotal: action,
      createWorklog: action,
      updateWorklog: action,
      deleteWorklog: action,
    });
  }

  fetchWorklogs = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<IWorklog[]> => {
    this.isLoading = true;
    try {
      const worklogs = await worklogService.list(
        workspaceSlug,
        projectId,
        issueId
      );
      runInAction(() => {
        this.worklogsByIssue[issueId] = worklogs;
        this.isLoading = false;
      });
      return worklogs;
    } catch (error) {
      runInAction(() => {
        this.isLoading = false;
      });
      throw error;
    }
  };

  fetchTotal = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<number> => {
    try {
      const response = await worklogService.getTotal(
        workspaceSlug,
        projectId,
        issueId
      );
      runInAction(() => {
        this.totalByIssue[issueId] = response.total_duration;
      });
      return response.total_duration;
    } catch (error) {
      throw error;
    }
  };

  createWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: IWorklogCreatePayload
  ): Promise<IWorklog> => {
    try {
      const worklog = await worklogService.create(
        workspaceSlug,
        projectId,
        issueId,
        data
      );
      runInAction(() => {
        const existing = this.worklogsByIssue[issueId] ?? [];
        this.worklogsByIssue[issueId] = [worklog, ...existing];
        // Update total optimistically
        this.totalByIssue[issueId] =
          (this.totalByIssue[issueId] ?? 0) + worklog.duration;
      });
      return worklog;
    } catch (error) {
      throw error;
    }
  };

  updateWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: IWorklogUpdatePayload
  ): Promise<IWorklog> => {
    try {
      const updated = await worklogService.update(
        workspaceSlug,
        projectId,
        issueId,
        worklogId,
        data
      );
      runInAction(() => {
        const existing = this.worklogsByIssue[issueId] ?? [];
        const idx = existing.findIndex((w) => w.id === worklogId);
        if (idx !== -1) {
          const oldDuration = existing[idx].duration;
          existing[idx] = updated;
          this.worklogsByIssue[issueId] = [...existing];
          // Update total: subtract old, add new
          this.totalByIssue[issueId] =
            (this.totalByIssue[issueId] ?? 0) -
            oldDuration +
            updated.duration;
        }
      });
      return updated;
    } catch (error) {
      throw error;
    }
  };

  deleteWorklog = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string
  ): Promise<void> => {
    // Capture duration before delete for optimistic total update
    const existing = this.worklogsByIssue[issueId] ?? [];
    const target = existing.find((w) => w.id === worklogId);
    const removedDuration = target?.duration ?? 0;

    try {
      await worklogService.remove(
        workspaceSlug,
        projectId,
        issueId,
        worklogId
      );
      runInAction(() => {
        this.worklogsByIssue[issueId] = existing.filter(
          (w) => w.id !== worklogId
        );
        this.totalByIssue[issueId] = Math.max(
          0,
          (this.totalByIssue[issueId] ?? 0) - removedDuration
        );
      });
    } catch (error) {
      throw error;
    }
  };
}
```

### 3.4 Component Architecture

#### 3.4.1 `IssueWorklogProperty` (replaces CE stub)

**File:** `extended/components/issues/worklog/property/root.tsx`

**Purpose:** Displays total logged time in the issue detail sidebar.

```
┌────────────────────────────────┐
│ ⏱ Time Logged    8h 30m       │
└────────────────────────────────┘
```

**Behavior:**
1. On mount, calls `worklogStore.fetchTotal(workspaceSlug, projectId, issueId)`.
2. Reads `worklogStore.totalByIssue[issueId]` reactively (MobX observer).
3. Formats minutes → `Xh Ym` display string.
4. If `disabled === false`, clicking the component triggers scroll-to or opens the worklog create form.
5. Uses the existing `@plane/ui` components for consistent styling (e.g., `Tooltip`, property row layout).

**Key implementation details:**
- Wrapped in MobX `observer()`.
- Uses `useEffect` for initial data fetch.
- Formatting helper: `formatDuration(minutes: number) => string`.

#### 3.4.2 `IssueActivityWorklog` (replaces CE stub)

**File:** `extended/components/issues/worklog/activity/root.tsx`

**Purpose:** Renders a single worklog activity entry in the issue activity feed.

```
┌─────────────────────────────────────────────────────┐
│  👤 Alice logged 2h 30m                  2 hours ago │
│     "Fixed the authentication bug"                   │
│                                   [Edit] [Delete]    │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
1. Receives `activityComment: TIssueActivityComment` which contains the `IssueActivity` data.
2. Parses the `field === "worklog"` activity to extract duration and description.
3. Renders actor avatar, action text, relative timestamp.
4. If the current user is the actor or an admin, shows edit/delete actions.
5. Uses the `ends` prop to render connecting timeline lines (top/bottom) consistent with other activity types.

#### 3.4.3 `IssueActivityWorklogCreateButton` (replaces CE stub)

**File:** `extended/components/issues/worklog/activity/worklog-create-button.tsx`

**Purpose:** Button that opens the worklog creation form.

```
┌──────────────────┐
│  ⏱ Log time      │
└──────────────────┘
```

**Behavior:**
1. If `disabled === true`, renders nothing (or a disabled button).
2. On click, toggles visibility of the `WorklogForm` component.
3. Uses `@plane/ui` `Button` component for styling consistency.

#### 3.4.4 `WorklogForm` (new component)

**File:** `extended/components/issues/worklog/activity/worklog-form.tsx`

**Purpose:** Inline form or modal for creating/editing a worklog entry.

```
┌─────────────────────────────────────────────────┐
│  Log Time                                        │
│                                                  │
│  Duration:  [  2 ] h  [ 30 ] m                  │
│  Date:      [ 2025-02-18      ] 📅              │
│  Notes:     [ Fixed auth bug...            ]     │
│                                                  │
│              [ Cancel ]  [ Log time ✓ ]          │
└─────────────────────────────────────────────────┘
```

**Fields:**
| Field | Input Type | Validation |
|-------|-----------|------------|
| Hours | Number input (0-1666) | Non-negative integer |
| Minutes | Number input (0-59) | 0-59 integer |
| Date | Date picker | Not in the future, defaults to today |
| Description | Textarea | Optional, max 10,000 chars |

**Behavior:**
1. Converts hours + minutes to total `duration` (minutes) on submit.
2. Calls `worklogStore.createWorklog(...)` or `worklogStore.updateWorklog(...)`.
3. Shows loading state during API call.
4. Closes form and refreshes data on success.
5. Shows validation errors inline on failure.
6. Can be used in "edit mode" by pre-populating fields from an existing `IWorklog`.

#### 3.4.5 `ActivityFilterRoot` (updated)

**File:** `extended/components/issues/worklog/activity/filter-root.tsx`

**Purpose:** Extended version of the CE filter root that adds a "Worklogs" filter option.

**Changes from CE version:**
- Adds a `WORKLOG` entry to the filter options list.
- When the worklog filter is active, only `field === "worklog"` activities are shown.
- All other behavior remains identical to the CE implementation.

### 3.5 Extended Directory Structure

The `extended/` directory mirrors `ce/` exactly, with files copied as a starting point. Only the worklog-related and store files differ from the CE stubs:

```
apps/web/extended/
├── components/
│   └── issues/
│       └── worklog/
│           ├── property/
│           │   ├── index.ts              ← re-export (same as ce/)
│           │   └── root.tsx              ← REAL implementation
│           └── activity/
│               ├── index.ts              ← re-export (same as ce/)
│               ├── root.tsx              ← REAL implementation
│               ├── filter-root.tsx       ← EXTENDED (adds worklog filter)
│               ├── worklog-create-button.tsx  ← REAL implementation
│               └── worklog-form.tsx      ← NEW component
├── store/
│   ├── root.store.ts                     ← EXTENDED (adds WorklogStore)
│   ├── worklog.store.ts                  ← NEW MobX store
│   └── timeline/                         ← copied from ce/ unchanged
├── hooks/                                ← copied from ce/ unchanged
│   └── ...
└── ...                                   ← all other ce/ files copied unchanged
```

### 3.6 Store Wiring

**File:** `extended/store/root.store.ts` (modified from CE copy)

```typescript
import { CoreRootStore } from "@/store/root.store";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";
import type { IWorklogStore } from "./worklog.store";
import { WorklogStore } from "./worklog.store";

export class RootStore extends CoreRootStore {
  timelineStore: ITimelineStore;
  worklogStore: IWorklogStore;

  constructor() {
    super();
    this.timelineStore = new TimeLineStore(this);
    this.worklogStore = new WorklogStore();
  }
}
```

**Accessing the store from components:**

Components access the store via the existing `useStore()` hook pattern (or the MobX context provider). Since `RootStore` extends `CoreRootStore`, the `worklogStore` is available on the root:

```typescript
import { observer } from "mobx-react";
import { useMobxStore } from "@/lib/mobx/store-provider";

const IssueWorklogProperty = observer((props) => {
  const { worklogStore } = useMobxStore();
  // ...
});
```

---

## 4. Data Flow

### 4.1 Create Worklog Flow

```
User clicks "Log time" button
        │
        ▼
WorklogCreateButton toggles WorklogForm visibility
        │
        ▼
User fills in duration (2h 30m), date, optional description
        │
        ▼
User clicks "Log time ✓"
        │
        ▼
WorklogForm calls worklogStore.createWorklog(slug, projId, issueId, {
    duration: 150,        // 2*60 + 30
    logged_at: "2025-02-18",
    description: "Fixed auth bug"
})
        │
        ▼
WorklogStore.createWorklog:
  1. Calls worklogService.create(...) → POST /api/.../worklogs/
  2. Django WorklogViewSet.create():
     a. Validates via WorklogSerializer
     b. Creates Worklog record in DB
     c. Fires issue_activity.delay(type="worklog.activity.created", ...)
     d. Returns 201 with serialized worklog
  3. On success, runInAction:
     a. Prepends worklog to worklogsByIssue[issueId]
     b. Adds duration to totalByIssue[issueId]
        │
        ▼
MobX reactivity triggers:
  - IssueWorklogProperty re-renders with updated total
  - Activity feed re-renders with new worklog entry (after next fetch)
  - WorklogForm closes
```

### 4.2 Issue Detail Load Flow

```
User navigates to issue detail page
        │
        ▼
IssueWorklogProperty mounts
        │
        ▼
useEffect calls worklogStore.fetchTotal(slug, projId, issueId)
        │
        ▼
WorklogStore.fetchTotal:
  1. Calls worklogService.getTotal(...)
     → GET /api/.../worklogs/total/
  2. Django returns { total_duration: 480 }
  3. runInAction: totalByIssue[issueId] = 480
        │
        ▼
IssueWorklogProperty renders "8h 0m"
        │
        ▼
Activity feed section mounts (IssueActivityEndpoint fetched separately)
        │
        ▼
For each activity with field="worklog":
  IssueActivityWorklog component renders the worklog activity entry
```

---

## 5. API Contract

### 5.1 Create Worklog

```
POST /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/
Content-Type: application/json
```

**Request Body:**
```json
{
  "duration": 150,
  "logged_at": "2025-02-18",
  "description": "Fixed authentication bug and wrote tests"
}
```

**Response (201):**
```json
{
  "id": "a1b2c3d4-...",
  "issue": "e5f6g7h8-...",
  "actor": "i9j0k1l2-...",
  "description": "Fixed authentication bug and wrote tests",
  "duration": 150,
  "logged_at": "2025-02-18",
  "project": "m3n4o5p6-...",
  "workspace": "q7r8s9t0-...",
  "created_at": "2025-02-18T14:30:00.000Z",
  "updated_at": "2025-02-18T14:30:00.000Z",
  "created_by": "i9j0k1l2-..."
}
```

### 5.2 List Worklogs

```
GET /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/
```

**Response (200):**
```json
[
  {
    "id": "a1b2c3d4-...",
    "issue": "e5f6g7h8-...",
    "actor": "i9j0k1l2-...",
    "description": "Fixed authentication bug",
    "duration": 150,
    "logged_at": "2025-02-18",
    "project": "m3n4o5p6-...",
    "workspace": "q7r8s9t0-...",
    "created_at": "2025-02-18T14:30:00.000Z",
    "updated_at": "2025-02-18T14:30:00.000Z",
    "created_by": "i9j0k1l2-..."
  }
]
```

### 5.3 Get Total Duration

```
GET /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/total/
```

**Response (200):**
```json
{
  "total_duration": 480
}
```

### 5.4 Update Worklog

```
PATCH /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/{worklog_id}/
Content-Type: application/json
```

**Request Body (partial):**
```json
{
  "duration": 180,
  "description": "Updated description"
}
```

**Response (200):** Full serialized worklog (same shape as create response).

### 5.5 Delete Worklog

```
DELETE /api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/worklogs/{worklog_id}/
```

**Response:** `204 No Content` (empty body).

---

## 6. Error Handling

### Backend Errors

| Scenario | HTTP Status | Response Body |
|----------|-------------|---------------|
| Missing required field (`duration`) | 400 | `{"duration": ["This field is required."]}` |
| Duration < 1 | 400 | `{"duration": ["Ensure this value is greater than or equal to 1."]}` |
| Duration > 99999 | 400 | `{"duration": ["Ensure this value is less than or equal to 99999."]}` |
| `logged_at` in the future | 400 | `{"logged_at": ["logged_at cannot be in the future."]}` |
| Description > 10,000 chars | 400 | `{"description": ["Description cannot exceed 10,000 characters."]}` |
| Issue not found | 404 | Standard DRF 404 |
| Not a project member | 403 | `{"detail": "You do not have permission to perform this action."}` |
| Guest trying to create | 403 | Same as above |
| Member trying to edit other's worklog | 403 | Same as above |
| Worklog not found | 404 | Standard DRF 404 |

### Frontend Error Handling

1. **Service layer:** All service methods catch `error.response` and re-throw. The calling code (store or component) handles the error.
2. **Store layer:** Errors from service calls propagate to components via rejected promises. No state mutation on error (optimistic updates are rolled back if needed).
3. **Component layer:**
   - Form validation errors are shown inline next to the respective field.
   - Network errors show a toast notification via Plane's existing toast system.
   - 403 errors show "You don't have permission" toast.
   - Loading states prevent double-submission.

---

## 7. Testing Strategy

### 7.1 Backend Tests

**File:** `apps/api/plane/tests/test_worklog.py` (new)

| Test Category | Test Cases |
|---------------|------------|
| **Model** | Create worklog, validate duration bounds, validate logged_at not future, cascade delete with issue |
| **Serializer** | Validate required fields, validate duration range, validate logged_at constraint, validate description length |
| **ViewSet - Create** | Happy path (201), missing duration (400), future date (400), guest forbidden (403) |
| **ViewSet - List** | Returns worklogs for issue, empty list, ordered by logged_at desc |
| **ViewSet - Total** | Sum aggregation, zero when no worklogs |
| **ViewSet - Update** | Owner can update (200), non-owner forbidden (403), admin can update any (200), partial update |
| **ViewSet - Delete** | Owner can delete (204), non-owner forbidden (403), admin can delete any (204) |
| **Activity** | Create generates activity, update generates activity, delete generates activity |

### 7.2 Frontend Tests

| Component | Test Cases |
|-----------|------------|
| `IssueWorklogProperty` | Renders total time, renders "0h 0m" when no worklogs, loading state |
| `IssueActivityWorklog` | Renders actor name and duration, renders description, shows edit/delete for owner |
| `IssueActivityWorklogCreateButton` | Renders button when not disabled, hidden when disabled |
| `WorklogForm` | Duration validation, date validation, submit calls store, cancel closes form |
| `WorklogStore` | fetchWorklogs updates map, createWorklog optimistic update, deleteWorklog removes from map |

### 7.3 Integration Tests

| Flow | Steps |
|------|-------|
| Full CRUD | Create worklog → verify in list → update duration → verify updated → delete → verify removed |
| Permission | Member creates → other member cannot edit → admin can edit |
| Activity | Create worklog → fetch issue activity → verify worklog activity entry exists |

---

## 8. Migration & Rollback

### Forward Migration

1. Run `python manage.py makemigrations db --name worklog` to generate migration.
2. Run `python manage.py migrate` to apply.
3. The migration creates the `worklogs` table and indexes.
4. **Zero downtime:** The migration only adds a new table; no existing tables are altered.

### Rollback

1. Revert `tsconfig.json` alias back to `./ce/*` → frontend reverts to stub components.
2. Run `python manage.py migrate db <previous_migration_number>` to drop the `worklogs` table.
3. Remove the worklog URL patterns from `urls/__init__.py`.
4. The rollback is clean because no existing models or tables were modified.

### Data Considerations

- Worklogs are stored in a dedicated table with no impact on existing tables.
- No foreign keys point *from* existing tables *to* the worklogs table.
- The only inbound FKs are standard (from Issue, User, Project, Workspace) — all one-to-many.

---

## 9. Future Considerations

### 9.1 Timer / Stopwatch

A future enhancement could add a client-side timer that auto-creates a worklog on stop:
- Store timer state in `localStorage` (persists across page navigations).
- On stop, calculate elapsed time and call `createWorklog(...)`.
- No backend changes needed — the timer is purely a frontend UX enhancement.

### 9.2 API v1 (Public API)

The internal API shape is designed to match the documented Plane v1 API. Exposing it as v1 requires:
- Adding URL routes under `/api/v1/...`.
- Using the existing `APIKeyAuthentication` permission class.
- No model or serializer changes.

### 9.3 Project-Level Time Reports

Aggregate worklogs across all issues in a project:
```
GET /api/workspaces/{slug}/projects/{project_id}/worklogs/summary/
```
- Group by user, date range, issue, label, etc.
- New serializer for aggregated response.
- New view with `GROUP BY` queries.

### 9.4 Webhook Events

Add webhook dispatching for worklog events, following the same pattern as `IssueCommentViewSet`:
```python
model_activity.delay(
    model_name="worklog",
    model_id=str(serializer.data["id"]),
    requested_data=request.data,
    current_instance=None,
    actor_id=request.user.id,
    slug=slug,
    origin=base_host(request=request, is_app=True),
)
```

### 9.5 Estimate vs. Actual

Compare estimated time (from the existing `point` or `estimate_point` fields on Issue) with total logged time. Requires a new UI component that reads both values and displays a comparison bar/percentage.

### 9.6 Worklog Constants in `@plane/constants`

Add a `WORKLOG` entry to `ACTIVITY_FILTER_TYPE_OPTIONS` in `packages/constants` so the filter is available system-wide. For the MVP, the filter addition is local to the `ActivityFilterRoot` component in `extended/`.