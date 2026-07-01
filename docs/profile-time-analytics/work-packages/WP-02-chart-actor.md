# WP-02: Chart builder actor filter

**Estimate:** 4–8 hours  
**Blocked by:** WP-01 (integration point)  
**Can merge with:** WP-01 PR

## Objective

Add optional `actor_id` to `build_time_logged_chart` so profile charts count only the profile subject's worklogs, not all assignees on shared issues.

## Files

- `apps/api/plane/utils/build_chart.py`
- `apps/api/plane/app/views/analytic/advance.py` (`TimeLoggedExportEndpoint` if needed)
- Tests in `test_analytics_export.py` or dedicated chart tests

## Acceptance criteria

- [ ] With `actor_id`, chart totals match sum of that user's worklogs only
- [ ] Without `actor_id`, workspace analytics unchanged (regression test)
