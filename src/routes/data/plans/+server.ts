import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getCurrentWeekPlan, savePlan } from "$lib/services/planService";
import type { WeeklyPlan } from "$lib/types";

export const GET: RequestHandler = async () => {
  const plan = await getCurrentWeekPlan();
  // Empty-state is expected for first run, so return 200 with null.
  return json(plan);
};

export const POST: RequestHandler = async ({ request }) => {
  const plan: WeeklyPlan = await request.json();
  if (!plan.weekStart || !Array.isArray(plan.sessions)) {
    return json({ error: "Invalid plan: weekStart and sessions are required" }, { status: 400 });
  }
  await savePlan(plan);
  return json(plan, { status: 201 });
};

export const PUT: RequestHandler = async ({ request }) => {
  const plan: WeeklyPlan = await request.json();
  if (!plan.weekStart || !Array.isArray(plan.sessions)) {
    return json({ error: "Invalid plan: weekStart and sessions are required" }, { status: 400 });
  }
  await savePlan(plan);
  return json(plan);
};
