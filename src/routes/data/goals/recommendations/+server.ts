import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createGoalFromRecommendation,
  dismissRecommendation,
  getGoalRecommendations,
} from "$lib/services/goalsService";
import type { GoalRecommendation } from "$lib/services/goalsService";

export const GET: RequestHandler = async () => {
  const recommendations = await getGoalRecommendations();
  return json(recommendations);
};

export const PUT: RequestHandler = async ({ request }) => {
  const payload = (await request.json()) as {
    dismissedRecommendation?: GoalRecommendation;
    excludeKeys?: string[];
  };

  let excludeKeys = payload.excludeKeys ?? [];
  if (payload.dismissedRecommendation) {
    const persistedKey = await dismissRecommendation(payload.dismissedRecommendation);
    excludeKeys = [...excludeKeys, persistedKey];
  }

  const recommendations = await getGoalRecommendations({
    count: 1,
    excludeKeys,
  });

  const replacement = recommendations[0] ?? null;
  return json(replacement satisfies GoalRecommendation | null);
};

export const POST: RequestHandler = async ({ request }) => {
  const recommendation = await request.json();
  const created = await createGoalFromRecommendation(recommendation);
  return json(created, { status: 201 });
};
