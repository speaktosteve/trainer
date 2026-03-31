import type { TableClient } from "@azure/data-tables";
import type { WeeklyPlan, PlanEntity } from "$lib/types";
import { getTableClient, DEFAULT_PK } from "./tableStorage";
import { getWeekStart } from "$lib/utils/dates";

async function getClient(): Promise<TableClient> {
  return getTableClient("Plans");
}

/**
 * Get the plan for the current week.
 */
export async function getCurrentWeekPlan(): Promise<WeeklyPlan | null> {
  const weekStart = getWeekStart();
  return getPlan(weekStart);
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
