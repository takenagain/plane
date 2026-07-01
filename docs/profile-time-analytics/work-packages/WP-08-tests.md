# WP-08: Tests & QA

**Estimate:** 1 day  
**Blocked by:** WP-01–WP-06

## API tests

`pytest -k user_time_analytics` in docker test stack

## E2E

`e2e/tests/profile-time-analytics.spec.ts` — reuse `e2e/tests/helpers/time-tracking.ts`

## Manual QA checklist

- [ ] Own profile: tab loads, KPI matches worklogs
- [ ] Other user profile (member): tab loads
- [ ] Guest/unauthorized: tab hidden or 403
- [ ] Compare Wed peak with Analytics screenshot scenario
- [ ] Export CSV opens in spreadsheet

## Acceptance criteria

- [ ] CI green for new tests
- [ ] No regression in `analytics-hours-logged.spec.ts`
