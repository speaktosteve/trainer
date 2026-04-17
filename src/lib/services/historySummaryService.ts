import type { TableClient } from "@azure/data-tables";
import type { WeeklySummary } from "$lib/types";
import { getTableClient, DEFAULT_PK } from "./tableStorage";

interface HistorySummaryEntity {
  partitionKey: string;
  rowKey: string;
  data: string;
}

interface StoredHistorySummary {
  summary: WeeklySummary;
  signature: string;
}

export interface HistorySummaryRecord {
  summary: WeeklySummary;
  signature: string | null;
}

async function getClient(): Promise<TableClient> {
  return getTableClient("HistorySummaries");
}

export async function getHistorySummary(weekStart: string): Promise<HistorySummaryRecord | null> {
  const client = await getClient();
  try {
    const entity = await client.getEntity<HistorySummaryEntity>(DEFAULT_PK, weekStart);
    const parsed = JSON.parse(entity.data) as WeeklySummary | StoredHistorySummary;

    if ("summary" in parsed && "signature" in parsed) {
      return {
        summary: parsed.summary,
        signature: parsed.signature,
      };
    }

    // Backward compatibility for older rows saved as WeeklySummary only.
    return {
      summary: parsed,
      signature: null,
    };
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
  await saveHistorySummaryWithSignature(weekStart, summary, "");
}

export async function saveHistorySummaryWithSignature(
  weekStart: string,
  summary: WeeklySummary,
  signature: string,
): Promise<void> {
  const client = await getClient();
  const entity: HistorySummaryEntity = {
    partitionKey: DEFAULT_PK,
    rowKey: weekStart,
    data: JSON.stringify({
      summary,
      signature,
    } satisfies StoredHistorySummary),
  };
  await client.upsertEntity(entity, "Replace");
}
