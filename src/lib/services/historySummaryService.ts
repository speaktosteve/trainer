import type { TableClient } from "@azure/data-tables";
import type { WeeklySummary } from "$lib/types";
import { getTableClient, DEFAULT_PK } from "./tableStorage";

interface HistorySummaryEntity {
  partitionKey: string;
  rowKey: string;
  data: string;
}

async function getClient(): Promise<TableClient> {
  return getTableClient("HistorySummaries");
}

export async function getHistorySummary(weekStart: string): Promise<WeeklySummary | null> {
  const client = await getClient();
  try {
    const entity = await client.getEntity<HistorySummaryEntity>(DEFAULT_PK, weekStart);
    return JSON.parse(entity.data) as WeeklySummary;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "statusCode" in err &&
      (err as { statusCode: number }).statusCode === 404
    ) {
      return null;
    }
    throw err;
  }
}

export async function saveHistorySummary(weekStart: string, summary: WeeklySummary): Promise<void> {
  const client = await getClient();
  const entity: HistorySummaryEntity = {
    partitionKey: DEFAULT_PK,
    rowKey: weekStart,
    data: JSON.stringify(summary),
  };
  await client.upsertEntity(entity, "Replace");
}
