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
const currentPlan: WeeklyPlan = {
  weekStart: "2026-03-30",
  sessions: [
    {
      day: "monday",
      label: "Push",
      exercises: [
        {
          exerciseId: "mon-bench-press",
          name: "Bench Press",
          targetWeight: 62.5,
          targetReps: [6, 6, 6, 6],
          notes: "Small jump since 60 kg felt good",
        },
        {
          exerciseId: "mon-incline-db-press",
          name: "Incline DB Press",
          targetWeight: 18,
          targetReps: [10, 10, 10, 10],
          notes: "Time to level up from the 16s",
        },
        {
          exerciseId: "mon-seated-shoulder-press",
          name: "Seated Shoulder Press",
          targetWeight: 14,
          targetReps: [10, 10, 10],
          notes: "Clean up the reps from last week",
        },
        {
          exerciseId: "mon-cable-lateral-raises",
          name: "Cable Lateral Raises",
          targetWeight: 9,
          targetReps: [12, 12, 12],
        },
        {
          exerciseId: "mon-cable-tricep-pushdown",
          name: "Cable Tricep Pushdown",
          targetWeight: 54.4,
          targetReps: [10, 10, 10],
          notes: "Matching your Friday win",
        },
        {
          exerciseId: "mon-machine-seated-row",
          name: "Machine Seated Row",
          targetWeight: 109,
          targetReps: [8, 8, 8],
        },
        {
          exerciseId: "mon-machine-seated-chest-press",
          name: "Machine Seated Chest Press",
          targetWeight: 109,
          targetReps: [10, 10, 10],
          notes: "Adding 1 rep per set",
        },
      ],
    },
    {
      day: "tuesday",
      label: "Lower",
      sessionNotes: "Listen to your body regarding the injury",
      exercises: [
        {
          exerciseId: "tue-leg-press",
          name: "Leg Press",
          targetWeight: 145,
          targetReps: [10, 10, 10],
        },
        {
          exerciseId: "tue-leg-press-calves",
          name: "Leg Press Calves",
          targetWeight: 106.6,
          targetReps: [14, 14, 14, 20],
        },
        { exerciseId: "tue-rdl", name: "RDL", targetWeight: 62.5, targetReps: [8, 8, 8] },
        { exerciseId: "tue-squat", name: "Squat", targetWeight: 75, targetReps: [6, 6, 6] },
        {
          exerciseId: "tue-leg-curl",
          name: "Leg Curl",
          targetWeight: 63,
          targetReps: [12, 12, 12],
        },
        {
          exerciseId: "tue-leg-extension",
          name: "Leg Extension",
          targetWeight: 75,
          targetReps: [10, 10, 10],
        },
      ],
    },
    {
      day: "wednesday",
      label: "Pull",
      exercises: [
        {
          exerciseId: "wed-chin-ups",
          name: "Chin-ups",
          targetReps: [10, 10, 9],
          notes: "Pushing for one more rep on the last set",
        },
        {
          exerciseId: "wed-machine-seated-row",
          name: "Machine Seated Row",
          targetWeight: 111,
          targetReps: [10, 10, 10, 10],
          notes: "Small 2 kg bump",
        },
        {
          exerciseId: "wed-lat-pull",
          name: "Lat Pull",
          targetWeight: 65,
          targetReps: [12, 12, 12],
          notes: "Micro-increase",
        },
        {
          exerciseId: "wed-db-curl",
          name: "DB Curl",
          targetWeight: 14,
          targetReps: [10, 10, 10],
          notes: "Moving away from the 12s",
        },
        {
          exerciseId: "wed-hammer-curl",
          name: "Hammer Curl",
          targetWeight: 14,
          targetReps: [8, 8, 8],
        },
        {
          exerciseId: "wed-cable-bicep-curl",
          name: "Cable Bicep Curl",
          targetWeight: 47.5,
          targetReps: [12, 12, 12],
        },
      ],
    },
    {
      day: "friday",
      label: "Full Body",
      exercises: [
        {
          exerciseId: "fri-bench-press",
          name: "Bench Press",
          targetWeight: 67.5,
          targetReps: [5, 5, 5, 5, 5],
          notes: "Goal: get 5 reps on that final set",
        },
        {
          exerciseId: "fri-leg-press",
          name: "Leg Press",
          targetWeight: 152.1,
          targetReps: [8, 8, 8],
        },
        {
          exerciseId: "fri-machine-seated-row",
          name: "Machine Seated Row",
          targetWeight: 109,
          targetReps: [10, 10, 10],
        },
        {
          exerciseId: "fri-machine-seated-row-single-arm",
          name: "Machine Seated Row - Single Arm",
          targetWeight: 25,
          targetReps: [10, 10, 10],
        },
        {
          exerciseId: "fri-seated-shoulder-press",
          name: "Seated Shoulder Press",
          targetWeight: 16,
          targetReps: [10, 10, 10],
        },
        {
          exerciseId: "fri-cable-bicep-curl",
          name: "Cable Bicep Curl",
          targetWeight: 52,
          targetReps: [10, 10, 10],
        },
        {
          exerciseId: "fri-cable-tricep-pushdown",
          name: "Cable Tricep Pushdown",
          targetWeight: 56.5,
          targetReps: [10, 10, 10],
          notes: "Small bump since you're moving 54.4 kg well",
        },
        {
          exerciseId: "fri-smith-shoulder-press",
          name: "Smith Shoulder Press",
          targetWeight: 42.5,
          targetReps: [10, 10, 10],
          notes: "Small increase",
        },
      ],
    },
  ],
};

// ── 6 weeks of history ───────────────────────────────────────────────
// Week 1 = w/c 2026-02-16, ... Week 6 = w/c 2026-03-23
function weekDate(weekNum: number): string {
  const base = new Date(2026, 1, 16); // Feb 16
  base.setDate(base.getDate() + (weekNum - 1) * 7);
  return base.toISOString().slice(0, 10);
}

function dayDate(weekStart: string, dayOffset: number): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

const historyLogs: ExerciseLog[] = [
  // ── Week 1 ──
  {
    day: "monday",
    label: "Push",
    weekStart: weekDate(1),
    completedDate: dayDate(weekDate(1), 0),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 50,
        targetReps: [6, 6, 6, 6],
        actualWeight: 50,
        actualReps: [6, 6, 6, 4],
      },
      {
        name: "Incline DB Press",
        targetWeight: 14,
        targetReps: [8, 8, 8],
        actualWeight: 14,
        actualReps: [8, 8, 8],
      },
      {
        name: "Seated Shoulder Press",
        targetWeight: 14,
        targetReps: [6, 6, 6],
        actualWeight: 14,
        actualReps: [6, 4, 4],
      },
      {
        name: "Cable Lateral Raises",
        targetWeight: 6,
        targetReps: [10, 10, 10],
        actualWeight: 6,
        actualReps: [10, 10, 8],
      },
      {
        name: "Cable Tricep Pushdown",
        targetWeight: 45,
        targetReps: [8, 8, 8],
        actualWeight: 45,
        actualReps: [8, 8, 8],
      },
      {
        name: "Machine Seated Row",
        targetWeight: 102,
        targetReps: [6, 6, 6],
        actualWeight: 102,
        actualReps: [6, 6, 6],
      },
      {
        name: "Machine Seated Chest Press",
        targetWeight: 84,
        targetReps: [8, 8, 8],
        actualWeight: 84,
        actualReps: [8, 8, 7],
      },
    ],
  },
  {
    day: "tuesday",
    label: "Lower",
    weekStart: weekDate(1),
    completedDate: dayDate(weekDate(1), 1),
    exercises: [
      {
        name: "Leg Press",
        targetWeight: 88,
        targetReps: [10, 10, 10],
        actualWeight: 88,
        actualReps: [10, 10, 10],
      },
      {
        name: "Squat",
        targetWeight: 50,
        targetReps: [6, 6, 6],
        actualWeight: 50,
        actualReps: [6, 6, 6],
      },
      {
        name: "RDL",
        targetWeight: 40,
        targetReps: [8, 8, 8],
        actualWeight: 40,
        actualReps: [8, 8, 8],
      },
      {
        name: "Leg Curl",
        targetWeight: 40,
        targetReps: [12, 12, 12],
        actualWeight: 40,
        actualReps: [12, 12, 12],
      },
      {
        name: "Leg Extension",
        targetWeight: 54,
        targetReps: [10, 10, 10],
        actualWeight: 54,
        actualReps: [10, 10, 10],
      },
    ],
  },
  {
    day: "wednesday",
    label: "Pull",
    weekStart: weekDate(1),
    completedDate: dayDate(weekDate(1), 2),
    exercises: [
      { name: "Chin-ups", targetReps: [5, 5, 5], actualReps: [3, 4, 3] },
      {
        name: "Machine Seated Row",
        targetWeight: 102,
        targetReps: [8, 8, 8],
        actualWeight: 102,
        actualReps: [6, 6, 6],
      },
      {
        name: "DB Curl",
        targetWeight: 12,
        targetReps: [8, 8, 8],
        actualWeight: 12,
        actualReps: [6, 6, 6],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 22,
        targetReps: [12, 12, 12],
        actualWeight: 22,
        actualReps: [12, 12, 12],
      },
    ],
  },
  {
    day: "friday",
    label: "Full Body",
    weekStart: weekDate(1),
    completedDate: dayDate(weekDate(1), 4),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 52.5,
        targetReps: [5, 5, 5, 5],
        actualWeight: 52.5,
        actualReps: [5, 5, 5, 5],
      },
      {
        name: "Smith Shoulder Press",
        targetWeight: 30,
        targetReps: [8, 8, 8],
        actualWeight: 30,
        actualReps: [8, 6, 6],
      },
    ],
  },

  // ── Week 2 ──
  {
    day: "monday",
    label: "Push",
    weekStart: weekDate(2),
    completedDate: dayDate(weekDate(2), 0),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 50,
        targetReps: [6, 6, 6, 6],
        actualWeight: 50,
        actualReps: [6, 6, 6, 6],
      },
      {
        name: "Incline DB Press",
        targetWeight: 14,
        targetReps: [9, 9, 9],
        actualWeight: 14,
        actualReps: [9, 9, 9],
      },
      {
        name: "Cable Tricep Pushdown",
        targetWeight: 45,
        targetReps: [9, 9, 9],
        actualWeight: 45,
        actualReps: [9, 9, 9],
      },
      {
        name: "Machine Seated Row",
        targetWeight: 109,
        targetReps: [8, 8, 8],
        actualWeight: 109,
        actualReps: [8, 8, 8],
      },
      {
        name: "Machine Seated Chest Press",
        targetWeight: 88,
        targetReps: [8, 8, 8],
        actualWeight: 88,
        actualReps: [8, 8, 8],
      },
    ],
  },
  {
    day: "tuesday",
    label: "Lower",
    weekStart: weekDate(2),
    completedDate: dayDate(weekDate(2), 1),
    exercises: [
      {
        name: "Leg Press",
        targetWeight: 115,
        targetReps: [10, 10, 10],
        actualWeight: 115,
        actualReps: [10, 10, 10],
      },
      {
        name: "Squat",
        targetWeight: 52.5,
        targetReps: [6, 6, 6],
        actualWeight: 52.5,
        actualReps: [6, 6, 10],
      },
      {
        name: "RDL",
        targetWeight: 45,
        targetReps: [8, 8, 8],
        actualWeight: 45,
        actualReps: [8, 8, 8],
      },
      {
        name: "Leg Curl",
        targetWeight: 47,
        targetReps: [12, 12, 12],
        actualWeight: 47,
        actualReps: [12, 12, 12],
      },
      {
        name: "Leg Extension",
        targetWeight: 60,
        targetReps: [10, 10, 10],
        actualWeight: 60,
        actualReps: [10, 10, 10],
      },
    ],
  },
  {
    day: "wednesday",
    label: "Pull",
    weekStart: weekDate(2),
    completedDate: dayDate(weekDate(2), 2),
    exercises: [
      { name: "Chin-ups", targetReps: [5, 5, 5], actualReps: [4, 4, 4] },
      {
        name: "DB Curl",
        targetWeight: 10,
        targetReps: [8, 8, 8],
        actualWeight: 10,
        actualReps: [8, 8, 8],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 25,
        targetReps: [12, 12, 12],
        actualWeight: 25,
        actualReps: [12, 12, 12],
      },
    ],
  },
  {
    day: "friday",
    label: "Full Body",
    weekStart: weekDate(2),
    completedDate: dayDate(weekDate(2), 4),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 55,
        targetReps: [5, 5, 5, 5, 5],
        actualWeight: 55,
        actualReps: [5, 5, 5, 5, 5],
      },
      {
        name: "Smith Shoulder Press",
        targetWeight: 32.5,
        targetReps: [8, 8, 8],
        actualWeight: 32.5,
        actualReps: [8, 8, 8],
      },
    ],
  },

  // ── Week 3 ──
  {
    day: "monday",
    label: "Push",
    weekStart: weekDate(3),
    completedDate: dayDate(weekDate(3), 0),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 55,
        targetReps: [6, 6, 6, 6],
        actualWeight: 55,
        actualReps: [6, 6, 6, 6],
      },
      {
        name: "Incline DB Press",
        targetWeight: 16,
        targetReps: [9, 9, 9],
        actualWeight: 16,
        actualReps: [9, 9, 9],
      },
      {
        name: "Seated Shoulder Press",
        targetWeight: 12,
        targetReps: [8, 8, 8],
        actualWeight: 12,
        actualReps: [8, 8, 8],
      },
      {
        name: "Cable Lateral Raises",
        targetWeight: 9,
        targetReps: [12, 12, 12],
        actualWeight: 9,
        actualReps: [12, 12, 10],
      },
      {
        name: "Machine Seated Row",
        targetWeight: 109,
        targetReps: [8, 8, 8],
        actualWeight: 109,
        actualReps: [8, 8, 8],
      },
      {
        name: "Machine Seated Chest Press",
        targetWeight: 93,
        targetReps: [9, 9, 9],
        actualWeight: 93,
        actualReps: [9, 9, 8],
      },
    ],
  },
  {
    day: "tuesday",
    label: "Lower",
    weekStart: weekDate(3),
    completedDate: dayDate(weekDate(3), 1),
    exercises: [
      {
        name: "Leg Press",
        targetWeight: 133,
        targetReps: [10, 10, 10],
        actualWeight: 133,
        actualReps: [10, 10, 10],
      },
      {
        name: "Squat",
        targetWeight: 65,
        targetReps: [6, 6, 6],
        actualWeight: 65,
        actualReps: [6, 6, 6],
      },
      {
        name: "RDL",
        targetWeight: 50,
        targetReps: [8, 8, 8],
        actualWeight: 50,
        actualReps: [8, 8, 8],
      },
      {
        name: "Leg Curl",
        targetWeight: 50,
        targetReps: [12, 12, 12],
        actualWeight: 50,
        actualReps: [12, 12, 12],
      },
      {
        name: "Leg Extension",
        targetWeight: 61,
        targetReps: [10, 10, 10],
        actualWeight: 61,
        actualReps: [10, 10, 10],
      },
    ],
  },
  {
    day: "wednesday",
    label: "Pull",
    weekStart: weekDate(3),
    completedDate: dayDate(weekDate(3), 2),
    exercises: [
      { name: "Chin-ups", targetReps: [6, 6, 6], actualReps: [6, 6, 5] },
      {
        name: "DB Curl",
        targetWeight: 10,
        targetReps: [10, 10, 10],
        actualWeight: 10,
        actualReps: [10, 9, 10],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 31,
        targetReps: [12, 12, 12],
        actualWeight: 31,
        actualReps: [12, 12, 12],
      },
    ],
  },
  {
    day: "friday",
    label: "Full Body",
    weekStart: weekDate(3),
    completedDate: dayDate(weekDate(3), 4),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 57.5,
        targetReps: [5, 5, 5, 5, 5],
        actualWeight: 57.5,
        actualReps: [5, 5, 5, 5, 5],
      },
      {
        name: "Smith Shoulder Press",
        targetWeight: 32.5,
        targetReps: [8, 8, 8],
        actualWeight: 32.5,
        actualReps: [8, 8, 8],
      },
    ],
  },

  // ── Week 4 ──
  {
    day: "monday",
    label: "Push",
    weekStart: weekDate(4),
    completedDate: dayDate(weekDate(4), 0),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 57.5,
        targetReps: [6, 6, 6, 6],
        actualWeight: 57.5,
        actualReps: [6, 6, 6, 6],
      },
      {
        name: "Incline DB Press",
        targetWeight: 16,
        targetReps: [12, 12, 12],
        actualWeight: 16,
        actualReps: [12, 12, 10],
      },
      {
        name: "Seated Shoulder Press",
        targetWeight: 14,
        targetReps: [10, 10, 10],
        actualWeight: 14,
        actualReps: [10, 9, 7],
      },
      {
        name: "Cable Lateral Raises",
        targetWeight: 9,
        targetReps: [12, 12, 12],
        actualWeight: 9,
        actualReps: [12, 12, 12],
      },
      {
        name: "Machine Seated Row",
        targetWeight: 109,
        targetReps: [10, 10, 10],
        actualWeight: 109,
        actualReps: [10, 10, 10],
      },
      {
        name: "Machine Seated Chest Press",
        targetWeight: 97,
        targetReps: [9, 9, 9],
        actualWeight: 97,
        actualReps: [9, 9, 9],
      },
    ],
  },
  {
    day: "tuesday",
    label: "Lower",
    weekStart: weekDate(4),
    completedDate: dayDate(weekDate(4), 1),
    exercises: [
      {
        name: "Leg Press",
        targetWeight: 140,
        targetReps: [10, 10, 10],
        actualWeight: 140,
        actualReps: [10, 10, 10],
      },
      {
        name: "Squat",
        targetWeight: 70,
        targetReps: [6, 6, 6],
        actualWeight: 70,
        actualReps: [6, 6, 8],
      },
      {
        name: "RDL",
        targetWeight: 55,
        targetReps: [8, 8, 8],
        actualWeight: 55,
        actualReps: [8, 8, 8],
      },
      {
        name: "Leg Curl",
        targetWeight: 54,
        targetReps: [12, 12, 12],
        actualWeight: 54,
        actualReps: [12, 12, 12],
      },
      {
        name: "Leg Extension",
        targetWeight: 63,
        targetReps: [10, 10, 10],
        actualWeight: 63,
        actualReps: [10, 10, 10],
      },
    ],
  },
  {
    day: "wednesday",
    label: "Pull",
    weekStart: weekDate(4),
    completedDate: dayDate(weekDate(4), 2),
    exercises: [
      { name: "Chin-ups", targetReps: [10, 10, 10], actualReps: [10, 7, 4] },
      {
        name: "DB Curl",
        targetWeight: 12,
        targetReps: [10, 10, 10],
        actualWeight: 12,
        actualReps: [10, 10, 10],
      },
      {
        name: "Hammer Curl",
        targetWeight: 14,
        targetReps: [8, 8, 8],
        actualWeight: 14,
        actualReps: [6, 5, 5],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 38,
        targetReps: [12, 12, 12],
        actualWeight: 38,
        actualReps: [12, 12, 12],
      },
    ],
  },
  {
    day: "friday",
    label: "Full Body",
    weekStart: weekDate(4),
    completedDate: dayDate(weekDate(4), 4),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 60,
        targetReps: [5, 5, 5, 5, 5],
        actualWeight: 60,
        actualReps: [5, 5, 5, 5, 5],
      },
      {
        name: "Smith Shoulder Press",
        targetWeight: 35,
        targetReps: [10, 10, 10],
        actualWeight: 35,
        actualReps: [9, 8, 8],
      },
      {
        name: "Cable Tricep Pushdown",
        targetWeight: 48,
        targetReps: [10, 10, 10],
        actualWeight: 48,
        actualReps: [10, 10, 10],
      },
    ],
  },

  // ── Week 5 ──
  {
    day: "monday",
    label: "Push",
    weekStart: weekDate(5),
    completedDate: dayDate(weekDate(5), 0),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 60,
        targetReps: [6, 6, 6, 6],
        actualWeight: 60,
        actualReps: [6, 6, 6],
      },
      {
        name: "Incline DB Press",
        targetWeight: 16,
        targetReps: [10, 10, 10],
        actualWeight: 16,
        actualReps: [10, 10, 10],
      },
      {
        name: "Cable Tricep Pushdown",
        targetWeight: 50,
        targetReps: [10, 10, 10],
        actualWeight: 50,
        actualReps: [10, 10, 10],
      },
      {
        name: "Machine Seated Row",
        targetWeight: 109,
        targetReps: [10, 10, 10],
        actualWeight: 109,
        actualReps: [10, 10, 10],
      },
      {
        name: "Machine Seated Chest Press",
        targetWeight: 102,
        targetReps: [9, 9, 9],
        actualWeight: 102,
        actualReps: [9, 9, 9],
      },
    ],
  },
  {
    day: "tuesday",
    label: "Lower",
    weekStart: weekDate(5),
    completedDate: dayDate(weekDate(5), 1),
    exercises: [
      {
        name: "Leg Press",
        targetWeight: 152,
        targetReps: [10, 10, 10],
        actualWeight: 152,
        actualReps: [10, 10, 10],
      },
      {
        name: "Squat",
        targetWeight: 75,
        targetReps: [6, 6, 6],
        actualWeight: 75,
        actualReps: [6, 6],
      },
      {
        name: "RDL",
        targetWeight: 60,
        targetReps: [8, 8, 8],
        actualWeight: 60,
        actualReps: [8, 8, 8],
      },
      {
        name: "Leg Curl",
        targetWeight: 61,
        targetReps: [12, 12, 12],
        actualWeight: 61,
        actualReps: [12, 12, 12],
      },
      {
        name: "Leg Extension",
        targetWeight: 72,
        targetReps: [10, 10, 10],
        actualWeight: 72,
        actualReps: [10, 10, 10],
      },
    ],
  },
  {
    day: "wednesday",
    label: "Pull",
    weekStart: weekDate(5),
    completedDate: dayDate(weekDate(5), 2),
    exercises: [
      { name: "Chin-ups", targetReps: [10, 10, 10], actualReps: [10, 10, 6] },
      {
        name: "DB Curl",
        targetWeight: 12,
        targetReps: [10, 10, 10],
        actualWeight: 12,
        actualReps: [10, 10, 10],
      },
      {
        name: "Hammer Curl",
        targetWeight: 14,
        targetReps: [8, 8, 8],
        actualWeight: 14,
        actualReps: [8, 8, 8],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 45,
        targetReps: [12, 12, 12],
        actualWeight: 45,
        actualReps: [12, 12, 12],
      },
    ],
  },
  {
    day: "friday",
    label: "Full Body",
    weekStart: weekDate(5),
    completedDate: dayDate(weekDate(5), 4),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 65,
        targetReps: [5, 5, 5, 5, 5],
        actualWeight: 65,
        actualReps: [5, 5, 5, 5, 5],
        notes: "Also hit 70x2 after",
      },
      {
        name: "Smith Shoulder Press",
        targetWeight: 40,
        targetReps: [10, 10, 10],
        actualWeight: 40,
        actualReps: [10, 10, 8],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 49.9,
        targetReps: [10, 10, 10],
        actualWeight: 49.9,
        actualReps: [10, 10, 10],
      },
      {
        name: "Cable Tricep Pushdown",
        targetWeight: 54.4,
        targetReps: [10, 10, 10],
        actualWeight: 54.4,
        actualReps: [10, 10, 10],
      },
    ],
  },

  // ── Week 6 (latest) ──
  {
    day: "monday",
    label: "Push",
    weekStart: weekDate(6),
    completedDate: dayDate(weekDate(6), 0),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 60,
        targetReps: [6, 6, 6, 6],
        actualWeight: 60,
        actualReps: [6, 6, 6, 6],
      },
      {
        name: "Incline DB Press",
        targetWeight: 16,
        targetReps: [10, 10, 10, 10],
        actualWeight: 16,
        actualReps: [10, 10, 10, 10],
      },
      {
        name: "Seated Shoulder Press",
        targetWeight: 14,
        targetReps: [10, 10, 10],
        actualWeight: 14,
        actualReps: [10, 8, 8],
      },
      {
        name: "Cable Lateral Raises",
        targetWeight: 9,
        targetReps: [12, 12, 12],
        actualWeight: 9,
        actualReps: [12, 12, 12],
      },
      {
        name: "Cable Tricep Pushdown",
        targetWeight: 52,
        targetReps: [10, 10, 10],
        actualWeight: 52,
        actualReps: [10, 10, 10],
      },
      {
        name: "Machine Seated Row",
        targetWeight: 109,
        targetReps: [8, 8, 8],
        actualWeight: 109,
        actualReps: [8, 8, 8],
      },
      {
        name: "Machine Seated Chest Press",
        targetWeight: 106,
        targetReps: [9, 9, 9],
        actualWeight: 106,
        actualReps: [9, 9, 9],
      },
    ],
  },
  {
    day: "wednesday",
    label: "Pull",
    weekStart: weekDate(6),
    completedDate: dayDate(weekDate(6), 2),
    exercises: [
      { name: "Chin-ups", targetReps: [10, 10, 10], actualReps: [10, 10, 8] },
      {
        name: "Machine Seated Row",
        targetWeight: 109,
        targetReps: [10, 10, 10, 10],
        actualWeight: 109,
        actualReps: [10, 10, 10, 10],
      },
      {
        name: "DB Curl",
        targetWeight: 12,
        targetReps: [10, 10, 10],
        actualWeight: 12,
        actualReps: [10, 10, 10],
      },
      {
        name: "Hammer Curl",
        targetWeight: 14,
        targetReps: [8, 8, 8],
        actualWeight: 14,
        actualReps: [8, 8, 8],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 45.4,
        targetReps: [12, 12, 12],
        actualWeight: 45.4,
        actualReps: [12, 12, 12],
      },
    ],
  },
  {
    day: "friday",
    label: "Full Body",
    weekStart: weekDate(6),
    completedDate: dayDate(weekDate(6), 4),
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 67.5,
        targetReps: [5, 5, 5, 5, 5],
        actualWeight: 67.5,
        actualReps: [5, 5, 5, 5, 2],
      },
      {
        name: "Seated Shoulder Press",
        targetWeight: 16,
        targetReps: [10, 10, 10],
        actualWeight: 16,
        actualReps: [10, 10, 8],
      },
      {
        name: "Smith Shoulder Press",
        targetWeight: 40,
        targetReps: [10, 10, 10],
        actualWeight: 40,
        actualReps: [10, 10, 10],
      },
      {
        name: "Cable Tricep Pushdown",
        targetWeight: 54.4,
        targetReps: [10, 10, 10],
        actualWeight: 54.4,
        actualReps: [10, 10, 10],
      },
      {
        name: "Cable Bicep Curl",
        targetWeight: 49.9,
        targetReps: [10, 10, 10],
        actualWeight: 49.9,
        actualReps: [10, 10, 10],
      },
    ],
  },
];

// ── Bodyweight log ───────────────────────────────────────────────────
const weightLog: BodyweightEntry[] = [
  { date: "2026-01-21", weight: 76.8 },
  { date: "2026-01-23", weight: 77.4 },
  { date: "2026-01-30", weight: 77.9 },
  { date: "2026-02-06", weight: 77.8 },
  { date: "2026-02-14", weight: 76.9 },
  { date: "2026-03-06", weight: 77.2 },
  { date: "2026-03-13", weight: 77.1 },
  { date: "2026-03-20", weight: 77.8 },
  { date: "2026-03-27", weight: 77.7 },
];

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
