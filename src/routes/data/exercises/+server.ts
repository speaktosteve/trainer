import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logExercise, getExerciseHistory } from '$lib/services/exerciseService';
import type { ExerciseLog } from '$lib/types';

export const GET: RequestHandler = async ({ url }) => {
	const fromDate = url.searchParams.get('from') ?? undefined;
	const toDate = url.searchParams.get('to') ?? undefined;
	const limitStr = url.searchParams.get('limit');
	const limit = limitStr ? parseInt(limitStr, 10) : undefined;

	const logs = await getExerciseHistory({ fromDate, toDate, limit });
	return json(logs);
};

export const POST: RequestHandler = async ({ request }) => {
	const log: ExerciseLog = await request.json();
	if (!log.completedDate || !log.day || !Array.isArray(log.exercises)) {
		return json(
			{ error: 'Invalid log: completedDate, day, and exercises are required' },
			{ status: 400 }
		);
	}
	await logExercise(log);
	return json(log, { status: 201 });
};
