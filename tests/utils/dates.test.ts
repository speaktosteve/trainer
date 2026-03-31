import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import {
  getWeekStart,
  getWeekEnd,
  formatDisplayDate,
  formatShortDate,
  reverseTimestamp,
  fromReverseTimestamp,
  safeParseDate,
} from "$lib/utils/dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("getWeekStart", () => {
  it("returns Monday for a Wednesday", () => {
    // 2026-04-01 is a Wednesday
    const result = getWeekStart(new Date(2026, 3, 1));
    expect(result).toBe("2026-03-30");
  });

  it("returns same day for a Monday", () => {
    // 2026-03-30 is a Monday
    const result = getWeekStart(new Date(2026, 2, 30));
    expect(result).toBe("2026-03-30");
  });

  it("returns previous Monday for a Sunday", () => {
    // 2026-04-05 is a Sunday
    const result = getWeekStart(new Date(2026, 3, 5));
    expect(result).toBe("2026-03-30");
  });

  it("returns previous Monday for a Saturday", () => {
    // 2026-04-04 is a Saturday
    const result = getWeekStart(new Date(2026, 3, 4));
    expect(result).toBe("2026-03-30");
  });

  it("uses today when no argument is provided", () => {
    const fakeToday = new Date(2026, 3, 1); // Wednesday 2026-04-01
    vi.useFakeTimers();
    vi.setSystemTime(fakeToday);
    const result = getWeekStart();
    expect(result).toBe("2026-03-30");
  });
});

describe("getWeekEnd", () => {
  it("returns Sunday for a Wednesday", () => {
    const result = getWeekEnd(new Date(2026, 3, 1));
    expect(result).toBe("2026-04-05");
  });

  it("returns same day for a Sunday", () => {
    // 2026-04-05 is a Sunday
    const result = getWeekEnd(new Date(2026, 3, 5));
    expect(result).toBe("2026-04-05");
  });

  it("returns the following Sunday for a Monday", () => {
    // 2026-03-30 is a Monday
    const result = getWeekEnd(new Date(2026, 2, 30));
    expect(result).toBe("2026-04-05");
  });

  it("uses today when no argument is provided", () => {
    const fakeToday = new Date(2026, 3, 1); // Wednesday 2026-04-01
    vi.useFakeTimers();
    vi.setSystemTime(fakeToday);
    const result = getWeekEnd();
    expect(result).toBe("2026-04-05");
  });
});

describe("formatDisplayDate", () => {
  it("formats a valid date", () => {
    expect(formatDisplayDate("2026-03-30")).toBe("Mon 30 Mar");
  });

  it("formats a mid-week date", () => {
    expect(formatDisplayDate("2026-04-01")).toBe("Wed 1 Apr");
  });

  it("returns input for invalid date", () => {
    expect(formatDisplayDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatShortDate", () => {
  it("formats a valid date", () => {
    expect(formatShortDate("2026-03-30")).toBe("30 Mar");
  });

  it("formats another valid date", () => {
    expect(formatShortDate("2026-12-25")).toBe("25 Dec");
  });

  it("returns input for invalid date", () => {
    expect(formatShortDate("bad-date")).toBe("bad-date");
  });
});

describe("reverseTimestamp / fromReverseTimestamp", () => {
  it("round-trips correctly", () => {
    const now = new Date(2026, 2, 30, 12, 0, 0);
    const reversed = reverseTimestamp(now);
    const recovered = fromReverseTimestamp(reversed);
    expect(recovered.getTime()).toBe(now.getTime());
  });

  it("newer dates produce smaller strings (sort first)", () => {
    const older = new Date(2026, 0, 1);
    const newer = new Date(2026, 2, 30);
    expect(reverseTimestamp(newer) < reverseTimestamp(older)).toBe(true);
  });

  it("produces a zero-padded 13-character string", () => {
    // Use a very recent timestamp so the reverse is small — check padding
    const ts = reverseTimestamp(new Date(9999999999998));
    expect(ts).toHaveLength(13);
    expect(ts).toBe("0000000000001");
  });

  it("uses now when no argument is provided", () => {
    // Reverse timestamps are inverted: a newer (larger) date.getTime() produces
    // a SMALLER reverse value. So a timestamp created from 1 second in the future
    // will be SMALLER than the result, and a timestamp from 1 second in the past
    // will be LARGER than the result.
    const smallerBound = reverseTimestamp(new Date(Date.now() + 1000)); // future → smaller reverse
    const result = reverseTimestamp(); // now → middle reverse
    const largerBound = reverseTimestamp(new Date(Date.now() - 1000)); // past → larger reverse
    expect(result >= smallerBound).toBe(true);
    expect(result <= largerBound).toBe(true);
  });
});

describe("safeParseDate", () => {
  it("parses a valid ISO date", () => {
    const d = safeParseDate("2026-03-30");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
  });

  it("parses a valid ISO datetime string", () => {
    const d = safeParseDate("2026-06-15");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(5); // June = index 5
  });

  it("returns null for invalid input", () => {
    expect(safeParseDate("garbage")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeParseDate("")).toBeNull();
  });
});

describe("getWeekStart", () => {
  it("returns Monday for a Wednesday", () => {
    // 2026-04-01 is a Wednesday
    const result = getWeekStart(new Date(2026, 3, 1));
    expect(result).toBe("2026-03-30");
  });

  it("returns same day for a Monday", () => {
    // 2026-03-30 is a Monday
    const result = getWeekStart(new Date(2026, 2, 30));
    expect(result).toBe("2026-03-30");
  });

  it("returns previous Monday for a Sunday", () => {
    // 2026-04-05 is a Sunday
    const result = getWeekStart(new Date(2026, 3, 5));
    expect(result).toBe("2026-03-30");
  });

  it("returns previous Monday for a Saturday", () => {
    // 2026-04-04 is a Saturday
    const result = getWeekStart(new Date(2026, 3, 4));
    expect(result).toBe("2026-03-30");
  });

  it("uses today when no argument is provided", () => {
    const fakeToday = new Date(2026, 3, 1); // Wednesday 2026-04-01
    vi.useFakeTimers();
    vi.setSystemTime(fakeToday);
    const result = getWeekStart();
    vi.useRealTimers();
    expect(result).toBe("2026-03-30");
  });
});

describe("getWeekEnd", () => {
  it("returns Sunday for a Wednesday", () => {
    const result = getWeekEnd(new Date(2026, 3, 1));
    expect(result).toBe("2026-04-05");
  });

  it("returns same day for a Sunday", () => {
    // 2026-04-05 is a Sunday
    const result = getWeekEnd(new Date(2026, 3, 5));
    expect(result).toBe("2026-04-05");
  });

  it("returns the following Sunday for a Monday", () => {
    // 2026-03-30 is a Monday
    const result = getWeekEnd(new Date(2026, 2, 30));
    expect(result).toBe("2026-04-05");
  });

  it("uses today when no argument is provided", () => {
    const fakeToday = new Date(2026, 3, 1); // Wednesday 2026-04-01
    vi.useFakeTimers();
    vi.setSystemTime(fakeToday);
    const result = getWeekEnd();
    vi.useRealTimers();
    expect(result).toBe("2026-04-05");
  });
});

describe("formatDisplayDate", () => {
  it("formats a valid date", () => {
    expect(formatDisplayDate("2026-03-30")).toBe("Mon 30 Mar");
  });

  it("formats a mid-week date", () => {
    expect(formatDisplayDate("2026-04-01")).toBe("Wed 1 Apr");
  });

  it("returns input for invalid date", () => {
    expect(formatDisplayDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatShortDate", () => {
  it("formats a valid date", () => {
    expect(formatShortDate("2026-03-30")).toBe("30 Mar");
  });

  it("formats another valid date", () => {
    expect(formatShortDate("2026-12-25")).toBe("25 Dec");
  });

  it("returns input for invalid date", () => {
    expect(formatShortDate("bad-date")).toBe("bad-date");
  });
});

describe("reverseTimestamp / fromReverseTimestamp", () => {
  it("round-trips correctly", () => {
    const now = new Date(2026, 2, 30, 12, 0, 0);
    const reversed = reverseTimestamp(now);
    const recovered = fromReverseTimestamp(reversed);
    expect(recovered.getTime()).toBe(now.getTime());
  });

  it("newer dates produce smaller strings (sort first)", () => {
    const older = new Date(2026, 0, 1);
    const newer = new Date(2026, 2, 30);
    expect(reverseTimestamp(newer) < reverseTimestamp(older)).toBe(true);
  });

  it("produces a zero-padded 13-character string", () => {
    // Use a very recent timestamp so the reverse is small — check padding
    const ts = reverseTimestamp(new Date(9999999999998));
    expect(ts).toHaveLength(13);
    expect(ts).toBe("0000000000001");
  });

  it("uses now when no argument is provided", () => {
    const before = reverseTimestamp(new Date(Date.now() + 1000));
    const result = reverseTimestamp();
    const after = reverseTimestamp(new Date(Date.now() - 1000));
    // result should be between before and after (exclusive bounds)
    expect(result >= before).toBe(true);
    expect(result <= after).toBe(true);
  });
});

describe("safeParseDate", () => {
  it("parses a valid ISO date", () => {
    const d = safeParseDate("2026-03-30");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
  });

  it("parses a valid ISO datetime string", () => {
    const d = safeParseDate("2026-06-15");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(5); // June = index 5
  });

  it("returns null for invalid input", () => {
    expect(safeParseDate("garbage")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeParseDate("")).toBeNull();
  });
});
