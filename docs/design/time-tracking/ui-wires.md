# Time Tracking - UI Wire Diagrams

> **Feature:** Time Tracking / Worklogs for Plane Community Edition
> **Related:** [requirements.md](./requirements.md) · [design.md](./design.md) · [user-interactions.md](./user-interactions.md)

---

## UI Components Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| `IssueWorklogProperty` | Issue sidebar | Shows total logged time |
| `IssueActivityWorklog` | Activity feed | Displays worklog entries |
| `IssueActivityWorklogCreateButton` | Activity feed | Button to create worklog |
| `WorklogForm` | Inline form | Create/edit form |

---

## 1. IssueWorklogProperty (Sidebar)

```
+-----------------------+
| Issue Details         |
+-----------------------+
| Status    🔴 Active  |
| Priority  🟢 Low     |
| ⏱ Time Logged 8h 30m|
+-----------------------+
```

- Icon: `Clock`
- Display: "Xh Ym" format
- Default: "0h 0m" when empty

---

## 2. WorklogForm (Create)

```
+-----------------------+
| Log Time         [X] |
+-----------------------+
| Duration  [2]h [30]m |
| Date      [____]     |
| Notes     [______]   |
|                       |
| [Cancel] [Log time]  |
+-----------------------+
```

**Fields:**
- Hours: 0-1666
- Minutes: 0-59
- Date: Not future
- Notes: Max 10,000 chars

---

## 3. WorklogForm (Edit)

Same as Create, but:
- Header: "Edit Worklog"
- Button: "Update"
- Pre-filled fields

---

## 4. IssueActivityWorklog Entry

**Created:**
```
👤 John logged 2h 30m - 1h ago
   Fixed auth bug
   [Edit] [Delete]
```

**Updated:**
```
👤 Jane updated 2h30m to 3h0m - 30m ago
```

**Deleted:**
```
👤 John removed 2h30m - 2h ago
```

---

## 5. Activity Filter

Filter dropdown adds: `[Worklogs]`

---

## Full Activity Feed Layout

```
+-----------------------------------+
| Activity     [Filter: All ▼]      |
+-----------------------------------+
| + Add comment                     |
| ---                               |
| ⏱ Log time                       |  <- Button
| ---                               |
| 👤 John logged 2h30m - 1h ago    |  <- Entry
|   Fixed auth bug                  |
|                           [✏][🗑]|
| ---                               |
| 👤 Jane attached files - 3h ago  |
+-----------------------------------+
```

---

## Integration: Issue Sidebar

```
+-----------------------+
| Issue Details         |
+-----------------------+
| Status    🔴 Active  |
| Priority  🟢 Low     |
| -------------------- |
| ⏱ Time Logged 8h 30m |  <- NEW
| -------------------- |
| Labels     bug       |
+-----------------------+
```

---

## Accessibility

| Component | ARIA |
|-----------|------|
| WorklogProperty | role="gridcell" |
| CreateButton | aria-label="Log time" |
| WorklogForm | role="dialog" |
| Edit button | aria-label="Edit worklog" |
| Delete button | aria-label="Delete worklog" |

---

## Styling

| Element | Class |
|---------|-------|
| Time text | `text-body-xs-regular text-secondary` |
| Button | `text-caption-sm-medium hover:bg-layer-3` |
| Entry text | `text-caption-sm-regular` |
| Actor name | `font-medium text-primary` |
| Timestamp | `text-tertiary` |
| Form bg | `bg-layer-1` |
| Form border | `border-subtle` |