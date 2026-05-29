# WP-04: Customized insights on profile tab

**Estimate:** 1 day  
**Blocked by:** WP-01, WP-02, WP-03

## Objective

Reuse Analytics customized insights (hours logged) wired to profile charts + export API.

## Key refactor

Parameterize `AnalyticsBarChart` to accept:

```typescript
fetchChart: (params) => Promise<IChartResponse>;
exportCsv?: (params) => Promise<void>;
```

## Acceptance criteria

- [ ] Day-of-week + work item grouping works
- [ ] CSV export downloads
- [ ] No dependency on `useAnalytics()` global store
