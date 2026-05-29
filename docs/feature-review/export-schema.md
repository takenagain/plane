# Workspace export — JSON schema reference

Canonical format for work item exports when `provider` is `json`. CSV and XLSX use the same logical fields with flattening (lists joined as strings in XLSX).

## Manifest (`manifest.json`)

See [05-workspace-export-design.md](./design/05-workspace-export-design.md).

## Issue file

Each issue is one object in a **top-level JSON array** (pretty-printed, indent 2).

### Core fields

| Field                | Type           | Description                                        |
| -------------------- | -------------- | -------------------------------------------------- |
| `identifier`         | string         | `{project_identifier}-{sequence_id}` e.g. `WEB-42` |
| `sequence_id`        | number         | Project-scoped sequence                            |
| `name`               | string         | Title                                              |
| `project_name`       | string         | Project display name                               |
| `project_identifier` | string         | Project key                                        |
| `state_name`         | string         | Workflow state name                                |
| `priority`           | string         | `urgent` \| `high` \| `medium` \| `low` \| `none`  |
| `assignees`          | string[]       | Display names                                      |
| `subscribers`        | string[]       | Display names                                      |
| `created_by_name`    | string         | Creator display name                               |
| `start_date`         | string \| null | ISO date                                           |
| `target_date`        | string \| null | ISO date                                           |
| `completed_at`       | string \| null | ISO datetime                                       |
| `created_at`         | string         | ISO datetime                                       |
| `updated_at`         | string         | ISO datetime                                       |
| `archived_at`        | string \| null | ISO datetime                                       |
| `is_draft`           | boolean        | Draft work item                                    |

### Nested / denormalized fields

| Field       | Type           | Description                                         |
| ----------- | -------------- | --------------------------------------------------- |
| `parent`    | string         | Parent identifier or empty                          |
| `labels`    | string[]       | Label names                                         |
| `cycles`    | string[]       | Cycle names                                         |
| `modules`   | string[]       | Module names                                        |
| `estimate`  | string \| null | Estimate point label                                |
| `links`     | object[]       | `{ title, url }`                                    |
| `relations` | object[]       | `{ identifier, relation_type, project_identifier }` |
| `comments`  | object[]       | `{ actor, body, created_at }`                       |

### Counts

| Field              | Type   |
| ------------------ | ------ |
| `sub_issues_count` | number |
| `link_count`       | number |
| `attachment_count` | number |

Serializer: `plane.utils.porters.serializers.issue.IssueExportSerializer`.

## Importer notes

- Use `manifest.json` → `files[].path` to locate per-project JSON files.
- Match projects by `identifier` or `id` in `manifest.projects`.
- Relations reference other issues by `identifier` string, not UUID.
