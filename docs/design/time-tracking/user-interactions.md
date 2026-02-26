# Time Tracking - User Interaction Diagrams

> **Feature:** Time Tracking / Worklogs for Plane Community Edition
> **Related:** [requirements.md](./requirements.md) · [design.md](./design.md)

---

## User Interaction Flows

### FR-1: Create Worklog Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Web UI
    participant Store as MobX Store
    participant API as REST API
    participant DB as PostgreSQL

    User->>UI: Navigate to Issue Detail
    UI->>UI: Display "Log time" button in activity feed
    
    User->>UI: Click "Log time" button
    UI->>UI: Open WorklogForm modal/inline
    
    User->>UI: Enter duration (hours + minutes)
    User->>UI: Select date (defaults to today)
    User->>UI: Enter optional description
    
    User->>UI: Click "Log time" button
    UI->>Store: createWorklog(data)
    
    Store->>API: POST /api/workspaces/{slug}/projects/{pid}/issues/{iid}/worklogs/
    API->>DB: INSERT INTO worklogs
    
    DB-->>API: Worklog created
    API-->>Store: 201 Created with worklog data
    
    Store->>Store: Optimistic update - add to cache
    Store-->>UI: Worklog created
    
    UI->>UI: Update total time display
    UI->>UI: Add worklog to activity feed
    UI->>UI: Close form
```

### FR-2: List Worklogs Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Web UI
    participant Store as MobX Store
    participant API as REST API
    participant DB as PostgreSQL

    User->>UI: Navigate to Issue Detail
    
    par Activity Feed Load
        UI->>UI: Fetch issue details
    and Worklog Load
        UI->>Store: fetchWorklogs(slug, pid, iid)
        Store->>API: GET /api/workspaces/{slug}/projects/{pid}/issues/{iid}/worklogs/
        API->>DB: SELECT * FROM worklogs WHERE issue_id = {iid}
        DB-->>API: Worklog list
        API-->>Store: Worklog[]
        Store->>Store: Cache worklogs by issue
        Store-->>UI: Worklog[]
    end
    
    UI->>UI: Display worklog entries in activity feed
```

### FR-3: Total Time Aggregation Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Web UI
    participant Store as MobX Store
    participant API as REST API
    participant DB as PostgreSQL

    User->>UI: Navigate to Issue Detail
    
    par Sidebar Property Load
        UI->>Store: fetchTotal(slug, pid, iid)
        Store->>API: GET /api/workspaces/{slug}/projects/{pid}/issues/{iid}/worklogs/total/
        API->>DB: SELECT SUM(duration) FROM worklogs WHERE issue_id = {iid}
        DB-->>API: { total_duration: N }
        API-->>Store: { total_duration: N }
        Store->>Store: Cache total by issue
        Store-->>UI: Total duration
    end
    
    UI->>UI: Display "Time Logged: Xh Ym" in sidebar
```

### FR-4: Update Worklog Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Web UI
    participant Store as MobX Store
    participant API as REST API
    participant DB as PostgreSQL

    User->>UI: View worklog in activity feed
    
    User->>UI: Click edit icon on worklog entry
    UI->>UI: Open WorklogForm with pre-filled data
    
    User->>UI: Modify duration/date/description
    
    User->>UI: Click "Update" button
    UI->>Store: updateWorklog(slug, pid, iid, worklogId, data)
    
    Store->>API: PATCH /api/workspaces/{slug}/projects/{pid}/issues/{iid}/worklogs/{wid}/
    API->>DB: UPDATE worklogs SET ...
    
    DB-->>API: Worklog updated
    API-->>Store: 200 OK with updated worklog
    
    Store->>Store: Optimistic update - modify in cache
    Store-->>UI: Worklog updated
    
    UI->>UI: Update worklog entry in activity feed
    UI->>UI: Recalculate and update total time
    UI->>UI: Close form
```

### FR-5: Delete Worklog Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as Web UI
    participant Store as MobX Store
    participant API as REST API
    participant DB as PostgreSQL

    User->>UI: View worklog in activity feed
    
    User->>UI: Click delete icon on worklog entry
    UI->>UI: Show confirmation (optional)
    
    User->>UI: Confirm delete
    UI->>Store: deleteWorklog(slug, pid, iid, worklogId)
    
    Store->>Store: Optimistic update - capture duration
    Store->>Store: Remove from cache immediately
    
    Store->>API: DELETE /api/workspaces/{slug}/projects/{pid}/issues/{iid}/worklogs/{wid}/
    API->>DB: DELETE FROM worklogs WHERE id = {wid}
    
    DB-->>API: 204 No Content
    API-->>Store: Confirmed deletion
    
    UI->>UI: Remove worklog entry from activity feed
    UI->>UI: Update total time display
```

### FR-7: Activity Feed Integration

```mermaid
sequenceDiagram
    participant User
    participant UI as Web UI
    participant API as REST API
    participant Worker as Celery Worker
    participant DB as PostgreSQL

    User->>UI: Creates/Updates/Deletes worklog
    
    UI->>API: POST/PATCH/DELETE request
    API->>DB: Modify worklog
    
    par Background Activity Creation
        API->>Worker: issue_activity.delay(type, ...)
        Worker->>DB: INSERT INTO issue_activities
    end
    
    API-->>UI: Success response
    
    par Activity Feed Refresh
        UI->>API: GET /api/workspaces/{slug}/projects/{pid}/issues/{iid}/history/
        API->>DB: SELECT * FROM issue_activities WHERE issue_id = {iid}
        DB-->>API: Activity list
        API-->>UI: Activities
    end
    
    UI->>UI: Render worklog activities in feed
```

---

## Permission-Based Access Control

```mermaid
stateDiagram-v2
    [*] --> Guest
    [*] --> Member
    [*] --> Admin
    
    Guest --> CanRead: Authenticated
    Member --> CanCreate: Has Project Access
    Member --> CanUpdateOwn: Has Project Access
    Member --> CanDeleteOwn: Has Project Access
    Admin --> CanUpdateAny: Is Project Admin
    Admin --> CanDeleteAny: Is Project Admin
    
    CanRead: GET /worklogs/<br/>GET /worklogs/total/
    CanCreate: POST /worklogs/
    CanUpdateOwn: PATCH /worklogs/{id}<br/>(if creator = current_user)
    CanDeleteOwn: DELETE /worklogs/{id}<br/>(if creator = current_user)
    CanUpdateAny: PATCH /worklogs/{id}
    CanDeleteAny: DELETE /worklogs/{id}
    
    note right of Guest: Guests cannot create,<br/>update, or delete worklogs
```

---

## Component Interaction Diagram

```mermaid
graph TB
    subgraph "ReactWP[IssueWork Components"
        IlogProperty]
        IAWB[IssueActivityWorklog]
        IWCB[IssueActivityWorklogCreateButton]
        WF[WorklogForm]
    end
    
    subgraph "MobX Store"
        WS[WorklogStore]
    end
    
    subgraph "API Service"
        WSV[WorklogService]
    end
    
    subgraph "Django Backend"
        WV[WorklogViewSet]
        WSER[WorklogSerializer]
        WM[Worklog Model]
    end
    
    IWP --> WS: fetchTotal()
    IAWB --> WS: fetchWorklogs()
    IWCB --> WF: toggle form
    WF --> WS: createWorklog()
    WF --> WS: updateWorklog()
    WF --> WS: deleteWorklog()
    
    WS --> WSV: API calls
    
    WSV --> WV: HTTP requests
    WV --> WSER: Validation
    WSER --> WM: Database operations
```

---

## Error Handling Flow

```mermaid
flowchart TD
    A[User Submits Form] --> B{Valid Input?}
    
    B -->|No| C[Show Inline Validation Errors]
    C --> D[User Corrects Input]
    D --> A
    
    B -->|Yes| E[Submit to API]
    
    E --> F{API Success?}
    
    F -->|No| G{Error Type?}
    
    G -->|401/403| H[Show Permission Error]
    H --> I[Close Form / Show Message]
    
    G -->|400| J[Show Validation Error from API]
    J --> C
    
    G -->|500| K[Show Generic Error Toast]
    K --> I
    
    F -->|Yes| L[Update Local Store]
    L --> M[Refresh UI Components]
    M --> N[Close Form]