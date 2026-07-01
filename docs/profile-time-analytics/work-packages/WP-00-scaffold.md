# WP-00: Scaffold & contracts

**Estimate:** 2–4 hours  
**Blocks:** WP-03, WP-04, WP-05  
**Blocked by:** none

## Objective

Land navigation, routing, TypeScript contracts, and a placeholder dashboard so parallel agents do not conflict on route registration.

## Files to touch

- `packages/constants/src/profile.ts`
- `packages/types/src/profile-time-analytics.ts` (new)
- `packages/types/src/index.ts` (export)
- `apps/web/app/routes/core.ts`
- `apps/web/app/(all)/[workspaceSlug]/(projects)/profile/[userId]/time/page.tsx` (new)
- `apps/web/core/components/profile/time-analytics/root.tsx` (new)
- `apps/web/app/(all)/[workspaceSlug]/(projects)/profile/[userId]/layout.tsx`
- `packages/i18n/src/locales/en/translations.ts`

## Acceptance criteria

- [x] Tab appears for authorized profile viewers
- [x] `/time` route renders placeholder with spec link
- [x] Types exported from `@plane/types`
- [ ] `pnpm check:lint` passes on changed packages (run before merge)

## Out of scope

- API implementation
- Charts
