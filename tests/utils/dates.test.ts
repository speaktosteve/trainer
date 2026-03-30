import { describe, it, expect } from 'vitest';
import {
	getWeekStart,
	getWeekEnd,
	formatDisplayDate,
	formatShortDate,
	reverseTimestamp,
	fromReverseTimestamp,
	safeParseDate
} from '$lib/utils/dates';

describe('getWeekStart', () => {
	it('returns Monday for a Wednesday', () => {
		// 2026-04-01 is a Wednesday
		const result = getWeekStart(new Date(2026, 3, 1));
		expect(result).toBe('2026-03-30');
	});

	it('returns same day for a Monday', () => {
		// 2026-03-30 is a Monday
		const result = getWeekStart(new Date(2026, 2, 30));
		expect(result).toBe('2026-03-30');
	});

	it('returns previous Monday for a Sunday', () => {
		// 2026-04-05 is a Sunday
		const result = getWeekStart(new Date(2026, 3, 5));
		expect(result).toBe('2026-03-30');
	});
});

describe('getWeekEnd', () => {
	it('returns Sunday for a Wednesday', () => {
		const result = getWeekEnd(new Date(2026, 3, 1));
		expect(result).toBe('2026-04-05');
	});
});

describe('formatDisplayDate', () => {
	it('formats a valid date', () => {
		expect(formatDisplayDate('2026-03-30')).toBe('Mon 30 Mar');
	});

	it('returns input for invalid date', () => {
		expect(formatDisplayDate('not-a-date')).toBe('not-a-date');
	});
});

describe('formatShortDate', () => {
	it('formats a valid date', () => {
		expect(formatShortDate('2026-03-30')).toBe('30 Mar');
	});
});

describe('reverseTimestamp / fromReverseTimestamp', () => {
	it('round-trips correctly', () => {
		const now = new Date(2026, 2, 30, 12, 0, 0);
		const reversed = reverseTimestamp(now);
		const recovered = fromReverseTimestamp(reversed);
		expect(recovered.getTime()).toBe(now.getTime());
	});

	it('newer dates produce smaller strings (sort first)', () => {
		const older = new Date(2026, 0, 1);
		const newer = new Date(2026, 2, 30);
		expect(reverseTimestamp(newer) < reverseTimestamp(older)).toBe(true);
	});
});

describe('safeParseDate', () => {
	it('parses a valid ISO date', () => {
		const d = safeParseDate('2026-03-30');
		expect(d).toBeInstanceOf(Date);
		expect(d!.getFullYear()).toBe(2026);
	});

	it('returns null for invalid input', () => {
		expect(safeParseDate('garbage')).toBeNull();
	});
});
