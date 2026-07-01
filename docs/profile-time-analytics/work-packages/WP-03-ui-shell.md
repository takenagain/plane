# WP-03: Frontend dashboard shell

**Estimate:** 1 day  
**Blocked by:** WP-00  
**Parallel with:** WP-01 (use mock until API lands)

## Objective

Filters, KPI cards, layout grid, empty state, `ProfileTimeAnalyticsService`.

## Components

```
apps/web/core/components/profile/time-analytics/
  root.tsx
  filters.tsx
  kpis.tsx
  empty-state.tsx
```

## Acceptance criteria

- [ ] Date filter changes SWR key and refetches summary
- [ ] Loading skeletons match profile overview patterns
- [ ] Empty state when total_hours === 0
