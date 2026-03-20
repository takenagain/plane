/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { render, waitFor } from "@testing-library/react";
import { useMemo, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreContext } from "@/lib/store-context";
import type { RootStore } from "@/plane-web/store/root.store";
import { GlobalTimeTrackingFOBRoot } from "../global-time-tracking-fob-root";

vi.mock("../floating-time-tracking-fob", () => ({
  FloatingTimeTrackingFOB: () => <div data-testid="floating-time-tracking-fob" />,
}));

const TestStoreProvider = ({ children, store }: PropsWithChildren<{ store: RootStore }>) => {
  const contextValue = useMemo(() => store, [store]);

  return <StoreContext.Provider value={contextValue}>{children}</StoreContext.Provider>;
};

describe("GlobalTimeTrackingFOBRoot", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("handles bootstrap failures without triggering an unhandled rejection", async () => {
    const fetchActiveWorklog = vi.fn().mockRejectedValue(new Error("bootstrap failed"));
    const onUnhandledRejection = vi.fn((event: PromiseRejectionEvent) => {
      event.preventDefault();
    });
    const store = {
      worklogStore: {
        activeWorklog: null,
        fetchActiveWorklog,
        totalByIssue: {},
      },
    } as unknown as RootStore;

    window.addEventListener("unhandledrejection", onUnhandledRejection);

    try {
      render(
        <TestStoreProvider store={store}>
          <GlobalTimeTrackingFOBRoot workspaceSlug="demo-workspace" />
        </TestStoreProvider>
      );

      await waitFor(() => {
        expect(fetchActiveWorklog).toHaveBeenCalledWith("demo-workspace");
      });
      await Promise.resolve();

      expect(onUnhandledRejection).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
  });
});
