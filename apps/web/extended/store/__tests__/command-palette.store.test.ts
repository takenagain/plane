/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store-context", () => ({
  store: {
    powerK: {
      isShortcutsListModalOpen: false,
    },
  },
}));

import { CommandPaletteStore } from "../command-palette.store";
import { RootStore } from "../root.store";

describe("CommandPaletteStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("constructs without redefining base isAnyModalOpen as a new MobX computed", () => {
    // Regression: BaseCommandPaletteStore already annotates isAnyModalOpen as
    // computed. Re-annotating it with `computed` (instead of `override`) in the
    // subclass throws: property "isAnyModalOpen" is non-configurable and can't be deleted.
    expect(() => new CommandPaletteStore()).not.toThrow();
  });

  it("exposes isAnyModalOpen from core modal state", () => {
    const store = new CommandPaletteStore();

    expect(store.isAnyModalOpen).toBe(false);

    store.toggleCreateIssueModal(true);
    expect(store.isAnyModalOpen).toBe(true);

    store.toggleCreateIssueModal(false);
    expect(store.isAnyModalOpen).toBe(false);
  });
});

describe("RootStore", () => {
  it("constructs without MobX store-init crashes (blank-app regression)", () => {
    // store-context instantiates RootStore at module load; a failure here blanks the SPA.
    expect(() => new RootStore()).not.toThrow();
  });
});
