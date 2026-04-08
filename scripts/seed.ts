/**
 * Seed script — populates Azure Table Storage (or Azurite) with:
 * - Current week plan (w/c 2026-03-30)
 * - 6 weeks of exercise history
 * - Bodyweight log
 *
 * Usage: npm run seed
 * Requires AZURE_STORAGE_CONNECTION_STRING in .env
 */
import { TableClient, TableServiceClient } from "@azure/data-tables";
import * as dotenv from "dotenv";
import seedData from "./seed-data.json";
import type { WeeklyPlan, ExerciseLog, BodyweightEntry } from "../src/lib/types/index.js";

dotenv.config();

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!connStr) {
  console.error("❌ Set AZURE_STORAGE_CONNECTION_STRING in .env");
  process.exit(1);
}
const connectionString = connStr;

const DEFAULT_PK = "default";

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

const allowInsecureConnection = shouldAllowInsecureConnection(connectionString);

// ── Confirmation prompt ──────────────────────────────────────────────
if (!process.argv.includes("--force")) {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) =>
    rl.question("⚠️  This will DELETE all existing data and re-seed. Continue? (y/N) ", resolve),
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }
}

function reverseTimestamp(date: Date): string {
  return String(9999999999999 - date.getTime()).padStart(13, "0");
}

async function ensureTable(name: string): Promise<TableClient> {
  const svc = TableServiceClient.fromConnectionString(connectionString, {
    allowInsecureConnection,
  });
  await svc.createTable(name).catch(() => {});
  const client = TableClient.fromConnectionString(connectionString, name, {
    allowInsecureConnection,
  });

  // Clear all existing entities
  const entities = client.listEntities({ queryOptions: { select: ["partitionKey", "rowKey"] } });
  let deleted = 0;
  for await (const entity of entities) {
    if (!entity.partitionKey || !entity.rowKey) continue;
    await client.deleteEntity(entity.partitionKey, entity.rowKey);
    deleted++;
  }
  if (deleted > 0) console.log(`  🗑️  Cleared ${deleted} rows from ${name}`);

  return client;
}

// ── Current week plan ────────────────────────────────────────────────
type SeedData = {
  currentPlan: WeeklyPlan;
  historyLogs: ExerciseLog[];
  weightLog: BodyweightEntry[];
};

const { currentPlan, historyLogs, weightLog } = seedData as SeedData;

const MAXED_MACHINE_EXERCISES = new Set(["Machine Seated Row", "Machine Seated Chest Press"]);

function applyMachineWeightDefaults(plan: WeeklyPlan): void {
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      exercise.machineWeightMaxedOut ??= MAXED_MACHINE_EXERCISES.has(exercise.name);
    }
  }
}

function applyMachineWeightDefaultsToLogs(logs: ExerciseLog[]): void {
  for (const log of logs) {
    for (const exercise of log.exercises) {
      exercise.machineWeightMaxedOut ??= MAXED_MACHINE_EXERCISES.has(exercise.name);
    }
  }
}

applyMachineWeightDefaults(currentPlan);
applyMachineWeightDefaultsToLogs(historyLogs);

// ── Run seed ─────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Seeding database...\n");

  // Plans
  const plansClient = await ensureTable("Plans");
  await plansClient.upsertEntity(
    {
      partitionKey: DEFAULT_PK,
      rowKey: currentPlan.weekStart,
      data: JSON.stringify(currentPlan),
    },
    "Replace",
  );
  console.log(`✅ Plan: ${currentPlan.weekStart}`);

  // Also create plan entries for each historical week
  const weekPlans = new Map<string, WeeklyPlan>();
  for (const log of historyLogs) {
    if (!weekPlans.has(log.weekStart)) {
      weekPlans.set(log.weekStart, { weekStart: log.weekStart, sessions: [] });
    }
    const weekPlan = weekPlans.get(log.weekStart);
    if (!weekPlan) continue;
    weekPlan.sessions.push({
      day: log.day,
      label: log.label,
      exercises: log.exercises.map((ex) => ({
        name: ex.name,
        targetWeight: ex.targetWeight,
        machineWeightMaxedOut: ex.machineWeightMaxedOut,
        targetReps: ex.targetReps,
        notes: ex.notes,
      })),
      sessionNotes: log.sessionNotes,
    });
  }
  for (const [ws, plan] of weekPlans) {
    if (ws === currentPlan.weekStart) {
      continue;
    }
    await plansClient.upsertEntity(
      {
        partitionKey: DEFAULT_PK,
        rowKey: ws,
        data: JSON.stringify(plan),
      },
      "Replace",
    );
    console.log(`✅ Plan: ${ws}`);
  }

  // Exercise logs
  const logsClient = await ensureTable("ExerciseLogs");
  for (const log of historyLogs) {
    const ts = new Date(
      log.completedDate + "T" + String(Math.floor(Math.random() * 24)).padStart(2, "0") + ":00:00Z",
    );
    await logsClient.upsertEntity(
      {
        partitionKey: DEFAULT_PK,
        rowKey: reverseTimestamp(ts),
        data: JSON.stringify(log),
      },
      "Replace",
    );
  }
  console.log(`✅ Exercise logs: ${historyLogs.length} sessions`);

  // Bodyweight
  const weightClient = await ensureTable("BodyWeight");
  for (const entry of weightLog) {
    await weightClient.upsertEntity(
      {
        partitionKey: DEFAULT_PK,
        rowKey: entry.date,
        weight: entry.weight,
      },
      "Replace",
    );
  }
  console.log(`✅ Bodyweight entries: ${weightLog.length}`);

  console.log("\n🎉 Seed complete!");
}

try {
  await seed();
} catch (err) {
  console.error("❌ Seed failed:", err);
  process.exit(1);
}
