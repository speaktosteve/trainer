import { TableClient, TableServiceClient } from "@azure/data-tables";
import { env } from "$env/dynamic/private";

export type TableName =
  | "Plans"
  | "ExerciseLogs"
  | "BodyWeight"
  | "Goals"
  | "GoalState"
  | "ExerciseCatalog";

let serviceClient: TableServiceClient | null = null;
const tableClients = new Map<TableName, TableClient>();

function shouldAllowInsecureConnection(connStr: string): boolean {
  const normalized = connStr.toLowerCase();
  if (normalized.includes("usedevelopmentstorage=true")) {
    return true;
  }

  if (!normalized.includes("tableendpoint=http://")) {
    return false;
  }

  // Restrict insecure HTTP to known local Azurite-style hosts.
  return /(tableendpoint=http:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal|azurite)(:\d+)?\/)/.test(
    normalized,
  );
}

function getConnectionString(): string {
  const connStr = env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING is not set. " +
        "Set it in .env for local dev or in SWA app settings for production.",
    );
  }
  return connStr;
}

function getServiceClient(): TableServiceClient {
  if (!serviceClient) {
    const connStr = getConnectionString();
    serviceClient = TableServiceClient.fromConnectionString(connStr, {
      allowInsecureConnection: shouldAllowInsecureConnection(connStr),
    });
  }
  return serviceClient;
}

/**
 * Get (or create) a TableClient for the given table name.
 * Creates the table if it doesn't exist.
 */
export async function getTableClient(tableName: TableName): Promise<TableClient> {
  const existing = tableClients.get(tableName);
  if (existing) return existing;

  const connStr = getConnectionString();
  const client = TableClient.fromConnectionString(connStr, tableName, {
    allowInsecureConnection: shouldAllowInsecureConnection(connStr),
  });
  await getServiceClient()
    .createTable(tableName)
    .catch(() => {
      // Table already exists — safe to ignore
    });
  tableClients.set(tableName, client);
  return client;
}

/** Default partition key for single-user mode */
export const DEFAULT_PK = "default";
