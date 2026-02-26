/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import assert from "node:assert/strict";
import { formatDuration, parseDuration } from "../worklog.helpers";

declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;

const expect = (received: unknown) => ({
  toBe: (expected: unknown) => {
    assert.strictEqual(received, expected);
  },
  toBeNaN: () => {
    assert.equal(typeof received, "number");
    assert.ok(Number.isNaN(received));
  },
});

describe("formatDuration", () => {
  it("formats 150 minutes as 2h 30m", () => {
    expect(formatDuration(150)).toBe("2h 30m");
  });

  it("formats 45 minutes as 0h 45m", () => {
    expect(formatDuration(45)).toBe("0h 45m");
  });

  it("formats 0 minutes as 0h 0m", () => {
    expect(formatDuration(0)).toBe("0h 0m");
  });

  it("formats 60 minutes as 1h 0m", () => {
    expect(formatDuration(60)).toBe("1h 0m");
  });

  it("formats 1 minute as 0h 1m", () => {
    expect(formatDuration(1)).toBe("0h 1m");
  });

  it("formats 480 minutes as 8h 0m", () => {
    expect(formatDuration(480)).toBe("8h 0m");
  });

  it("formats 99999 minutes correctly", () => {
    // 99999 minutes = 1666 hours and 39 minutes
    expect(formatDuration(99999)).toBe("1666h 39m");
  });

  it("returns 0h 0m for negative input", () => {
    expect(formatDuration(-10)).toBe("0h 0m");
  });

  it("returns 0h 0m for NaN input", () => {
    expect(formatDuration(NaN)).toBe("0h 0m");
  });

  it("returns 0h 0m for Infinity input", () => {
    expect(formatDuration(Infinity)).toBe("0h 0m");
  });

  it("returns 0h 0m for -Infinity input", () => {
    expect(formatDuration(-Infinity)).toBe("0h 0m");
  });
});

describe("parseDuration", () => {
  it("parses 2 hours 30 minutes as 150", () => {
    expect(parseDuration(2, 30)).toBe(150);
  });

  it("parses 0 hours 0 minutes as 0", () => {
    expect(parseDuration(0, 0)).toBe(0);
  });

  it("parses 1 hour 0 minutes as 60", () => {
    expect(parseDuration(1, 0)).toBe(60);
  });

  it("parses 0 hours 59 minutes as 59", () => {
    expect(parseDuration(0, 59)).toBe(59);
  });

  it("parses large hours correctly", () => {
    expect(parseDuration(1666, 39)).toBe(99999);
  });

  it("returns NaN for negative hours", () => {
    expect(parseDuration(-1, 30)).toBeNaN();
  });

  it("returns NaN for negative minutes", () => {
    expect(parseDuration(1, -5)).toBeNaN();
  });

  it("returns NaN for minutes > 59", () => {
    expect(parseDuration(1, 60)).toBeNaN();
  });

  it("returns NaN for NaN hours", () => {
    expect(parseDuration(NaN, 30)).toBeNaN();
  });

  it("returns NaN for NaN minutes", () => {
    expect(parseDuration(2, NaN)).toBeNaN();
  });

  it("returns NaN for Infinity hours", () => {
    expect(parseDuration(Infinity, 0)).toBeNaN();
  });

  it("returns NaN for Infinity minutes", () => {
    expect(parseDuration(0, Infinity)).toBeNaN();
  });
});
