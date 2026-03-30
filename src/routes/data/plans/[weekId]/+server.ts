import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPlan } from '$lib/services/planService';

export const GET: RequestHandler = async ({ params }) => {
	const plan = await getPlan(params.weekId);
	if (!plan) {
		return json(null, { status: 404 });
	}
	return json(plan);
};
