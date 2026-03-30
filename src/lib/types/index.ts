// ── Core exercise entry ──────────────────────────────────────────────
export interface ExerciseEntry {
	name: string;
	/** Target weight in kg. Omit for bodyweight exercises (e.g. chin-ups). */
	targetWeight?: number;
	/** Target reps per set, e.g. [6,6,6,6]. Length = number of sets. */
	targetReps: number[];
	/** Actual weight used (filled in on completion). */
	actualWeight?: number;
	/** Actual reps achieved per set (filled in on completion). */
	actualReps?: number[];
	/** Per-exercise notes — form cues, progression context, etc. */
	notes?: string;
}

// ── Day type ─────────────────────────────────────────────────────────
export type TrainingDay = 'monday' | 'tuesday' | 'wednesday' | 'friday';

// ── Planned session (one day's workout) ──────────────────────────────
export interface PlannedSession {
	day: TrainingDay;
	/** Short label, e.g. "Push", "Lower", "Pull", "Full Body" */
	label: string;
	exercises: ExerciseEntry[];
	/** Session-level notes, e.g. "Listen to your body regarding the injury" */
	sessionNotes?: string;
}

// ── Weekly plan ──────────────────────────────────────────────────────
export interface WeeklyPlan {
	/** ISO date of the Monday that starts this week, e.g. "2026-03-30" */
	weekStart: string;
	sessions: PlannedSession[];
	/** Structured summary of the week's goals (LLM-generated). */
	summary?: WeeklySummary;
}

// ── Exercise log (a completed session) ───────────────────────────────
export interface ExerciseLog extends PlannedSession {
	/** ISO date the session was completed, e.g. "2026-03-30" */
	completedDate: string;
	/** Week start this log belongs to */
	weekStart: string;
}

// ── Bodyweight entry ─────────────────────────────────────────────────
export interface BodyweightEntry {
	/** ISO date, e.g. "2026-01-21" */
	date: string;
	/** Weight in kg */
	weight: number;
}

// ── AI summary ───────────────────────────────────────────────────────
export interface SummaryLine {
	icon: string;
	label: string;
	detail: string;
}

export interface WeeklySummary {
	weekStart: string;
	text: string;
	headline: string;
	lines: SummaryLine[];
}

// ── Table storage entity shapes ──────────────────────────────────────
export interface PlanEntity {
	partitionKey: string;
	rowKey: string; // weekStart date
	data: string; // JSON-serialised WeeklyPlan
}

export interface ExerciseLogEntity {
	partitionKey: string;
	rowKey: string; // reverse timestamp
	data: string; // JSON-serialised ExerciseLog
}

export interface BodyweightEntity {
	partitionKey: string;
	rowKey: string; // date
	weight: number;
}
