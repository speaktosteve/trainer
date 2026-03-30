import { describe, it, expect } from 'vitest';
import { MockSummaryProvider } from '$lib/services/summaryService';
import type { ExerciseLog, BodyweightEntry } from '$lib/types';

const provider = new MockSummaryProvider();

function makeLog(overrides: Partial<ExerciseLog> = {}): ExerciseLog {
	return {
		day: 'monday',
		label: 'Push',
		completedDate: '2026-03-30',
		weekStart: '2026-03-30',
		exercises: [
			{
				name: 'Bench Press',
				targetWeight: 62.5,
				targetReps: [6, 6, 6, 6],
				actualWeight: 62.5,
				actualReps: [6, 6, 6, 6]
			}
		],
		...overrides
	};
}

describe('MockSummaryProvider', () => {
	it('generates a summary with weight trend', async () => {
		const weights: BodyweightEntry[] = [
			{ date: '2026-03-20', weight: 77.8 },
			{ date: '2026-03-27', weight: 77.7 }
		];

		const result = await provider.generateSummary('2026-03-30', [], [], weights);
		expect(result.weekStart).toBe('2026-03-30');
		expect(result.text).toContain('stable');
		expect(result.text).toContain('77.7');
	});

	it('detects weight increase improvements', async () => {
		const prevLogs = [
			makeLog({
				weekStart: '2026-03-23',
				exercises: [
					{ name: 'Bench Press', targetWeight: 60, targetReps: [6, 6, 6, 6], actualWeight: 60, actualReps: [6, 6, 6, 6] }
				]
			})
		];
		const currentLogs = [
			makeLog({
				exercises: [
					{ name: 'Bench Press', targetWeight: 62.5, targetReps: [6, 6, 6, 6], actualWeight: 62.5, actualReps: [6, 6, 6, 6] }
				]
			})
		];

		const result = await provider.generateSummary('2026-03-30', currentLogs, prevLogs, []);
		expect(result.text).toContain('Bench Press');
		expect(result.text).toContain('↑');
	});

	it('detects injury notes', async () => {
		const logs = [
			makeLog({
				sessionNotes: 'Listen to your body regarding the injury'
			})
		];

		const result = await provider.generateSummary('2026-03-30', logs, [], []);
		expect(result.text).toContain('⚠️');
		expect(result.text).toContain('injury');
	});

	it('returns a fallback message when no data', async () => {
		const result = await provider.generateSummary('2026-03-30', [], [], []);
		expect(result.text).toContain('consistency');
	});
});
