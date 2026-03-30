/**
 * Seed script — populates Azure Table Storage (or Azurite) with:
 * - Current week plan (w/c 2026-03-30)
 * - 6 weeks of exercise history
 * - Bodyweight log
 *
 * Usage: npm run seed
 * Requires AZURE_STORAGE_CONNECTION_STRING in .env
 */
import { TableClient, TableServiceClient } from '@azure/data-tables';
import * as dotenv from 'dotenv';
import type { WeeklyPlan, ExerciseLog, BodyweightEntry } from '../src/lib/types/index.js';

dotenv.config();

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!connStr) {
	console.error('❌ Set AZURE_STORAGE_CONNECTION_STRING in .env');
	process.exit(1);
}

const DEFAULT_PK = 'default';

function reverseTimestamp(date: Date): string {
	return String(9999999999999 - date.getTime()).padStart(13, '0');
}

async function ensureTable(name: string): Promise<TableClient> {
	const svc = TableServiceClient.fromConnectionString(connStr!);
	await svc.createTable(name).catch(() => {});
	return TableClient.fromConnectionString(connStr!, name);
}

// ── Current week plan ────────────────────────────────────────────────
const currentPlan: WeeklyPlan = {
	weekStart: '2026-03-30',
	sessions: [
		{
			day: 'monday',
			label: 'Push',
			exercises: [
				{ name: 'Bench Press', targetWeight: 62.5, targetReps: [6, 6, 6, 6], notes: 'Small jump since 60 kg felt good' },
				{ name: 'Incline DB Press', targetWeight: 18, targetReps: [10, 10, 10, 10], notes: 'Time to level up from the 16s' },
				{ name: 'Seated Shoulder Press', targetWeight: 14, targetReps: [10, 10, 10], notes: 'Clean up the reps from last week' },
				{ name: 'Lateral Raises', targetWeight: 9, targetReps: [12, 12, 12] },
				{ name: 'Tricep Pushdown', targetWeight: 54.4, targetReps: [10, 10, 10], notes: 'Matching your Friday win' },
				{ name: 'Row (slow form)', targetWeight: 109, targetReps: [8, 8, 8] },
				{ name: 'Seated Chest Press', targetWeight: 109, targetReps: [10, 10, 10], notes: 'Adding 1 rep per set' }
			]
		},
		{
			day: 'tuesday',
			label: 'Lower',
			sessionNotes: 'Listen to your body regarding the injury',
			exercises: [
				{ name: 'Leg Press', targetWeight: 145, targetReps: [10, 10, 10] },
				{ name: 'Leg Press Calves', targetWeight: 106.6, targetReps: [14, 14, 14, 20] },
				{ name: 'RDL', targetWeight: 62.5, targetReps: [8, 8, 8] },
				{ name: 'Squat', targetWeight: 75, targetReps: [6, 6, 6] },
				{ name: 'Leg Curl', targetWeight: 63, targetReps: [12, 12, 12] },
				{ name: 'Leg Extension', targetWeight: 75, targetReps: [10, 10, 10] }
			]
		},
		{
			day: 'wednesday',
			label: 'Pull',
			exercises: [
				{ name: 'Chin-ups', targetReps: [10, 10, 9], notes: 'Pushing for one more rep on the last set' },
				{ name: 'Seated Row', targetWeight: 111, targetReps: [10, 10, 10, 10], notes: 'Small 2 kg bump' },
				{ name: 'Lat Pull', targetWeight: 65, targetReps: [12, 12, 12], notes: 'Micro-increase' },
				{ name: 'DB Curl', targetWeight: 14, targetReps: [10, 10, 10], notes: 'Moving away from the 12s' },
				{ name: 'Hammer Curl', targetWeight: 14, targetReps: [8, 8, 8] },
				{ name: 'Cable Curl', targetWeight: 47.5, targetReps: [12, 12, 12] }
			]
		},
		{
			day: 'friday',
			label: 'Full Body',
			exercises: [
				{ name: 'Bench Press', targetWeight: 67.5, targetReps: [5, 5, 5, 5, 5], notes: 'Goal: get 5 reps on that final set' },
				{ name: 'Leg Press', targetWeight: 152.1, targetReps: [8, 8, 8] },
				{ name: 'Seated Row', targetWeight: 109, targetReps: [10, 10, 10] },
				{ name: 'Seated Shoulder Press', targetWeight: 16, targetReps: [10, 10, 10] },
				{ name: 'Cable Curl', targetWeight: 52, targetReps: [10, 10, 10] },
				{ name: 'Tricep Pushdown', targetWeight: 56.5, targetReps: [10, 10, 10], notes: 'Small bump since you\'re moving 54.4 kg well' },
				{ name: 'Smith Shoulder Press', targetWeight: 42.5, targetReps: [10, 10, 10], notes: 'Small increase' }
			]
		}
	]
};

// ── 6 weeks of history ───────────────────────────────────────────────
// Week 1 = w/c 2026-02-16, ... Week 6 = w/c 2026-03-23
function weekDate(weekNum: number): string {
	const base = new Date(2026, 1, 16); // Feb 16
	base.setDate(base.getDate() + (weekNum - 1) * 7);
	return base.toISOString().slice(0, 10);
}

function dayDate(weekStart: string, dayOffset: number): string {
	const d = new Date(weekStart);
	d.setDate(d.getDate() + dayOffset);
	return d.toISOString().slice(0, 10);
}

const historyLogs: ExerciseLog[] = [
	// ── Week 1 ──
	{
		day: 'monday', label: 'Push', weekStart: weekDate(1), completedDate: dayDate(weekDate(1), 0),
		exercises: [
			{ name: 'Bench Press', targetWeight: 50, targetReps: [6, 6, 6, 6], actualWeight: 50, actualReps: [6, 6, 6, 4] },
			{ name: 'Incline DB Press', targetWeight: 14, targetReps: [8, 8, 8], actualWeight: 14, actualReps: [8, 8, 8] },
			{ name: 'Seated Shoulder Press', targetWeight: 14, targetReps: [6, 6, 6], actualWeight: 14, actualReps: [6, 4, 4] },
			{ name: 'Lateral Raises', targetWeight: 6, targetReps: [10, 10, 10], actualWeight: 6, actualReps: [10, 10, 8] },
			{ name: 'Tricep Pushdown', targetWeight: 45, targetReps: [8, 8, 8], actualWeight: 45, actualReps: [8, 8, 8] },
			{ name: 'Seated Row', targetWeight: 102, targetReps: [6, 6, 6], actualWeight: 102, actualReps: [6, 6, 6] }
		]
	},
	{
		day: 'tuesday', label: 'Lower', weekStart: weekDate(1), completedDate: dayDate(weekDate(1), 1),
		exercises: [
			{ name: 'Leg Press', targetWeight: 88, targetReps: [10, 10, 10], actualWeight: 88, actualReps: [10, 10, 10] },
			{ name: 'Squat', targetWeight: 50, targetReps: [6, 6, 6], actualWeight: 50, actualReps: [6, 6, 6] },
			{ name: 'RDL', targetWeight: 40, targetReps: [8, 8, 8], actualWeight: 40, actualReps: [8, 8, 8] },
			{ name: 'Leg Curl', targetWeight: 40, targetReps: [12, 12, 12], actualWeight: 40, actualReps: [12, 12, 12] },
			{ name: 'Leg Extension', targetWeight: 54, targetReps: [10, 10, 10], actualWeight: 54, actualReps: [10, 10, 10] }
		]
	},
	{
		day: 'wednesday', label: 'Pull', weekStart: weekDate(1), completedDate: dayDate(weekDate(1), 2),
		exercises: [
			{ name: 'Chin-ups', targetReps: [5, 5, 5], actualReps: [3, 4, 3] },
			{ name: 'Seated Row', targetWeight: 102, targetReps: [8, 8, 8], actualWeight: 102, actualReps: [6, 6, 6] },
			{ name: 'DB Curl', targetWeight: 12, targetReps: [8, 8, 8], actualWeight: 12, actualReps: [6, 6, 6] },
			{ name: 'Cable Curl', targetWeight: 22, targetReps: [12, 12, 12], actualWeight: 22, actualReps: [12, 12, 12] }
		]
	},
	{
		day: 'friday', label: 'Full Body', weekStart: weekDate(1), completedDate: dayDate(weekDate(1), 4),
		exercises: [
			{ name: 'Bench Press', targetWeight: 52.5, targetReps: [5, 5, 5, 5], actualWeight: 52.5, actualReps: [5, 5, 5, 5] },
			{ name: 'Smith Shoulder Press', targetWeight: 30, targetReps: [8, 8, 8], actualWeight: 30, actualReps: [8, 6, 6] }
		]
	},

	// ── Week 2 ──
	{
		day: 'monday', label: 'Push', weekStart: weekDate(2), completedDate: dayDate(weekDate(2), 0),
		exercises: [
			{ name: 'Bench Press', targetWeight: 50, targetReps: [6, 6, 6, 6], actualWeight: 50, actualReps: [6, 6, 6, 6] },
			{ name: 'Incline DB Press', targetWeight: 14, targetReps: [9, 9, 9], actualWeight: 14, actualReps: [9, 9, 9] },
			{ name: 'Tricep Pushdown', targetWeight: 45, targetReps: [9, 9, 9], actualWeight: 45, actualReps: [9, 9, 9] },
			{ name: 'Seated Row', targetWeight: 109, targetReps: [8, 8, 8], actualWeight: 109, actualReps: [8, 8, 8] }
		]
	},
	{
		day: 'tuesday', label: 'Lower', weekStart: weekDate(2), completedDate: dayDate(weekDate(2), 1),
		exercises: [
			{ name: 'Leg Press', targetWeight: 115, targetReps: [10, 10, 10], actualWeight: 115, actualReps: [10, 10, 10] },
			{ name: 'Squat', targetWeight: 52.5, targetReps: [6, 6, 6], actualWeight: 52.5, actualReps: [6, 6, 10] },
			{ name: 'RDL', targetWeight: 45, targetReps: [8, 8, 8], actualWeight: 45, actualReps: [8, 8, 8] },
			{ name: 'Leg Curl', targetWeight: 47, targetReps: [12, 12, 12], actualWeight: 47, actualReps: [12, 12, 12] },
			{ name: 'Leg Extension', targetWeight: 60, targetReps: [10, 10, 10], actualWeight: 60, actualReps: [10, 10, 10] }
		]
	},
	{
		day: 'wednesday', label: 'Pull', weekStart: weekDate(2), completedDate: dayDate(weekDate(2), 2),
		exercises: [
			{ name: 'Chin-ups', targetReps: [5, 5, 5], actualReps: [4, 4, 4] },
			{ name: 'DB Curl', targetWeight: 10, targetReps: [8, 8, 8], actualWeight: 10, actualReps: [8, 8, 8] },
			{ name: 'Cable Curl', targetWeight: 25, targetReps: [12, 12, 12], actualWeight: 25, actualReps: [12, 12, 12] }
		]
	},
	{
		day: 'friday', label: 'Full Body', weekStart: weekDate(2), completedDate: dayDate(weekDate(2), 4),
		exercises: [
			{ name: 'Bench Press', targetWeight: 55, targetReps: [5, 5, 5, 5, 5], actualWeight: 55, actualReps: [5, 5, 5, 5, 5] },
			{ name: 'Smith Shoulder Press', targetWeight: 32.5, targetReps: [8, 8, 8], actualWeight: 32.5, actualReps: [8, 8, 8] }
		]
	},

	// ── Week 3 ──
	{
		day: 'monday', label: 'Push', weekStart: weekDate(3), completedDate: dayDate(weekDate(3), 0),
		exercises: [
			{ name: 'Bench Press', targetWeight: 55, targetReps: [6, 6, 6, 6], actualWeight: 55, actualReps: [6, 6, 6, 6] },
			{ name: 'Incline DB Press', targetWeight: 16, targetReps: [9, 9, 9], actualWeight: 16, actualReps: [9, 9, 9] },
			{ name: 'Seated Shoulder Press', targetWeight: 12, targetReps: [8, 8, 8], actualWeight: 12, actualReps: [8, 8, 8] },
			{ name: 'Lateral Raises', targetWeight: 9, targetReps: [12, 12, 12], actualWeight: 9, actualReps: [12, 12, 10] },
			{ name: 'Seated Row', targetWeight: 109, targetReps: [8, 8, 8], actualWeight: 109, actualReps: [8, 8, 8] }
		]
	},
	{
		day: 'tuesday', label: 'Lower', weekStart: weekDate(3), completedDate: dayDate(weekDate(3), 1),
		exercises: [
			{ name: 'Leg Press', targetWeight: 133, targetReps: [10, 10, 10], actualWeight: 133, actualReps: [10, 10, 10] },
			{ name: 'Squat', targetWeight: 65, targetReps: [6, 6, 6], actualWeight: 65, actualReps: [6, 6, 6] },
			{ name: 'RDL', targetWeight: 50, targetReps: [8, 8, 8], actualWeight: 50, actualReps: [8, 8, 8] },
			{ name: 'Leg Curl', targetWeight: 50, targetReps: [12, 12, 12], actualWeight: 50, actualReps: [12, 12, 12] },
			{ name: 'Leg Extension', targetWeight: 61, targetReps: [10, 10, 10], actualWeight: 61, actualReps: [10, 10, 10] }
		]
	},
	{
		day: 'wednesday', label: 'Pull', weekStart: weekDate(3), completedDate: dayDate(weekDate(3), 2),
		exercises: [
			{ name: 'Chin-ups', targetReps: [6, 6, 6], actualReps: [6, 6, 5] },
			{ name: 'DB Curl', targetWeight: 10, targetReps: [10, 10, 10], actualWeight: 10, actualReps: [10, 9, 10] },
			{ name: 'Cable Curl', targetWeight: 31, targetReps: [12, 12, 12], actualWeight: 31, actualReps: [12, 12, 12] }
		]
	},
	{
		day: 'friday', label: 'Full Body', weekStart: weekDate(3), completedDate: dayDate(weekDate(3), 4),
		exercises: [
			{ name: 'Bench Press', targetWeight: 57.5, targetReps: [5, 5, 5, 5, 5], actualWeight: 57.5, actualReps: [5, 5, 5, 5, 5] },
			{ name: 'Smith Shoulder Press', targetWeight: 32.5, targetReps: [8, 8, 8], actualWeight: 32.5, actualReps: [8, 8, 8] }
		]
	},

	// ── Week 4 ──
	{
		day: 'monday', label: 'Push', weekStart: weekDate(4), completedDate: dayDate(weekDate(4), 0),
		exercises: [
			{ name: 'Bench Press', targetWeight: 57.5, targetReps: [6, 6, 6, 6], actualWeight: 57.5, actualReps: [6, 6, 6, 6] },
			{ name: 'Incline DB Press', targetWeight: 16, targetReps: [12, 12, 12], actualWeight: 16, actualReps: [12, 12, 10] },
			{ name: 'Seated Shoulder Press', targetWeight: 14, targetReps: [10, 10, 10], actualWeight: 14, actualReps: [10, 9, 7] },
			{ name: 'Lateral Raises', targetWeight: 9, targetReps: [12, 12, 12], actualWeight: 9, actualReps: [12, 12, 12] },
			{ name: 'Seated Row', targetWeight: 109, targetReps: [10, 10, 10], actualWeight: 109, actualReps: [10, 10, 10] }
		]
	},
	{
		day: 'tuesday', label: 'Lower', weekStart: weekDate(4), completedDate: dayDate(weekDate(4), 1),
		exercises: [
			{ name: 'Leg Press', targetWeight: 140, targetReps: [10, 10, 10], actualWeight: 140, actualReps: [10, 10, 10] },
			{ name: 'Squat', targetWeight: 70, targetReps: [6, 6, 6], actualWeight: 70, actualReps: [6, 6, 8] },
			{ name: 'RDL', targetWeight: 55, targetReps: [8, 8, 8], actualWeight: 55, actualReps: [8, 8, 8] },
			{ name: 'Leg Curl', targetWeight: 54, targetReps: [12, 12, 12], actualWeight: 54, actualReps: [12, 12, 12] },
			{ name: 'Leg Extension', targetWeight: 63, targetReps: [10, 10, 10], actualWeight: 63, actualReps: [10, 10, 10] }
		]
	},
	{
		day: 'wednesday', label: 'Pull', weekStart: weekDate(4), completedDate: dayDate(weekDate(4), 2),
		exercises: [
			{ name: 'Chin-ups', targetReps: [10, 10, 10], actualReps: [10, 7, 4] },
			{ name: 'DB Curl', targetWeight: 12, targetReps: [10, 10, 10], actualWeight: 12, actualReps: [10, 10, 10] },
			{ name: 'Hammer Curl', targetWeight: 14, targetReps: [8, 8, 8], actualWeight: 14, actualReps: [6, 5, 5] },
			{ name: 'Cable Curl', targetWeight: 38, targetReps: [12, 12, 12], actualWeight: 38, actualReps: [12, 12, 12] }
		]
	},
	{
		day: 'friday', label: 'Full Body', weekStart: weekDate(4), completedDate: dayDate(weekDate(4), 4),
		exercises: [
			{ name: 'Bench Press', targetWeight: 60, targetReps: [5, 5, 5, 5, 5], actualWeight: 60, actualReps: [5, 5, 5, 5, 5] },
			{ name: 'Smith Shoulder Press', targetWeight: 35, targetReps: [10, 10, 10], actualWeight: 35, actualReps: [9, 8, 8] },
			{ name: 'Tricep Pushdown', targetWeight: 48, targetReps: [10, 10, 10], actualWeight: 48, actualReps: [10, 10, 10] }
		]
	},

	// ── Week 5 ──
	{
		day: 'monday', label: 'Push', weekStart: weekDate(5), completedDate: dayDate(weekDate(5), 0),
		exercises: [
			{ name: 'Bench Press', targetWeight: 60, targetReps: [6, 6, 6, 6], actualWeight: 60, actualReps: [6, 6, 6] },
			{ name: 'Incline DB Press', targetWeight: 16, targetReps: [10, 10, 10], actualWeight: 16, actualReps: [10, 10, 10] },
			{ name: 'Tricep Pushdown', targetWeight: 50, targetReps: [10, 10, 10], actualWeight: 50, actualReps: [10, 10, 10] },
			{ name: 'Seated Row', targetWeight: 109, targetReps: [10, 10, 10], actualWeight: 109, actualReps: [10, 10, 10] }
		]
	},
	{
		day: 'tuesday', label: 'Lower', weekStart: weekDate(5), completedDate: dayDate(weekDate(5), 1),
		exercises: [
			{ name: 'Leg Press', targetWeight: 152, targetReps: [10, 10, 10], actualWeight: 152, actualReps: [10, 10, 10] },
			{ name: 'Squat', targetWeight: 75, targetReps: [6, 6, 6], actualWeight: 75, actualReps: [6, 6] },
			{ name: 'RDL', targetWeight: 60, targetReps: [8, 8, 8], actualWeight: 60, actualReps: [8, 8, 8] },
			{ name: 'Leg Curl', targetWeight: 61, targetReps: [12, 12, 12], actualWeight: 61, actualReps: [12, 12, 12] },
			{ name: 'Leg Extension', targetWeight: 72, targetReps: [10, 10, 10], actualWeight: 72, actualReps: [10, 10, 10] }
		]
	},
	{
		day: 'wednesday', label: 'Pull', weekStart: weekDate(5), completedDate: dayDate(weekDate(5), 2),
		exercises: [
			{ name: 'Chin-ups', targetReps: [10, 10, 10], actualReps: [10, 10, 6] },
			{ name: 'DB Curl', targetWeight: 12, targetReps: [10, 10, 10], actualWeight: 12, actualReps: [10, 10, 10] },
			{ name: 'Hammer Curl', targetWeight: 14, targetReps: [8, 8, 8], actualWeight: 14, actualReps: [8, 8, 8] },
			{ name: 'Cable Curl', targetWeight: 45, targetReps: [12, 12, 12], actualWeight: 45, actualReps: [12, 12, 12] }
		]
	},
	{
		day: 'friday', label: 'Full Body', weekStart: weekDate(5), completedDate: dayDate(weekDate(5), 4),
		exercises: [
			{ name: 'Bench Press', targetWeight: 65, targetReps: [5, 5, 5, 5, 5], actualWeight: 65, actualReps: [5, 5, 5, 5, 5], notes: 'Also hit 70x2 after' },
			{ name: 'Smith Shoulder Press', targetWeight: 40, targetReps: [10, 10, 10], actualWeight: 40, actualReps: [10, 10, 8] },
			{ name: 'Cable Curl', targetWeight: 49.9, targetReps: [10, 10, 10], actualWeight: 49.9, actualReps: [10, 10, 10] },
			{ name: 'Tricep Pushdown', targetWeight: 54.4, targetReps: [10, 10, 10], actualWeight: 54.4, actualReps: [10, 10, 10] }
		]
	},

	// ── Week 6 (latest) ──
	{
		day: 'monday', label: 'Push', weekStart: weekDate(6), completedDate: dayDate(weekDate(6), 0),
		exercises: [
			{ name: 'Bench Press', targetWeight: 60, targetReps: [6, 6, 6, 6], actualWeight: 60, actualReps: [6, 6, 6, 6] },
			{ name: 'Incline DB Press', targetWeight: 16, targetReps: [10, 10, 10, 10], actualWeight: 16, actualReps: [10, 10, 10, 10] },
			{ name: 'Seated Shoulder Press', targetWeight: 14, targetReps: [10, 10, 10], actualWeight: 14, actualReps: [10, 8, 8] },
			{ name: 'Lateral Raises', targetWeight: 9, targetReps: [12, 12, 12], actualWeight: 9, actualReps: [12, 12, 12] },
			{ name: 'Tricep Pushdown', targetWeight: 52, targetReps: [10, 10, 10], actualWeight: 52, actualReps: [10, 10, 10] },
			{ name: 'Row (slow form)', targetWeight: 109, targetReps: [8, 8, 8], actualWeight: 109, actualReps: [8, 8, 8] }
		]
	},
	{
		day: 'wednesday', label: 'Pull', weekStart: weekDate(6), completedDate: dayDate(weekDate(6), 2),
		exercises: [
			{ name: 'Chin-ups', targetReps: [10, 10, 10], actualReps: [10, 10, 8] },
			{ name: 'Seated Row', targetWeight: 109, targetReps: [10, 10, 10, 10], actualWeight: 109, actualReps: [10, 10, 10, 10] },
			{ name: 'DB Curl', targetWeight: 12, targetReps: [10, 10, 10], actualWeight: 12, actualReps: [10, 10, 10] },
			{ name: 'Hammer Curl', targetWeight: 14, targetReps: [8, 8, 8], actualWeight: 14, actualReps: [8, 8, 8] },
			{ name: 'Cable Curl', targetWeight: 45.4, targetReps: [12, 12, 12], actualWeight: 45.4, actualReps: [12, 12, 12] }
		]
	},
	{
		day: 'friday', label: 'Full Body', weekStart: weekDate(6), completedDate: dayDate(weekDate(6), 4),
		exercises: [
			{ name: 'Bench Press', targetWeight: 67.5, targetReps: [5, 5, 5, 5, 5], actualWeight: 67.5, actualReps: [5, 5, 5, 5, 2] },
			{ name: 'Seated Shoulder Press', targetWeight: 16, targetReps: [10, 10, 10], actualWeight: 16, actualReps: [10, 10, 8] },
			{ name: 'Smith Shoulder Press', targetWeight: 40, targetReps: [10, 10, 10], actualWeight: 40, actualReps: [10, 10, 10] },
			{ name: 'Tricep Pushdown', targetWeight: 54.4, targetReps: [10, 10, 10], actualWeight: 54.4, actualReps: [10, 10, 10] },
			{ name: 'Cable Curl', targetWeight: 49.9, targetReps: [10, 10, 10], actualWeight: 49.9, actualReps: [10, 10, 10] }
		]
	}
];

// ── Bodyweight log ───────────────────────────────────────────────────
const weightLog: BodyweightEntry[] = [
	{ date: '2026-01-21', weight: 76.8 },
	{ date: '2026-01-23', weight: 77.4 },
	{ date: '2026-01-30', weight: 77.9 },
	{ date: '2026-02-06', weight: 77.8 },
	{ date: '2026-02-14', weight: 76.9 },
	{ date: '2026-03-06', weight: 77.2 },
	{ date: '2026-03-13', weight: 77.1 },
	{ date: '2026-03-20', weight: 77.8 },
	{ date: '2026-03-27', weight: 77.7 }
];

// ── Run seed ─────────────────────────────────────────────────────────
async function seed() {
	console.log('🌱 Seeding database...\n');

	// Plans
	const plansClient = await ensureTable('Plans');
	await plansClient.upsertEntity({
		partitionKey: DEFAULT_PK,
		rowKey: currentPlan.weekStart,
		data: JSON.stringify(currentPlan)
	}, 'Replace');
	console.log(`✅ Plan: ${currentPlan.weekStart}`);

	// Also create plan entries for each historical week
	const weekPlans = new Map<string, WeeklyPlan>();
	for (const log of historyLogs) {
		if (!weekPlans.has(log.weekStart)) {
			weekPlans.set(log.weekStart, { weekStart: log.weekStart, sessions: [] });
		}
		weekPlans.get(log.weekStart)!.sessions.push({
			day: log.day,
			label: log.label,
			exercises: log.exercises.map(ex => ({
				name: ex.name,
				targetWeight: ex.targetWeight,
				targetReps: ex.targetReps,
				notes: ex.notes
			})),
			sessionNotes: log.sessionNotes
		});
	}
	for (const [ws, plan] of weekPlans) {
		await plansClient.upsertEntity({
			partitionKey: DEFAULT_PK,
			rowKey: ws,
			data: JSON.stringify(plan)
		}, 'Replace');
		console.log(`✅ Plan: ${ws}`);
	}

	// Exercise logs
	const logsClient = await ensureTable('ExerciseLogs');
	for (const log of historyLogs) {
		const ts = new Date(log.completedDate + 'T' + String(Math.floor(Math.random() * 24)).padStart(2, '0') + ':00:00Z');
		await logsClient.upsertEntity({
			partitionKey: DEFAULT_PK,
			rowKey: reverseTimestamp(ts),
			data: JSON.stringify(log)
		}, 'Replace');
	}
	console.log(`✅ Exercise logs: ${historyLogs.length} sessions`);

	// Bodyweight
	const weightClient = await ensureTable('BodyWeight');
	for (const entry of weightLog) {
		await weightClient.upsertEntity({
			partitionKey: DEFAULT_PK,
			rowKey: entry.date,
			weight: entry.weight
		}, 'Replace');
	}
	console.log(`✅ Bodyweight entries: ${weightLog.length}`);

	console.log('\n🎉 Seed complete!');
}

seed().catch((err) => {
	console.error('❌ Seed failed:', err);
	process.exit(1);
});
