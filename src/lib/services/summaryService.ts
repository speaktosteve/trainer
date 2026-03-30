import type { ExerciseLog, BodyweightEntry, WeeklySummary } from '$lib/types';

/**
 * Summary provider interface — swap this implementation
 * with a real AI provider (Azure OpenAI, etc.) later.
 */
export interface SummaryProvider {
	generateSummary(
		weekStart: string,
		currentLogs: ExerciseLog[],
		previousLogs: ExerciseLog[],
		weightHistory: BodyweightEntry[]
	): Promise<WeeklySummary>;
}

/**
 * Mock summary provider that generates a template-based summary
 * by scanning recent logs for progress indicators.
 */
export class MockSummaryProvider implements SummaryProvider {
	async generateSummary(
		weekStart: string,
		currentLogs: ExerciseLog[],
		previousLogs: ExerciseLog[],
		weightHistory: BodyweightEntry[]
	): Promise<WeeklySummary> {
		const lines: string[] = [];
		lines.push(`**Week Focus (${weekStart})**`);

		// Weight trend
		if (weightHistory.length >= 2) {
			const latest = weightHistory[weightHistory.length - 1];
			const prev = weightHistory[weightHistory.length - 2];
			const diff = latest.weight - prev.weight;
			const trend = diff > 0.2 ? 'up' : diff < -0.2 ? 'down' : 'stable';
			lines.push(
				`Bodyweight ${trend} at ${latest.weight} kg (${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg).`
			);
		}

		// Compare exercises between weeks
		const improvements = findImprovements(currentLogs, previousLogs);
		if (improvements.length > 0) {
			lines.push(`Progress: ${improvements.join('; ')}.`);
		}

		// Check for injury notes
		const injuryNotes = findInjuryNotes(currentLogs.concat(previousLogs));
		if (injuryNotes.length > 0) {
			lines.push(`⚠️ ${injuryNotes[0]}`);
		}

		if (lines.length === 1) {
			lines.push('Keep pushing — consistency is key. Log your sessions to track progress.');
		}

		return {
			weekStart,
			text: lines.join(' ')
		};
	}
}

function findImprovements(current: ExerciseLog[], previous: ExerciseLog[]): string[] {
	const improvements: string[] = [];
	const prevMap = new Map<string, { weight?: number; totalReps: number }>();

	for (const log of previous) {
		for (const ex of log.exercises) {
			const key = `${ex.name}|${log.day}`;
			const totalReps = (ex.actualReps ?? ex.targetReps).reduce((a, b) => a + b, 0);
			prevMap.set(key, { weight: ex.actualWeight ?? ex.targetWeight, totalReps });
		}
	}

	for (const log of current) {
		for (const ex of log.exercises) {
			const key = `${ex.name}|${log.day}`;
			const prev = prevMap.get(key);
			if (!prev) continue;

			const currentWeight = ex.actualWeight ?? ex.targetWeight;
			const currentReps = (ex.actualReps ?? ex.targetReps).reduce((a, b) => a + b, 0);

			if (currentWeight && prev.weight && currentWeight > prev.weight) {
				improvements.push(`${ex.name} weight ↑ ${prev.weight}→${currentWeight} kg`);
			} else if (currentReps > prev.totalReps) {
				improvements.push(`${ex.name} volume ↑ ${prev.totalReps}→${currentReps} reps`);
			}
		}
	}

	return improvements.slice(0, 5); // Cap at 5 highlights
}

function findInjuryNotes(logs: ExerciseLog[]): string[] {
	const notes: string[] = [];
	for (const log of logs) {
		if (log.sessionNotes && /injur|pain|careful|caution/i.test(log.sessionNotes)) {
			notes.push(log.sessionNotes);
		}
		for (const ex of log.exercises) {
			if (ex.notes && /injur|pain|careful|caution/i.test(ex.notes)) {
				notes.push(ex.notes);
			}
		}
	}
	return notes;
}

/** Default singleton — use this in API routes */
export const summaryProvider: SummaryProvider = new MockSummaryProvider();
