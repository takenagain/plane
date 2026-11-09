import { act, cleanup, render, screen } from "@testing-library/react";
import { actionBound, autorun, makeObservable, observable, observableRef, runInAction } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

describe("MobX integration", () => {
  it("memoizes argument-specific computations, invalidates changes, and releases unobserved entries", () => {
    const values = observable.map([
      ["first", 1],
      ["second", 2],
    ]);
    const compute = vi.fn((id: string) => values.get(id));
    const onCleanup = vi.fn();
    const select = computedFn(compute, { onCleanup });
    const observed: (number | undefined)[][] = [];
    const dispose = autorun(() => observed.push([select("first"), select("first"), select("second")]));

    try {
      expect(compute).toHaveBeenCalledTimes(2);
      runInAction(() => values.set("first", 3));
      expect(observed).toEqual([
        [1, 1, 2],
        [3, 3, 2],
      ]);
      expect(compute).toHaveBeenCalledTimes(3);
    } finally {
      dispose();
    }

    expect(onCleanup).toHaveBeenCalledTimes(2);
    expect(onCleanup).toHaveBeenCalledWith(3, "first");
    expect(onCleanup).toHaveBeenCalledWith(2, "second");
    expect(select("first")).toBe(3);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it("preserves bound actions and React updates with the named reference annotation", () => {
    class Workspace {
      name = "Before";

      constructor() {
        makeObservable(this, { name: observableRef, rename: actionBound });
      }

      rename(name: string) {
        this.name = name;
      }
    }

    const workspaces = observable.map<string, Workspace>();
    const workspace = new Workspace();
    const WorkspaceName = observer(() => <span>{workspaces.get("workspace")?.name ?? "No workspace"}</span>);
    render(<WorkspaceName />);
    expect(screen.getByText("No workspace")).toBeInTheDocument();

    act(() => runInAction(() => workspaces.set("workspace", workspace)));
    expect(screen.getByText("Before")).toBeInTheDocument();
    const rename = workspace.rename;
    act(() => rename("After"));
    expect(screen.getByText("After")).toBeInTheDocument();
  });
});
