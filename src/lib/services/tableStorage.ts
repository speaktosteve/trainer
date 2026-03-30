import { TableClient, TableServiceClient } from '@azure/data-tables';
import { env } from '$env/dynamic/private';

const TABLES = ['Plans', 'ExerciseLogs', 'BodyWeight'] as const;
export type TableName = (typeof TABLES)[number];

let serviceClient: TableServiceClient | null = null;
const tableClients = new Map<TableName, TableClient>();

function getConnectionString(): string {
	const connStr = env.AZURE_STORAGE_CONNECTION_STRING;
	if (!connStr) {
		throw new Error(
			'AZURE_STORAGE_CONNECTION_STRING is not set. ' +
				'Set it in .env for local dev or in SWA app settings for production.'
		);
	}
	return connStr;
}

function getServiceClient(): TableServiceClient {
	if (!serviceClient) {
		serviceClient = TableServiceClient.fromConnectionString(getConnectionString());
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

	const client = TableClient.fromConnectionString(getConnectionString(), tableName);
	await getServiceClient().createTable(tableName).catch(() => {
		// Table already exists — safe to ignore
	});
	tableClients.set(tableName, client);
	return client;
}

/** Default partition key for single-user mode */
export const DEFAULT_PK = 'default';
