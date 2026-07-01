type TExpectMatcher = {
  toBe: (expected: string | number) => void;
  toBeNaN: () => void;
};

declare const describe: (name: string, callback: () => void) => void;
declare const it: (name: string, callback: () => void) => void;
declare const expect: (received: unknown) => TExpectMatcher;

import {
  formatDuration,
  formatElapsedDurationCompact,
  formatElapsedDurationFull,
  getElapsedSeconds,
  parseDuration,
} from "../worklog.helpers";

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

describe("getElapsedSeconds", () => {
  it("returns 0 for invalid dates", () => {
    expect(getElapsedSeconds("not-a-date")).toBe(0);
  });

  it("calculates elapsed seconds from created_at", () => {
    expect(getElapsedSeconds("2026-03-17T10:00:00.000Z", Date.parse("2026-03-17T10:01:05.000Z"))).toBe(65);
  });
});

describe("formatElapsedDurationCompact", () => {
  it("formats sub-hour durations as minutes and seconds", () => {
    expect(formatElapsedDurationCompact(59)).toBe("0m 59s");
  });

  it("formats hourly durations as hours and minutes", () => {
    expect(formatElapsedDurationCompact(3725)).toBe("1h 2m");
  });
});

describe("formatElapsedDurationFull", () => {
  it("formats elapsed seconds as hh:mm:ss", () => {
    expect(formatElapsedDurationFull(3725)).toBe("01:02:05");
  });

  it("returns zeroed time for invalid values", () => {
    expect(formatElapsedDurationFull(NaN)).toBe("00:00:00");
  });
});
