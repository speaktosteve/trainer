import type { TableClient } from "@azure/data-tables";
import type { WeeklyPlan, PlanEntity } from "$lib/types";
import { getTableClient, DEFAULT_PK } from "./tableStorage";
import { getExerciseLogsForWeek } from "./exerciseService";
import { getWeekStart } from "$lib/utils/dates";

const PENDING_NEXT_PLAN_PREFIX = "pending:";

type PendingNextPlan = {
  sourceWeek: string;
  plan: WeeklyPlan;
};

async function getClient(): Promise<TableClient> {
  return getTableClient("Plans");
}

function getPendingNextPlanRowKey(sourceWeek: string): string {
  return `${PENDING_NEXT_PLAN_PREFIX}${sourceWeek}`;
}

function getPreviousWeekStart(weekStart: string): string {
  const previous = new Date(weekStart);
  previous.setDate(previous.getDate() - 7);
  return previous.toISOString().slice(0, 10);
}

/**
 * Get the plan for the current week, or fall back to the most recent plan if
 * no plan exists for this week.
 */
export async function getCurrentWeekPlan(): Promise<WeeklyPlan | null> {
  const weekStart = getWeekStart();
  const plan = await getPlan(weekStart);
  if (plan) {
    const completedLogs = await getExerciseLogsForWeek(weekStart);
    if (isPlanComplete(plan, completedLogs)) {
      const nextWeekPlan = await getPlan(getNextWeekStart(weekStart));
      if (nextWeekPlan) {
        return nextWeekPlan;
      }
    }
    return plan;
  }
  return getMostRecentPlan(weekStart);
}

function getNextWeekStart(weekStart: string): string {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + 7);
  return next.toISOString().slice(0, 10);
}

function isPlanComplete(
  plan: WeeklyPlan,
  logs: Awaited<ReturnType<typeof getExerciseLogsForWeek>>,
): boolean {
  const plannedExercises = plan.sessions.flatMap((session) =>
    session.exercises.map((exercise) => `${session.day}|${exercise.name}`),
  );

  if (plannedExercises.length === 0) {
    return false;
  }

  const completedExercises = new Set(
    logs.flatMap((log) => log.exercises.map((exercise) => `${log.day}|${exercise.name}`)),
  );

  return plannedExercises.every((exerciseKey) => completedExercises.has(exerciseKey));
}

async function getMostRecentPlan(beforeWeekStart: string): Promise<WeeklyPlan | null> {
  const client = await getClient();
  const entities = client.listEntities<PlanEntity>({
    queryOptions: {
      filter: `PartitionKey eq '${DEFAULT_PK}' and RowKey lt '${beforeWeekStart}'`,
    },
  });
  let latest: WeeklyPlan | null = null;
  for await (const entity of entities) {
    const candidate = JSON.parse(entity.data) as WeeklyPlan;
    if (!latest || candidate.weekStart > latest.weekStart) {
      latest = candidate;
    }
  }
  return latest;
}

/**
 * Get the plan for a specific week (by weekStart date string).
 */
export async function getPlan(weekStart: string): Promise<WeeklyPlan | null> {
  const client = await getClient();
  try {
    const entity = await client.getEntity<PlanEntity>(DEFAULT_PK, weekStart);
    return JSON.parse(entity.data) as WeeklyPlan;
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "statusCode" in e &&
      (e as { statusCode: number }).statusCode === 404
    ) {
      return null;
    }
    throw e;
  }
}

/**
 * Get a persisted next-plan draft generated from the given source week.
 */
export async function getPendingNextPlan(sourceWeek: string): Promise<WeeklyPlan | null> {
  const client = await getClient();
  try {
    const entity = await client.getEntity<PlanEntity>(
      DEFAULT_PK,
      getPendingNextPlanRowKey(sourceWeek),
    );
    const draft = JSON.parse(entity.data) as PendingNextPlan;
    return draft.plan;
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "statusCode" in e &&
      (e as { statusCode: number }).statusCode === 404
    ) {
      return null;
    }
    throw e;
  }
}

/**
 * Persist a generated next-plan draft until the user accepts it.
 */
export async function savePendingNextPlan(sourceWeek: string, plan: WeeklyPlan): Promise<void> {
  const client = await getClient();
  const entity: PlanEntity = {
    partitionKey: DEFAULT_PK,
    rowKey: getPendingNextPlanRowKey(sourceWeek),
    data: JSON.stringify({ sourceWeek, plan } satisfies PendingNextPlan),
  };
  await client.upsertEntity(entity, "Replace");
}

/**
 * Delete a persisted next-plan draft for the given source week.
 */
export async function deletePendingNextPlan(sourceWeek: string): Promise<void> {
  const client = await getClient();
  try {
    await client.deleteEntity(DEFAULT_PK, getPendingNextPlanRowKey(sourceWeek));
  } catch (e: unknown) {
    if (
      e &&
      typeof e === "object" &&
      "statusCode" in e &&
      (e as { statusCode: number }).statusCode === 404
    ) {
      return;
    }
    throw e;
  }
}

/**
 * Save (upsert) a weekly plan.
 */
export async function savePlan(plan: WeeklyPlan): Promise<void> {
  const client = await getClient();
  const entity: PlanEntity = {
    partitionKey: DEFAULT_PK,
    rowKey: plan.weekStart,
    data: JSON.stringify(plan),
  };
  await client.upsertEntity(entity, "Replace");
  await deletePendingNextPlan(getPreviousWeekStart(plan.weekStart));
}

/**
 * Get plans for a date range (inclusive). Returns plans ordered by week start.
 */
export async function getPlansForRange(fromDate: string, toDate: string): Promise<WeeklyPlan[]> {
  const client = await getClient();
  const entities = client.listEntities<PlanEntity>({
    queryOptions: {
      filter: `PartitionKey eq '${DEFAULT_PK}' and RowKey ge '${fromDate}' and RowKey le '${toDate}'`,
    },
  });

  const plans: WeeklyPlan[] = [];
  for await (const entity of entities) {
    plans.push(JSON.parse(entity.data) as WeeklyPlan);
  }
  return plans.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
