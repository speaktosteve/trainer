import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteGoal, saveGoal } from "$lib/services/goalsService";
import type { Goal } from "$lib/types";

export const PUT: RequestHandler = async ({ request, params }) => {
  const payload = (await request.json()) as Omit<Goal, "id" | "createdAt">;

  try {
    const goal = await saveGoal({ ...payload, id: params.goalId });
    return json(goal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid goal payload";
    return json({ error: message }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteGoal(params.goalId);
    return json({ ok: true });
  } catch {
    return json({ error: "Goal not found" }, { status: 404 });
  }
};
