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
import type {
  WeeklyPlan,
  ExerciseLog,
  BodyweightEntry,
  Goal,
  ExerciseCatalogItem,
} from "../src/lib/types/index.js";

dotenv.config();

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!connStr) {
  console.error("❌ Set AZURE_STORAGE_CONNECTION_STRING in .env");
  process.exit(1);
}
const connectionString = connStr;

const DEFAULT_PK = "default";
const PENDING_NEXT_PLAN_PREFIX = "pending:";

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
  goals?: Goal[];
  exerciseCatalog?: ExerciseCatalogItem[];
  dismissedRecommendationKeys?: string[];
  plans?: WeeklyPlan[];
  pendingNextPlans?: Array<{ sourceWeek: string; plan: WeeklyPlan }>;
};

const {
  currentPlan,
  historyLogs,
  weightLog,
  goals,
  exerciseCatalog,
  dismissedRecommendationKeys,
  plans: allPlans,
  pendingNextPlans,
} = seedData as SeedData;

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

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getBestTargetWeight(plan: WeeklyPlan, exerciseName: string): number | undefined {
  const weights = plan.sessions
    .flatMap((session) => session.exercises)
    .filter((exercise) => exercise.name === exerciseName)
    .map((exercise) => exercise.targetWeight)
    .filter((weight): weight is number => weight !== undefined);

  if (weights.length === 0) return undefined;
  return Math.max(...weights);
}

function buildDefaultGoals(plan: WeeklyPlan, weights: BodyweightEntry[]): Goal[] {
  const startDate = plan.weekStart;
  const createdAt = `${startDate}T07:00:00.000Z`;
  const bestBench = getBestTargetWeight(plan, "Bench Press") ?? 67.5;
  const latestWeight = weights.at(-1)?.weight ?? 77;

  return [
    {
      id: "goal-bench-next-block",
      title: `Bench Press ${Math.ceil(bestBench + 2.5)} kg`,
      type: "lifting",
      exerciseName: "Bench Press",
      baselineValue: bestBench,
      targetValue: Math.ceil(bestBench + 2.5),
      startDate,
      targetDate: addDays(startDate, 56),
      notes: "Strength push over the next training block",
      status: "in_progress",
      createdAt,
    },
    {
      id: "goal-weight-trend",
      title: `Bodyweight ${Number((latestWeight + 0.8).toFixed(1))} kg`,
      type: "bodyweight",
      baselineValue: latestWeight,
      targetValue: Number((latestWeight + 0.8).toFixed(1)),
      startDate,
      targetDate: addDays(startDate, 84),
      notes: "Steady gain goal over 12 weeks",
      status: "in_progress",
      createdAt,
    },
    {
      id: "goal-consistency-3x8",
      title: "3 sessions/week for 8 weeks",
      type: "consistency",
      sessionsPerWeek: 3,
      targetValue: 3,
      startDate,
      targetDate: addDays(startDate, 56),
      notes: "Focus on consistency and recovery rhythm",
      status: "in_progress",
      createdAt,
    },
  ];
}

applyMachineWeightDefaults(currentPlan);
applyMachineWeightDefaultsToLogs(historyLogs);

async function seedPlans(plansClient: TableClient): Promise<void> {
  await plansClient.upsertEntity(
    {
      partitionKey: DEFAULT_PK,
      rowKey: currentPlan.weekStart,
      data: JSON.stringify(currentPlan),
    },
    "Replace",
  );
  console.log(`✅ Plan: ${currentPlan.weekStart}`);

  if (allPlans && allPlans.length > 0) {
    const sortedPlans = [...allPlans].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    for (const plan of sortedPlans) {
      await plansClient.upsertEntity(
        {
          partitionKey: DEFAULT_PK,
          rowKey: plan.weekStart,
          data: JSON.stringify(plan),
        },
        "Replace",
      );
      if (plan.weekStart !== currentPlan.weekStart) {
        console.log(`✅ Plan: ${plan.weekStart}`);
      }
    }
  } else {
    await seedSynthesizedPlans(plansClient);
  }

  if (pendingNextPlans && pendingNextPlans.length > 0) {
    for (const draft of pendingNextPlans) {
      await plansClient.upsertEntity(
        {
          partitionKey: DEFAULT_PK,
          rowKey: `${PENDING_NEXT_PLAN_PREFIX}${draft.sourceWeek}`,
          data: JSON.stringify(draft),
        },
        "Replace",
      );
      console.log(`✅ Pending next plan: ${draft.sourceWeek}`);
    }
  }
}

async function seedSynthesizedPlans(plansClient: TableClient): Promise<void> {
  // Backward compatibility: synthesize plan rows from historical logs when explicit plan list is absent.
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
}

async function seedExerciseLogs(logsClient: TableClient): Promise<void> {
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
}

async function seedBodyweight(weightClient: TableClient): Promise<void> {
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
}

async function seedGoals(goalsClient: TableClient): Promise<void> {
  const goalsToSeed = goals && goals.length > 0 ? goals : buildDefaultGoals(currentPlan, weightLog);
  for (const goal of goalsToSeed) {
    await goalsClient.upsertEntity(
      {
        partitionKey: DEFAULT_PK,
        rowKey: goal.id,
        data: JSON.stringify(goal),
      },
      "Replace",
    );
  }
  console.log(`✅ Goals: ${goalsToSeed.length}`);
}

function collectPlanExerciseNames(plan: WeeklyPlan): string[] {
  return plan.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.name));
}

function addNamesToSet(names: Set<string>, values: string[]): void {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) names.add(trimmed);
  }
}

function getCatalogNamesFromSeedData(): Set<string> {
  const names = new Set<string>();
  if (!exerciseCatalog || exerciseCatalog.length === 0) return names;

  addNamesToSet(
    names,
    exerciseCatalog.map((item) => item.name),
  );
  return names;
}

function getCatalogNamesFromPlansAndLogs(): Set<string> {
  const names = new Set<string>();
  const plansToProcess = allPlans && allPlans.length > 0 ? allPlans : [currentPlan];

  for (const plan of plansToProcess) {
    addNamesToSet(names, collectPlanExerciseNames(plan));
  }

  for (const log of historyLogs) {
    addNamesToSet(
      names,
      log.exercises.map((exercise) => exercise.name),
    );
  }

  return names;
}

function getCatalogNamesToSeed(): Set<string> {
  const fromSeed = getCatalogNamesFromSeedData();
  if (fromSeed.size > 0) return fromSeed;
  return getCatalogNamesFromPlansAndLogs();
}

async function seedExerciseCatalog(catalogClient: TableClient): Promise<void> {
  const names = getCatalogNamesToSeed();

  for (const name of names) {
    await catalogClient.upsertEntity(
      {
        partitionKey: DEFAULT_PK,
        rowKey: name.toLowerCase(),
        name,
        createdAt: new Date().toISOString(),
      },
      "Replace",
    );
  }

  console.log(`✅ Exercise catalog entries: ${names.size}`);
}

async function seedDismissedRecommendations(goalStateClient: TableClient): Promise<void> {
  const keysToSeed = dismissedRecommendationKeys ?? [];
  for (const key of keysToSeed) {
    await goalStateClient.upsertEntity(
      {
        partitionKey: DEFAULT_PK,
        rowKey: key,
        dismissedAt: new Date().toISOString(),
      },
      "Replace",
    );
  }
  console.log(`✅ Dismissed recommendations: ${keysToSeed.length}`);
}

// ── Run seed ─────────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Seeding database...\n");

  const plansClient = await ensureTable("Plans");
  const logsClient = await ensureTable("ExerciseLogs");
  const weightClient = await ensureTable("BodyWeight");
  const goalsClient = await ensureTable("Goals");
  const goalStateClient = await ensureTable("GoalState");
  const catalogClient = await ensureTable("ExerciseCatalog");

  await seedPlans(plansClient);
  await seedExerciseLogs(logsClient);
  await seedBodyweight(weightClient);
  await seedGoals(goalsClient);
  await seedExerciseCatalog(catalogClient);
  await seedDismissedRecommendations(goalStateClient);

  console.log("\n🎉 Seed complete!");
}

try {
  await seed();
} catch (err) {
  console.error("❌ Seed failed:", err);
  process.exit(1);
}
