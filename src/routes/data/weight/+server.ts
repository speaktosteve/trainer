import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { logWeight, getWeightHistory } from "$lib/services/exerciseService";
import type { BodyweightEntry } from "$lib/types";

export const GET: RequestHandler = async ({ url }) => {
	const fromDate = url.searchParams.get("from") ?? undefined;
	const toDate = url.searchParams.get("to") ?? undefined;

	const entries = await getWeightHistory({ fromDate, toDate });
	return json(entries);
};

export const POST: RequestHandler = async ({ request }) => {
	const entry: BodyweightEntry = await request.json();
	if (!entry.date || typeof entry.weight !== "number") {
		return json({ error: "Invalid entry: date and weight are required" }, { status: 400 });
	}
	await logWeight(entry);
	return json(entry, { status: 201 });
};
