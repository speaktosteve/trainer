import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logExercise, getExerciseHistory, deleteExerciseLog } from '$lib/services/exerciseService';
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

export const DELETE: RequestHandler = async ({ url }) => {
	const weekStart = url.searchParams.get('weekStart');
	const day = url.searchParams.get('day');
	const name = url.searchParams.get('name');

	if (!weekStart || !day || !name) {
		return json(
			{ error: 'weekStart, day, and name query params are required' },
			{ status: 400 }
		);
	}

	const deleted = await deleteExerciseLog(weekStart, day, name);
	if (!deleted) {
		return json({ error: 'Log not found' }, { status: 404 });
	}
	return json({ ok: true });
};
