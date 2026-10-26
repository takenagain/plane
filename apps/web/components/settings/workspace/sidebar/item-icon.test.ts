import { describe, expect, it } from "vitest";
import { WORKSPACE_SETTINGS_ICONS } from "./item-icon";

describe("WORKSPACE_SETTINGS_ICONS", () => {
  it("provides an icon for every workspace settings tab", () => {
    expect(new Set(Object.keys(WORKSPACE_SETTINGS_ICONS))).toEqual(
      new Set(["general", "members", "export", "integrations", "webhooks", "ai-agent"])
    );
  });
});
