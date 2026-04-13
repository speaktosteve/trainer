import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { addExerciseToCatalog, getExerciseCatalog } from "$lib/services/exerciseService";

export const GET: RequestHandler = async () => {
  const catalog = await getExerciseCatalog();
  return json(catalog);
};

export const POST: RequestHandler = async ({ request }) => {
  const payload = (await request.json()) as { name?: string };
  if (!payload.name?.trim()) {
    return json({ error: "name is required" }, { status: 400 });
  }

  try {
    const item = await addExerciseToCatalog(payload.name);
    return json(item, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid catalog payload";
    return json({ error: message }, { status: 400 });
  }
};
