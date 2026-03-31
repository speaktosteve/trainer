import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getPlan, savePlan } from "$lib/services/planService";
import { getExerciseLogsForWeek } from "$lib/services/exerciseService";
import { planGenerator, llmPlanGenerator } from "$lib/services/planGenerationService";
import { isLLMConfigured } from "$lib/services/openaiClient";
import { getWeekStart } from "$lib/utils/dates";

/**
 * POST /data/plans/next
 * Generate next week's plan based on the current week's plan and performance.
 * Body: { "mode": "smart-copy" }  (future: "llm")
 * Returns the generated plan (does NOT auto-save — client reviews first).
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const sourceWeek = body.sourceWeek ?? getWeekStart();

	const currentPlan = await getPlan(sourceWeek);
	if (!currentPlan) {
		return json({ error: "No plan found for the source week" }, { status: 404 });
	}

	// Check if next week plan already exists
	const nextDate = new Date(currentPlan.weekStart);
	nextDate.setDate(nextDate.getDate() + 7);
	const nextWeekStart = nextDate.toISOString().slice(0, 10);

	const existingNext = await getPlan(nextWeekStart);
	if (existingNext) {
		return json(
			{ error: "A plan already exists for next week", plan: existingNext },
			{ status: 409 }
		);
	}

	// Get this week's completed logs and previous week's for context
	const completedLogs = await getExerciseLogsForWeek(currentPlan.weekStart);
	const prevDate = new Date(currentPlan.weekStart);
	prevDate.setDate(prevDate.getDate() - 7);
	const previousLogs = await getExerciseLogsForWeek(prevDate.toISOString().slice(0, 10));

	const generator = isLLMConfigured() ? llmPlanGenerator : planGenerator;

	let nextPlan;
	try {
		nextPlan = await generator.generateNextPlan(currentPlan, completedLogs, previousLogs);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Plan generation failed";
		return json({ error: message }, { status: 502 });
	}

	// If save=true in the body, save immediately (for when user confirms)
	if (body.save) {
		await savePlan(nextPlan);
	}

	return json(nextPlan, { status: 201 });
};
