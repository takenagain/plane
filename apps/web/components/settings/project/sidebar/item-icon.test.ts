import { describe, expect, it } from "vitest";
import { PROJECT_SETTINGS_ICONS } from "./item-icon";

describe("PROJECT_SETTINGS_ICONS", () => {
  it("provides an icon for AI agent settings", () => {
    expect(PROJECT_SETTINGS_ICONS.ai_agent).toBeDefined();
  });
});
