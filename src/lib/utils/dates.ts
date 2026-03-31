import { startOfWeek, endOfWeek, format, parseISO, isValid } from "date-fns";

/**
 * Get the Monday-based week start for a given date.
 * Returns ISO date string YYYY-MM-DD.
 */
export function getWeekStart(date: Date = new Date()): string {
	const monday = startOfWeek(date, { weekStartsOn: 1 });
	return format(monday, "yyyy-MM-dd");
}

/**
 * Get the Sunday-based week end for a given date.
 * Returns ISO date string YYYY-MM-DD.
 */
export function getWeekEnd(date: Date = new Date()): string {
	const sunday = endOfWeek(date, { weekStartsOn: 1 });
	return format(sunday, "yyyy-MM-dd");
}

/**
 * Format a date string for display, e.g. "Mon 30 Mar".
 */
export function formatDisplayDate(isoDate: string): string {
	const date = parseISO(isoDate);
	if (!isValid(date)) return isoDate;
	return format(date, "EEE d MMM");
}

/**
 * Format a date string as a short label, e.g. "30 Mar".
 */
export function formatShortDate(isoDate: string): string {
	const date = parseISO(isoDate);
	if (!isValid(date)) return isoDate;
	return format(date, "d MMM");
}

/**
 * Create a reverse timestamp row key for recent-first ordering in Table Storage.
 * Uses 9999999999999 - timestamp to ensure newer entries sort first.
 */
export function reverseTimestamp(date: Date = new Date()): string {
	return String(9999999999999 - date.getTime()).padStart(13, "0");
}

/**
 * Recover a Date from a reverse timestamp row key.
 */
export function fromReverseTimestamp(reversed: string): Date {
	return new Date(9999999999999 - Number(reversed));
}

/**
 * Parse an ISO date string safely.
 */
export function safeParseDate(isoDate: string): Date | null {
	const date = parseISO(isoDate);
	return isValid(date) ? date : null;
}
