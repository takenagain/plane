# WP-01: Backend — user time analytics API

**Estimate:** 1–2 days  
**Blocks:** WP-02, WP-04, WP-05, WP-06, WP-08  
**Blocked by:** WP-00 (types contract)

## Objective

Implement user-scoped time analytics REST endpoints with correct permissions and aggregation.

## Reference

- `design.md` §4
- `WorkspaceUserProfileStatsEndpoint` in `apps/api/plane/app/views/workspace/user.py`
- `build_time_logged_chart` in `apps/api/plane/utils/build_chart.py`

## Endpoints

| Method | Path                                                             |
| ------ | ---------------------------------------------------------------- |
| GET    | `/api/workspaces/{slug}/user-time-analytics/{user_id}/summary/`  |
| GET    | `/api/workspaces/{slug}/user-time-analytics/{user_id}/charts/`   |
| GET    | `/api/workspaces/{slug}/user-time-analytics/{user_id}/rankings/` |
| GET    | `/api/workspaces/{slug}/user-time-analytics/{user_id}/worklogs/` |
| GET    | `/api/workspaces/{slug}/user-time-analytics/{user_id}/export/`   |

## Tests

`apps/api/plane/tests/unit/views/test_user_time_analytics.py` — minimum 8 cases covering permission, scoping, timers, summary math.

## Acceptance criteria

- [ ] All endpoints registered and return JSON matching `packages/types/src/profile-time-analytics.ts`
- [ ] Cross-user access denied
- [ ] Docker unit tests pass
