# WP-06: Comment signals

**Estimate:** 0.5–1 day  
**Blocked by:** WP-01

## Objective

Surface work items with recent third-party comments where the user logged time; keyword highlighting.

## Backend

`GET .../comment-signals/`

## Frontend

`comment-signals.tsx` in time-analytics folder

## Constants

`PROFILE_TIME_ATTENTION_KEYWORDS` in `packages/constants`

## Acceptance criteria

- [ ] Returns only issues with user worklogs in period
- [ ] Excludes comments by profile subject
- [ ] UI shows snippet + matched keywords
