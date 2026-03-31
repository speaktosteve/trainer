import type { TableClient } from "@azure/data-tables";
import type { ExerciseLog, ExerciseLogEntity, BodyweightEntry, BodyweightEntity } from "$lib/types";
import { getTableClient, DEFAULT_PK } from "./tableStorage";
import { reverseTimestamp } from "$lib/utils/dates";

// ── Exercise Logs ────────────────────────────────────────────────────

async function getExerciseClient(): Promise<TableClient> {
	return getTableClient("ExerciseLogs");
}

/**
 * Log a completed exercise session.
 * Merges exercises into any existing log for the same date + day.
 */
export async function logExercise(log: ExerciseLog): Promise<void> {
	const client = await getExerciseClient();
	const rowKey = `${reverseTimestamp(new Date(log.completedDate))}_${log.day}`;

	// Try to merge into existing entity for this session
	let merged = log;
	try {
		const existing = await client.getEntity<ExerciseLogEntity>(DEFAULT_PK, rowKey);
		const existingLog = JSON.parse(existing.data) as ExerciseLog;
		for (const newEx of log.exercises) {
			const idx = existingLog.exercises.findIndex((e) => e.name === newEx.name);
			if (idx >= 0) existingLog.exercises[idx] = newEx;
			else existingLog.exercises.push(newEx);
		}
		merged = existingLog;
	} catch {
		// No existing entity — first exercise for this session
	}

	const entity: ExerciseLogEntity = {
		partitionKey: DEFAULT_PK,
		rowKey,
		data: JSON.stringify(merged),
	};
	await client.upsertEntity(entity, "Replace");
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
		queryOptions: { filter },
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
 * Delete exercise log entries matching a specific day and exercise name for a week.
 */
export async function deleteExerciseLog(
	weekStart: string,
	day: string,
	exerciseName: string
): Promise<boolean> {
	const client = await getExerciseClient();
	const entities = client.listEntities<ExerciseLogEntity>({
		queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
	});

	for await (const entity of entities) {
		const log = JSON.parse(entity.data) as ExerciseLog;
		if (log.weekStart !== weekStart || log.day !== day) continue;

		const match = log.exercises.some((ex) => ex.name === exerciseName);
		if (!match) continue;

		// Remove the exercise from the log
		const remaining = log.exercises.filter((ex) => ex.name !== exerciseName);
		if (remaining.length === 0) {
			await client.deleteEntity(entity.partitionKey, entity.rowKey);
		} else {
			log.exercises = remaining;
			entity.data = JSON.stringify(log);
			await client.upsertEntity(entity, "Replace");
		}
		return true;
	}
	return false;
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
	return getTableClient("BodyWeight");
}

/**
 * Log a bodyweight entry.
 */
export async function logWeight(entry: BodyweightEntry): Promise<void> {
	const client = await getWeightClient();
	const entity: BodyweightEntity = {
		partitionKey: DEFAULT_PK,
		rowKey: entry.date,
		weight: entry.weight,
	};
	await client.upsertEntity(entity, "Replace");
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
		queryOptions: { filter },
	});

	const entries: BodyweightEntry[] = [];
	for await (const entity of entities) {
		entries.push({ date: entity.rowKey, weight: entity.weight });
	}
	return entries.sort((a, b) => a.date.localeCompare(b.date));
}
