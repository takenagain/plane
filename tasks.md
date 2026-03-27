# PR #13 Tasks

## 1. PR Review Comments

### 1.1 Nullable `created_by_id` in cycle_automation_task.py (Copilot + Devin)

- [ ] Add null guard for `project.created_by_id` in `create_upcoming_cycles()`
- [ ] Add fallback to workspace owner when `created_by_id` is null
- [ ] Add null guard in `transfer_incomplete_issues()` to avoid `str(None)`

### 1.2 E2E test cleanup/serialization (Copilot)

- [ ] Add `test.describe.serial` to cycle-automation.spec.ts
- [ ] Add `afterEach` reset to clean up toggle state

### 1.3 Cycle boundary timezone issue (Codex P1)

- [ ] Fix cycle date boundaries to use project-local dates instead of raw datetimes

### 1.4 Missing validation in app serializer (Codex P2)

- [ ] Add auto_transfer_cycle_issues validation to `plane.app` serializer

## 2. Description Field Focus Loss

### 2.1 Fix debounce timing

- [ ] Increase debounce from 1500ms to 5000ms

### 2.2 Fix focus loss on save

- [ ] Add guard in reset useEffect to skip when incoming value matches last saved content
- [ ] Prevent form reset after our own saves resolving from MobX store

### 2.3 E2E tests for description field

- [ ] Add E2E test that types in description field and verifies no focus loss
- [ ] Verify debounced auto-save works correctly

## 3. Validation & CI

### 3.1 Local checks

- [ ] Run format check
- [ ] Run build
- [ ] Run lint check
- [ ] Run type check
- [ ] Run backend lint (ruff)
- [ ] Run E2E tests

### 3.2 CI

- [ ] Push changes and verify CI passes
- [ ] Address any CI failures
