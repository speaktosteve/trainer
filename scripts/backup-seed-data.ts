/**
 * Backup script — exports the current Azure Table Storage state to a seed data JSON file.
 *
 * Usage: npm run seed:backup
 *        npm run seed:backup:timestamp
 *        npm run seed:backup -- --out scripts/my-seed-backup.json
 * Requires AZURE_STORAGE_CONNECTION_STRING in .env
 */
import { TableClient } from "@azure/data-tables";
import * as dotenv from "dotenv";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getWeekStart } from "../src/lib/utils/dates.js";
import type {
  BodyweightEntry,
  BodyweightEntity,
  ExerciseLog,
  ExerciseLogEntity,
  Goal,
  GoalEntity,
  GoalRecommendationStateEntity,
  PlanEntity,
  WeeklyPlan,
} from "../src/lib/types/index.js";

dotenv.config();

const DEFAULT_PK = "default";
const PENDING_NEXT_PLAN_PREFIX = "pending:";

type PendingNextPlan = {
  sourceWeek: string;
  plan: WeeklyPlan;
};

type SeedBackupData = {
  currentPlan: WeeklyPlan;
  historyLogs: ExerciseLog[];
  weightLog: BodyweightEntry[];
  goals: Goal[];
  dismissedRecommendationKeys: string[];
  plans: WeeklyPlan[];
  pendingNextPlans: PendingNextPlan[];
};

function shouldAllowInsecureConnection(conn: string): boolean {
  const normalized = conn.toLowerCase();
  if (normalized.includes("usedevelopmentstorage=true")) {
    return true;
  }

  if (!normalized.includes("tableendpoint=http://")) {
    return false;
  }

  return /(tableendpoint=http:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal|azurite)(:\d+)?\/)/.test(
    normalized,
  );
}

function compareTrainingDays(a: string, b: string): number {
  const dayOrder: Record<string, number> = {
    monday: 0,
    tuesday: 1,
    wednesday: 2,
    friday: 3,
  };

  const aOrder = dayOrder[a.toLowerCase()] ?? 99;
  const bOrder = dayOrder[b.toLowerCase()] ?? 99;
  return aOrder - bOrder;
}

async function getTableClient(
  connectionString: string,
  tableName: "Plans" | "ExerciseLogs" | "BodyWeight" | "Goals" | "GoalState",
): Promise<TableClient> {
  return TableClient.fromConnectionString(connectionString, tableName, {
    allowInsecureConnection: shouldAllowInsecureConnection(connectionString),
  });
}

async function readPlans(connectionString: string): Promise<{
  plans: WeeklyPlan[];
  pendingNextPlans: PendingNextPlan[];
}> {
  const plansClient = await getTableClient(connectionString, "Plans");
  const entities = plansClient.listEntities<PlanEntity>({
    queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
  });

  const plans: WeeklyPlan[] = [];
  const pendingNextPlans: PendingNextPlan[] = [];

  for await (const entity of entities) {
    if (!entity.rowKey) continue;
    const parsed = JSON.parse(entity.data);

    if (entity.rowKey.startsWith(PENDING_NEXT_PLAN_PREFIX)) {
      pendingNextPlans.push(parsed as PendingNextPlan);
      continue;
    }

    plans.push(parsed as WeeklyPlan);
  }

  plans.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  pendingNextPlans.sort((a, b) => a.sourceWeek.localeCompare(b.sourceWeek));

  return { plans, pendingNextPlans };
}

async function readExerciseLogs(connectionString: string): Promise<ExerciseLog[]> {
  const logsClient = await getTableClient(connectionString, "ExerciseLogs");
  const entities = logsClient.listEntities<ExerciseLogEntity>({
    queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
  });

  const logs: ExerciseLog[] = [];
  for await (const entity of entities) {
    logs.push(JSON.parse(entity.data) as ExerciseLog);
  }

  logs.sort((a, b) => {
    const weekCompare = a.weekStart.localeCompare(b.weekStart);
    if (weekCompare !== 0) return weekCompare;

    const dateCompare = a.completedDate.localeCompare(b.completedDate);
    if (dateCompare !== 0) return dateCompare;

    return compareTrainingDays(a.day, b.day);
  });

  return logs;
}

async function readWeightLog(connectionString: string): Promise<BodyweightEntry[]> {
  const weightClient = await getTableClient(connectionString, "BodyWeight");
  const entities = weightClient.listEntities<BodyweightEntity>({
    queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
  });

  const entries: BodyweightEntry[] = [];
  for await (const entity of entities) {
    entries.push({ date: entity.rowKey, weight: entity.weight });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

async function readGoals(connectionString: string): Promise<Goal[]> {
  const goalsClient = await getTableClient(connectionString, "Goals");
  const entities = goalsClient.listEntities<GoalEntity>({
    queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
  });

  const goals: Goal[] = [];
  for await (const entity of entities) {
    goals.push(JSON.parse(entity.data) as Goal);
  }

  goals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return goals;
}

async function readDismissedRecommendationKeys(connectionString: string): Promise<string[]> {
  const goalStateClient = await getTableClient(connectionString, "GoalState");
  const entities = goalStateClient.listEntities<GoalRecommendationStateEntity>({
    queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
  });

  const keys: string[] = [];
  for await (const entity of entities) {
    keys.push(entity.rowKey);
  }

  return keys.sort((a, b) => a.localeCompare(b));
}

function pickCurrentPlan(plans: WeeklyPlan[]): WeeklyPlan {
  if (plans.length === 0) {
    throw new Error("No plan rows found in Plans table.");
  }

  const thisWeekStart = getWeekStart();
  const exactMatch = plans.find((plan) => plan.weekStart === thisWeekStart);
  if (exactMatch) return exactMatch;

  const latest = plans.at(-1);
  if (!latest) {
    throw new Error("No plan rows found in Plans table.");
  }
  return latest;
}

function getTimestampLabel(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function getOutputPath(scriptDir: string): string {
  const args = process.argv.slice(2);
  const outArgIndex = args.indexOf("--out");
  if (outArgIndex >= 0 && args[outArgIndex + 1]) {
    const customPath = args[outArgIndex + 1];
    return path.isAbsolute(customPath) ? customPath : path.resolve(process.cwd(), customPath);
  }

  if (args.includes("--timestamp")) {
    return path.join(scriptDir, `seed-data.${getTimestampLabel()}.json`);
  }

  return path.join(scriptDir, "seed-data.json");
}

async function backupSeedData(): Promise<void> {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  }

  const { plans, pendingNextPlans } = await readPlans(connectionString);
  const [historyLogs, weightLog, goals, dismissedRecommendationKeys] = await Promise.all([
    readExerciseLogs(connectionString),
    readWeightLog(connectionString),
    readGoals(connectionString),
    readDismissedRecommendationKeys(connectionString),
  ]);

  const backup: SeedBackupData = {
    currentPlan: pickCurrentPlan(plans),
    historyLogs,
    weightLog,
    goals,
    dismissedRecommendationKeys,
    plans,
    pendingNextPlans,
  };

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = getOutputPath(scriptDir);
  await writeFile(outputPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");

  console.log(`✅ Updated ${outputPath} from storage`);
  console.log(`  Plans: ${plans.length}`);
  console.log(`  Pending drafts: ${pendingNextPlans.length}`);
  console.log(`  Exercise logs: ${historyLogs.length}`);
  console.log(`  Weight entries: ${weightLog.length}`);
  console.log(`  Goals: ${goals.length}`);
  console.log(`  Dismissed recommendations: ${dismissedRecommendationKeys.length}`);
  console.log(`  Current plan week: ${backup.currentPlan.weekStart}`);
}

try {
  await backupSeedData();
} catch (error) {
  console.error("❌ Backup failed:", error);
  process.exit(1);
}
