// ── Core exercise entry ──────────────────────────────────────────────
export interface ExerciseEntry {
  /** Stable identifier for an exercise across weeks and day moves. */
  exerciseId?: string;
  name: string;
  /** Target weight in kg. Omit for bodyweight exercises (e.g. chin-ups). */
  targetWeight?: number;
  /** Whether the selected machine is currently at its max available weight. */
  machineWeightMaxedOut?: boolean;
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
export type TrainingDay = "monday" | "tuesday" | "wednesday" | "friday";

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

export interface ExerciseCatalogItem {
  name: string;
  createdAt: string;
}

export interface ExerciseCatalogEntity {
  partitionKey: string;
  rowKey: string; // normalized exercise name
  name: string;
  createdAt: string;
}

export interface BodyweightEntity {
  partitionKey: string;
  rowKey: string; // date
  weight: number;
}

// ── Goals ───────────────────────────────────────────────────────────
export type GoalType = "lifting" | "bodyweight" | "consistency";

export type GoalStatus = "in_progress" | "completed" | "paused" | "missed";

export interface Goal {
  id: string;
  title: string;
  type: GoalType;
  startDate: string;
  targetDate: string;
  targetValue: number;
  /** Baseline used for progress percentage calculations. */
  baselineValue?: number;
  /** Exercise name for lifting goals, e.g. "Bench Press". */
  exerciseName?: string;
  /** Sessions per week target for consistency goals. */
  sessionsPerWeek?: number;
  notes?: string;
  status: GoalStatus;
  createdAt: string;
}

export interface GoalProgressPoint {
  date: string;
  value: number;
}

export interface GoalWithProgress extends Goal {
  currentValue: number;
  progressPercent: number;
  progressPoints: GoalProgressPoint[];
  isOnTrack: boolean;
}

export interface GoalEntity {
  partitionKey: string;
  rowKey: string; // goal id
  data: string; // JSON-serialised Goal
}

export interface GoalRecommendationStateEntity {
  partitionKey: string;
  rowKey: string; // recommendation key
  dismissedAt: string;
}
