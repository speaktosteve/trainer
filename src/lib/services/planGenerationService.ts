import type { WeeklyPlan, PlannedSession, ExerciseEntry, ExerciseLog } from "$lib/types";
import { getOpenAIClient, getDeploymentName } from "./openaiClient";

/**
 * Plan generation provider interface — swap the implementation
 * for a real LLM-backed provider later.
 */
export interface PlanGenerationProvider {
	generateNextPlan(
		currentPlan: WeeklyPlan,
		completedLogs: ExerciseLog[],
		previousLogs: ExerciseLog[]
	): Promise<WeeklyPlan>;
}

/**
 * Smart copy provider — copies the current plan forward and applies
 * simple progressive overload rules based on completed performance.
 */
export class SmartCopyProvider implements PlanGenerationProvider {
	async generateNextPlan(
		currentPlan: WeeklyPlan,
		completedLogs: ExerciseLog[],
		_previousLogs: ExerciseLog[]
	): Promise<WeeklyPlan> {
		const nextMonday = getNextWeekStart(currentPlan.weekStart);

		// Build a lookup of actual performance this week
		const performanceMap = buildPerformanceMap(completedLogs);

		const sessions: PlannedSession[] = currentPlan.sessions.map((session) => ({
			day: session.day,
			label: session.label,
			sessionNotes: session.sessionNotes,
			exercises: session.exercises.map((ex) => {
				const key = `${ex.name}|${session.day}`;
				const actual = performanceMap.get(key);
				return progressExercise(ex, actual);
			}),
		}));

		return { weekStart: nextMonday, sessions };
	}
}

/**
 * Apply simple progressive overload rules:
 * - If all target reps were hit: bump weight by smallest increment
 * - If reps fell short: keep same weight, maybe note it
 * - Bodyweight exercises: try to add a rep to the weakest set
 */
function progressExercise(
	plan: ExerciseEntry,
	actual: { weight?: number; reps: number[] } | undefined
): ExerciseEntry {
	// No completion data — carry forward as-is
	if (!actual) {
		return {
			name: plan.name,
			targetWeight: plan.targetWeight,
			targetReps: [...plan.targetReps],
			notes: plan.notes,
		};
	}

	const targetTotal = plan.targetReps.reduce((a, b) => a + b, 0);
	const actualTotal = actual.reps.reduce((a, b) => a + b, 0);
	const hitAllReps = actualTotal >= targetTotal;

	// Bodyweight exercise (no target weight)
	if (plan.targetWeight === undefined) {
		if (hitAllReps) {
			// Try adding 1 rep to the lowest set
			const newReps = [...actual.reps];
			const minIdx = newReps.indexOf(Math.min(...newReps));
			newReps[minIdx] += 1;
			return { name: plan.name, targetReps: newReps };
		}
		// Retry same target
		return { name: plan.name, targetReps: [...plan.targetReps] };
	}

	// Weighted exercise
	if (hitAllReps) {
		const increment = plan.targetWeight < 20 ? 1 : 2.5;
		return {
			name: plan.name,
			targetWeight: plan.targetWeight + increment,
			targetReps: [...plan.targetReps],
			notes: `Progressed from ${plan.targetWeight} kg`,
		};
	}

	// Didn't hit target — keep same weight
	return {
		name: plan.name,
		targetWeight: plan.targetWeight,
		targetReps: [...plan.targetReps],
		notes:
			actual.reps.length > 0 ? `Retry — last week hit ${actual.reps.join(", ")} reps` : plan.notes,
	};
}

function buildPerformanceMap(
	logs: ExerciseLog[]
): Map<string, { weight?: number; reps: number[] }> {
	const map = new Map<string, { weight?: number; reps: number[] }>();
	for (const log of logs) {
		for (const ex of log.exercises) {
			if (ex.actualReps) {
				const key = `${ex.name}|${log.day}`;
				map.set(key, {
					weight: ex.actualWeight,
					reps: [...ex.actualReps],
				});
			}
		}
	}
	return map;
}

function getNextWeekStart(currentWeekStart: string): string {
	const d = new Date(currentWeekStart);
	d.setDate(d.getDate() + 7);
	return d.toISOString().slice(0, 10);
}

/** Default singleton */
export const planGenerator: PlanGenerationProvider = new SmartCopyProvider();

/**
 * LLM-backed plan generation provider using Azure OpenAI.
 * Falls back to SmartCopyProvider on error.
 */
export class LLMPlanProvider implements PlanGenerationProvider {
	async generateNextPlan(
		currentPlan: WeeklyPlan,
		completedLogs: ExerciseLog[],
		previousLogs: ExerciseLog[]
	): Promise<WeeklyPlan> {
		try {
			const client = getOpenAIClient();
			const deployment = getDeploymentName();

			const nextWeekStart = getNextWeekStart(currentPlan.weekStart);
			const prompt = this.buildPrompt(currentPlan, completedLogs, previousLogs);

			const response = await client.chat.completions.create({
				model: deployment,
				messages: [
					{
						role: "system",
						content: `You are an expert strength & conditioning coach. Given the current training plan and recent performance data, generate next week's plan with intelligent progressive overload.

Rules:
- If the lifter hit all target reps, increase weight by the smallest sensible increment (1-2.5 kg for upper body, 2.5-5 kg for lower body compounds).
- If they missed reps, keep the same weight and adjust volume down slightly or add a note.
- For bodyweight exercises, add 1 rep to the weakest set if all reps were hit.
- Keep the same session structure (days, labels) unless there's a clear reason to change.
- Add brief "notes" on exercises where you made a change, explaining why.

Return ONLY valid JSON matching this structure (no markdown fences):
{
  "summary": {
    "headline": "Short motivational headline, max 8 words",
    "lines": [
      { "icon": "📈", "label": "Bench Press", "detail": "Progressing to 65kg from 62.5kg" },
      { "icon": "🔒", "label": "Shoulder Press", "detail": "Holding at 14kg, focus on hitting all reps" },
      { "icon": "🏋️", "label": "Sessions", "detail": "4 sessions across upper/lower split" }
    ]
  },
  "weekStart": "YYYY-MM-DD",
  "sessions": [
    {
      "day": "Monday",
      "label": "Upper A",
      "exercises": [
        { "name": "Bench Press", "targetWeight": 82.5, "targetReps": [8, 8, 8], "notes": "Progressed from 80kg" }
      ]
    }
  ]
}

Summary rules:
- "headline": a single punchy coaching sentence (max 8 words) capturing the week's theme.
- "lines": 3-5 lines focused on KEY CHANGES to major compound lifts (bench, squat, deadlift, overhead press, rows). Use 📈 for progressions, 🔒 for consolidation, ⚠️ for caution. Include the specific weight or rep change. Add one line for session structure.
- Do NOT list every exercise — only the headline changes and goals.
- CRITICAL: Only reference data actually provided. If no sessions were completed, do NOT claim reps were hit. Base the summary only on the plan and actual performance data given.
- If no completion data exists, the summary should reflect that the plan is carried forward unchanged or describe the planned structure.
For bodyweight exercises, omit "targetWeight". Always include "name" and "targetReps".`,
					},
					{ role: "user", content: prompt },
				],
				temperature: 0.4,
				max_tokens: 1500,
			});

			const content = response.choices[0]?.message?.content?.trim();
			if (!content) throw new Error("Empty LLM response");

			const parsed = JSON.parse(content) as WeeklyPlan;
			// Ensure the weekStart is correct regardless of what the LLM returns
			parsed.weekStart = nextWeekStart;
			// Ensure summary has required text field
			if (parsed.summary) {
				parsed.summary.weekStart = nextWeekStart;
				parsed.summary.text =
					parsed.summary.lines?.map((l) => `${l.icon} ${l.detail}`).join(" · ") ??
					parsed.summary.headline;
			}
			// Carry forward targetWeight from source plan if the LLM dropped it
			this.backfillWeights(parsed, currentPlan);
			return parsed;
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown LLM error";
			console.error("LLM plan generation failed:", message);
			throw new Error(`LLM plan generation failed: ${message}`, { cause: err });
		}
	}

	/** If the LLM omitted targetWeight for an exercise that had one in the source plan, restore it. */
	private backfillWeights(generated: WeeklyPlan, source: WeeklyPlan): void {
		const weightMap = new Map<string, number>();
		for (const session of source.sessions) {
			for (const ex of session.exercises) {
				if (ex.targetWeight !== undefined) {
					weightMap.set(ex.name, ex.targetWeight);
				}
			}
		}
		for (const session of generated.sessions) {
			for (const ex of session.exercises) {
				if (ex.targetWeight === undefined && weightMap.has(ex.name)) {
					ex.targetWeight = weightMap.get(ex.name)!;
				}
			}
		}
	}

	private buildPrompt(
		currentPlan: WeeklyPlan,
		completedLogs: ExerciseLog[],
		previousLogs: ExerciseLog[]
	): string {
		const parts: string[] = [];

		parts.push(`Current plan (week of ${currentPlan.weekStart}):`);
		for (const session of currentPlan.sessions) {
			const exercises = session.exercises
				.map((ex) => {
					const w = ex.targetWeight ? ` @ ${ex.targetWeight}kg` : "";
					return `${ex.name}: ${ex.targetReps.join(",")} reps${w}`;
				})
				.join("; ");
			parts.push(`  ${session.day} (${session.label}): ${exercises}`);
		}

		if (completedLogs.length > 0) {
			parts.push(`\nActual performance this week (${completedLogs.length} sessions):`);
			for (const log of completedLogs) {
				const exercises = log.exercises
					.map((ex) => {
						const reps = (ex.actualReps ?? ex.targetReps).join(",");
						const w = ex.actualWeight ?? ex.targetWeight;
						const weightText = w ? ` @ ${w}kg` : "";
						const notesText = ex.notes ? ` (${ex.notes})` : "";
						return `${ex.name}: ${reps} reps${weightText}${notesText}`;
					})
					.join("; ");
				parts.push(`  ${log.day} (${log.label}): ${exercises}`);
			}
		} else {
			parts.push(
				"\nNo sessions completed this week. No performance data is available — do not reference any results."
			);
		}

		if (previousLogs.length > 0) {
			parts.push(`\nPrevious week performance (${previousLogs.length} sessions):`);
			for (const log of previousLogs) {
				const exercises = log.exercises
					.map((ex) => {
						const reps = (ex.actualReps ?? ex.targetReps).join(",");
						const w = ex.actualWeight ?? ex.targetWeight;
						const weightText = w ? ` @ ${w}kg` : "";
						return `${ex.name}: ${reps} reps${weightText}`;
					})
					.join("; ");
				parts.push(`  ${log.day} (${log.label}): ${exercises}`);
			}
		}

		return parts.join("\n");
	}
}

/** LLM-backed singleton */
export const llmPlanGenerator: PlanGenerationProvider = new LLMPlanProvider();
