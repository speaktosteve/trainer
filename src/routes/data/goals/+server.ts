import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getGoalsWithProgress, saveGoal } from "$lib/services/goalsService";
import type { Goal } from "$lib/types";

export const GET: RequestHandler = async () => {
  const goals = await getGoalsWithProgress();
  return json(goals);
};

export const POST: RequestHandler = async ({ request }) => {
  const payload = (await request.json()) as Omit<Goal, "id" | "createdAt">;

  try {
    const goal = await saveGoal(payload);
    return json(goal, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid goal payload";
    return json({ error: message }, { status: 400 });
  }
};
