import type { TableClient } from '@azure/data-tables';
import type { ExerciseLog, ExerciseLogEntity, BodyweightEntry, BodyweightEntity } from '$lib/types';
import { getTableClient, DEFAULT_PK } from './tableStorage';
import { reverseTimestamp } from '$lib/utils/dates';

// ── Exercise Logs ────────────────────────────────────────────────────

async function getExerciseClient(): Promise<TableClient> {
	return getTableClient('ExerciseLogs');
}

/**
 * Log a completed exercise session.
 */
export async function logExercise(log: ExerciseLog): Promise<void> {
	const client = await getExerciseClient();
	const entity: ExerciseLogEntity = {
		partitionKey: DEFAULT_PK,
		rowKey: reverseTimestamp(new Date(log.completedDate)),
		data: JSON.stringify(log)
	};
	await client.upsertEntity(entity, 'Replace');
}

/**
 * Get exercise history, newest first.
 * Optional date range filter (ISO date strings).
 */
export async function getExerciseHistory(options?: {
	fromDate?: string;
	toDate?: string;
	limit?: number;
}): Promise<ExerciseLog[]> {
	const client = await getExerciseClient();

	// Build filter — reverse timestamps mean fromDate/toDate logic is inverted
	let filter = `PartitionKey eq '${DEFAULT_PK}'`;
	if (options?.fromDate) {
		// fromDate → upper bound on reverse timestamp (older = bigger number)
		const upperBound = reverseTimestamp(new Date(options.fromDate));
		filter += ` and RowKey le '${upperBound}'`;
	}
	if (options?.toDate) {
		// toDate → lower bound on reverse timestamp (newer = smaller number)
		const lowerBound = reverseTimestamp(new Date(options.toDate));
		filter += ` and RowKey ge '${lowerBound}'`;
	}

	const entities = client.listEntities<ExerciseLogEntity>({
		queryOptions: { filter }
	});

	const logs: ExerciseLog[] = [];
	const limit = options?.limit ?? 100;
	for await (const entity of entities) {
		logs.push(JSON.parse(entity.data) as ExerciseLog);
		if (logs.length >= limit) break;
	}
	return logs;
}

/**
 * Get exercise logs for a specific week.
 */
export async function getExerciseLogsForWeek(weekStart: string): Promise<ExerciseLog[]> {
	const logs = await getExerciseHistory({ limit: 500 });
	return logs.filter((log) => log.weekStart === weekStart);
}

// ── Bodyweight ───────────────────────────────────────────────────────

async function getWeightClient(): Promise<TableClient> {
	return getTableClient('BodyWeight');
}

/**
 * Log a bodyweight entry.
 */
export async function logWeight(entry: BodyweightEntry): Promise<void> {
	const client = await getWeightClient();
	const entity: BodyweightEntity = {
		partitionKey: DEFAULT_PK,
		rowKey: entry.date,
		weight: entry.weight
	};
	await client.upsertEntity(entity, 'Replace');
}

/**
 * Get bodyweight history, ordered by date ascending.
 */
export async function getWeightHistory(options?: {
	fromDate?: string;
	toDate?: string;
}): Promise<BodyweightEntry[]> {
	const client = await getWeightClient();

	let filter = `PartitionKey eq '${DEFAULT_PK}'`;
	if (options?.fromDate) {
		filter += ` and RowKey ge '${options.fromDate}'`;
	}
	if (options?.toDate) {
		filter += ` and RowKey le '${options.toDate}'`;
	}

	const entities = client.listEntities<BodyweightEntity>({
		queryOptions: { filter }
	});

	const entries: BodyweightEntry[] = [];
	for await (const entity of entities) {
		entries.push({ date: entity.rowKey, weight: entity.weight });
	}
	return entries.sort((a, b) => a.date.localeCompare(b.date));
}
