import { describe, expect, it } from "vitest";
import type { TIssue, TWorkItemFilterExpression } from "@plane/types";
import { extractInheritableParentFields, extractIssueDefaultsFromRichFilters } from "@/helpers/work-item-defaults";

// ---------------------------------------------------------------------------
// extractIssueDefaultsFromRichFilters
// ---------------------------------------------------------------------------

describe("extractIssueDefaultsFromRichFilters", () => {
  it("returns empty object for empty filter expression", () => {
    expect(extractIssueDefaultsFromRichFilters({})).toEqual({});
  });

  // --- cycle_id ---

  it("extracts cycle_id from a flat exact condition", () => {
    const richFilters: TWorkItemFilterExpression = { cycle_id__exact: "cycle-abc" };
    expect(extractIssueDefaultsFromRichFilters(richFilters)).toMatchObject({ cycle_id: "cycle-abc" });
  });

  it("extracts cycle_id from an AND group", () => {
    const richFilters: TWorkItemFilterExpression = {
      and: [{ cycle_id__exact: "cycle-xyz" }],
    };
    expect(extractIssueDefaultsFromRichFilters(richFilters)).toMatchObject({ cycle_id: "cycle-xyz" });
  });

  it("does NOT extract cycle_id when multiple cycles are listed (in operator with two ids)", () => {
    const richFilters: TWorkItemFilterExpression = { cycle_id__in: "cycle-1,cycle-2" };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    // cycle_id is single-valued on an issue; can't assign two cycles
    expect(result.cycle_id).toBeUndefined();
  });

  it("extracts cycle_id when in operator has exactly one id", () => {
    const richFilters: TWorkItemFilterExpression = { cycle_id__in: "cycle-single" };
    expect(extractIssueDefaultsFromRichFilters(richFilters)).toMatchObject({ cycle_id: "cycle-single" });
  });

  // --- module_id ---

  it("extracts module_ids from a flat module_id__exact condition", () => {
    const richFilters: TWorkItemFilterExpression = { module_id__exact: "mod-1" };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    expect(result.module_ids).toEqual(["mod-1"]);
  });

  it("extracts multiple module_ids from a module_id__in condition", () => {
    const richFilters: TWorkItemFilterExpression = { module_id__in: "mod-1,mod-2,mod-3" };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    expect(result.module_ids).toEqual(["mod-1", "mod-2", "mod-3"]);
  });

  // --- state_id ---

  it("extracts state_id from a flat condition", () => {
    const richFilters: TWorkItemFilterExpression = { state_id__exact: "state-done" };
    expect(extractIssueDefaultsFromRichFilters(richFilters)).toMatchObject({ state_id: "state-done" });
  });

  it("does NOT extract state_id when multiple states are listed", () => {
    const richFilters: TWorkItemFilterExpression = { state_id__in: "state-1,state-2" };
    expect(extractIssueDefaultsFromRichFilters(richFilters).state_id).toBeUndefined();
  });

  // --- priority ---

  it("extracts priority from a flat exact condition", () => {
    const richFilters: TWorkItemFilterExpression = { priority__exact: "high" };
    expect(extractIssueDefaultsFromRichFilters(richFilters)).toMatchObject({ priority: "high" });
  });

  // --- assignee_id ---

  it("extracts assignee_ids from a flat assignee_id__exact condition", () => {
    const richFilters: TWorkItemFilterExpression = { assignee_id__exact: "user-1" };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    expect(result.assignee_ids).toEqual(["user-1"]);
  });

  it("extracts multiple assignee_ids from an assignee_id__in condition", () => {
    const richFilters: TWorkItemFilterExpression = { assignee_id__in: "user-1,user-2" };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    expect(result.assignee_ids).toEqual(["user-1", "user-2"]);
  });

  // --- label_id ---

  it("extracts label_ids from a label_id__exact condition", () => {
    const richFilters: TWorkItemFilterExpression = { label_id__exact: "label-bug" };
    expect(extractIssueDefaultsFromRichFilters(richFilters)).toMatchObject({ label_ids: ["label-bug"] });
  });

  // --- combined AND group ---

  it("extracts multiple different fields from an AND group", () => {
    const richFilters: TWorkItemFilterExpression = {
      and: [
        { cycle_id__exact: "cycle-sprint1" },
        { module_id__exact: "mod-project-x" },
        { priority__exact: "urgent" },
        { assignee_id__in: "user-a,user-b" },
      ],
    };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    expect(result).toMatchObject({
      cycle_id: "cycle-sprint1",
      module_ids: ["mod-project-x"],
      priority: "urgent",
      assignee_ids: ["user-a", "user-b"],
    });
  });

  // --- non-propagatable operators ---

  it("does NOT propagate range operator (date filters)", () => {
    const richFilters: TWorkItemFilterExpression = { start_date__range: "2024-01-01,2024-12-31" };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("does NOT propagate unknown/exclusion operators", () => {
    // `range` on priority is not a propagatable operator (only exact/in are)
    const richFilters: TWorkItemFilterExpression = { priority__range: "low,high" };
    expect(extractIssueDefaultsFromRichFilters(richFilters).priority).toBeUndefined();
  });

  it("does NOT map unrecognised properties to issue fields", () => {
    const richFilters: TWorkItemFilterExpression = { created_by_id__exact: "user-x" };
    const result = extractIssueDefaultsFromRichFilters(richFilters);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("props.data fields take priority – partial merge scenario", () => {
    // Simulates what modal.tsx does: filterDefaults spread first, then props.data
    const filterDefaults = extractIssueDefaultsFromRichFilters({ module_id__exact: "filter-mod" });
    const propsData: Partial<TIssue> = { module_ids: ["explicit-mod"] };
    const merged = { ...filterDefaults, ...propsData };
    expect(merged.module_ids).toEqual(["explicit-mod"]);
  });
});

// ---------------------------------------------------------------------------
// extractInheritableParentFields
// ---------------------------------------------------------------------------

describe("extractInheritableParentFields", () => {
  const makeParent = (overrides: Partial<TIssue> = {}): TIssue =>
    ({
      id: "parent-1",
      project_id: "proj-1",
      cycle_id: null,
      module_ids: null,
      assignee_ids: [],
      label_ids: [],
      priority: "none",
      state_id: "state-doing",
      parent_id: null,
      ...overrides,
    }) as TIssue;

  it("inherits cycle_id when parent has one", () => {
    const parent = makeParent({ cycle_id: "sprint-01" });
    expect(extractInheritableParentFields(parent)).toMatchObject({ cycle_id: "sprint-01" });
  });

  it("does NOT include cycle_id when parent has no cycle", () => {
    const parent = makeParent({ cycle_id: null });
    expect(extractInheritableParentFields(parent).cycle_id).toBeUndefined();
  });

  it("inherits module_ids when parent has modules", () => {
    const parent = makeParent({ module_ids: ["mod-a", "mod-b"] });
    const result = extractInheritableParentFields(parent);
    expect(result.module_ids).toEqual(["mod-a", "mod-b"]);
  });

  it("does NOT include module_ids when parent has none", () => {
    const parent = makeParent({ module_ids: null });
    expect(extractInheritableParentFields(parent).module_ids).toBeUndefined();
  });

  it("inherits assignee_ids when parent has assignees", () => {
    const parent = makeParent({ assignee_ids: ["user-1", "user-2"] });
    const result = extractInheritableParentFields(parent);
    expect(result.assignee_ids).toEqual(["user-1", "user-2"]);
  });

  it("does NOT include assignee_ids when parent has empty array", () => {
    const parent = makeParent({ assignee_ids: [] });
    expect(extractInheritableParentFields(parent).assignee_ids).toBeUndefined();
  });

  it("inherits label_ids when parent has labels", () => {
    const parent = makeParent({ label_ids: ["bug", "urgent"] });
    expect(extractInheritableParentFields(parent)).toMatchObject({ label_ids: ["bug", "urgent"] });
  });

  it("inherits priority when parent has a non-none priority", () => {
    const parent = makeParent({ priority: "high" });
    expect(extractInheritableParentFields(parent)).toMatchObject({ priority: "high" });
  });

  it("does NOT inherit priority when parent priority is none", () => {
    const parent = makeParent({ priority: "none" });
    expect(extractInheritableParentFields(parent).priority).toBeUndefined();
  });

  it("does NOT inherit state_id (child starts at its own initial state)", () => {
    const parent = makeParent({ state_id: "state-in-progress" });
    expect(extractInheritableParentFields(parent).state_id).toBeUndefined();
  });

  it("does NOT inherit parent_id (no recursive grandparent chaining)", () => {
    const parent = makeParent({ parent_id: "grandparent-1" });
    expect(extractInheritableParentFields(parent).parent_id).toBeUndefined();
  });

  it("returns an empty object when parent has no inheritable values set", () => {
    const parent = makeParent();
    expect(extractInheritableParentFields(parent)).toEqual({});
  });

  it("inherits all relevant fields at once", () => {
    const parent = makeParent({
      cycle_id: "sprint-02",
      module_ids: ["mod-x"],
      assignee_ids: ["user-a"],
      label_ids: ["label-1"],
      priority: "medium",
    });
    const result = extractInheritableParentFields(parent);
    expect(result).toMatchObject({
      cycle_id: "sprint-02",
      module_ids: ["mod-x"],
      assignee_ids: ["user-a"],
      label_ids: ["label-1"],
      priority: "medium",
    });
    // Ensure nothing extra is included
    expect(Object.keys(result).toSorted()).toEqual(
      ["cycle_id", "module_ids", "assignee_ids", "label_ids", "priority"].toSorted()
    );
  });

  it("returns a deep copy – mutating the result does not affect the parent", () => {
    const parent = makeParent({ module_ids: ["mod-1"], assignee_ids: ["user-1"] });
    const result = extractInheritableParentFields(parent);
    result.module_ids!.push("mod-mutated");
    result.assignee_ids!.push("user-mutated");
    expect(parent.module_ids).toEqual(["mod-1"]);
    expect(parent.assignee_ids).toEqual(["user-1"]);
  });
});
