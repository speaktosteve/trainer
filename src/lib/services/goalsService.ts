import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import type {
  BodyweightEntry,
  ExerciseLog,
  Goal,
  GoalEntity,
  GoalRecommendationStateEntity,
  GoalProgressPoint,
  GoalStatus,
  GoalType,
  GoalWithProgress,
} from "$lib/types";
import { getTableClient, DEFAULT_PK } from "./tableStorage";
import { getExerciseHistory, getWeightHistory } from "./exerciseService";
import { getOpenAIClient, getDeploymentName, isLLMConfigured } from "./openaiClient";

type GoalInput = Omit<Goal, "id" | "createdAt"> & { id?: string; createdAt?: string };

export type GoalRecommendation = {
  title: string;
  type: GoalType;
  targetValue: number;
  targetDate: string;
  exerciseName?: string;
  sessionsPerWeek?: number;
  notes?: string;
};

type GoalRecommendationOptions = {
  count?: number;
  excludeKeys?: string[];
};

async function getGoalsClient(): Promise<TableClient> {
  return getTableClient("Goals");
}

async function getGoalStateClient(): Promise<TableClient> {
  return getTableClient("GoalState");
}

function getRecommendationKey(goal: GoalRecommendation): string {
  return [
    goal.type,
    goal.title.trim().toLowerCase(),
    goal.exerciseName?.trim().toLowerCase() ?? "",
    goal.targetValue,
    goal.targetDate,
    goal.sessionsPerWeek ?? "",
  ].join("|");
}

function dedupeRecommendations(goals: GoalRecommendation[]): GoalRecommendation[] {
  const seen = new Set<string>();
  return goals.filter((goal) => {
    const key = getRecommendationKey(goal);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterExcludedRecommendations(
  goals: GoalRecommendation[],
  excludeKeys: string[],
): GoalRecommendation[] {
  if (excludeKeys.length === 0) return goals;
  const excluded = new Set(excludeKeys);
  return goals.filter((goal) => !excluded.has(getRecommendationKey(goal)));
}

function getLiftingIncrement(bestWeight: number): number {
  if (bestWeight >= 60) return 2.5;
  if (bestWeight >= 20) return 2;
  return 1;
}

function getLiftingGoalNote(timelineDays: number): string {
  if (timelineDays <= 42) return "Short-cycle strength focus";
  if (timelineDays <= 70) return "Progressive overload over the next block";
  return "Longer-term strength milestone";
}

function buildLiftingRecommendations(
  sortedExercises: Array<[string, number]>,
  startDate: string,
): GoalRecommendation[] {
  return sortedExercises.slice(0, 6).map(([exerciseName, bestWeight], index) => {
    const increment = getLiftingIncrement(bestWeight);
    const timelineDays = [28, 42, 56, 70, 84, 98][index] ?? 56;
    const roundedTarget = Number((bestWeight + increment).toFixed(1));

    return {
      title: `${exerciseName} ${roundedTarget} kg`,
      type: "lifting",
      exerciseName,
      targetValue: roundedTarget,
      targetDate: addDays(startDate, timelineDays),
      notes: getLiftingGoalNote(timelineDays),
    };
  });
}

function buildBodyweightRecommendations(
  latestWeight: number | undefined,
  startDate: string,
): GoalRecommendation[] {
  if (latestWeight === undefined) return [];

  return [
    {
      title: `Bodyweight ${Number((latestWeight + 0.8).toFixed(1))} kg`,
      type: "bodyweight",
      targetValue: Number((latestWeight + 0.8).toFixed(1)),
      targetDate: addDays(startDate, 84),
      notes: "Steady gain target over 12 weeks",
    },
    {
      title: `Bodyweight ${Number((latestWeight + 0.4).toFixed(1))} kg`,
      type: "bodyweight",
      targetValue: Number((latestWeight + 0.4).toFixed(1)),
      targetDate: addDays(startDate, 42),
      notes: "Shorter-term scale trend goal",
    },
  ];
}

function buildConsistencyRecommendations(startDate: string): GoalRecommendation[] {
  return [
    {
      title: "Hit 3 sessions weekly",
      type: "consistency",
      targetValue: 3,
      sessionsPerWeek: 3,
      targetDate: addDays(startDate, 56),
      notes: "Consistency goal for 8 weeks",
    },
    {
      title: "Hit 4 sessions weekly",
      type: "consistency",
      targetValue: 4,
      sessionsPerWeek: 4,
      targetDate: addDays(startDate, 28),
      notes: "Short consistency push for 4 weeks",
    },
    {
      title: "Hit 3 sessions weekly for 12 weeks",
      type: "consistency",
      targetValue: 3,
      sessionsPerWeek: 3,
      targetDate: addDays(startDate, 84),
      notes: "Longer consistency runway",
    },
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function startOfWeekIso(date: Date): string {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getLatestExerciseValue(logs: ExerciseLog[], exerciseName: string): number | undefined {
  const values: Array<{ date: string; value: number }> = [];
  for (const log of logs) {
    for (const ex of log.exercises) {
      if (ex.name !== exerciseName) continue;
      const value = ex.actualWeight ?? ex.targetWeight;
      if (value !== undefined) values.push({ date: log.completedDate, value });
    }
  }
  values.sort((a, b) => a.date.localeCompare(b.date));
  return values.at(-1)?.value;
}

function getLiftingProgress(goal: Goal, logs: ExerciseLog[]): GoalProgressPoint[] {
  if (!goal.exerciseName) return [];
  const byDate = new Map<string, number>();

  for (const log of logs) {
    if (log.completedDate < goal.startDate || log.completedDate > goal.targetDate) continue;
    for (const ex of log.exercises) {
      if (ex.name !== goal.exerciseName) continue;
      const value = ex.actualWeight ?? ex.targetWeight;
      if (value === undefined) continue;
      const existing = byDate.get(log.completedDate);
      byDate.set(log.completedDate, existing === undefined ? value : Math.max(existing, value));
    }
  }

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

function getBodyweightProgress(goal: Goal, weights: BodyweightEntry[]): GoalProgressPoint[] {
  return weights
    .filter((entry) => entry.date >= goal.startDate && entry.date <= goal.targetDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({ date: entry.date, value: entry.weight }));
}

function getConsistencyProgress(goal: Goal, logs: ExerciseLog[]): GoalProgressPoint[] {
  const byWeek = new Map<string, Set<string>>();

  for (const log of logs) {
    const week = log.weekStart || startOfWeekIso(new Date(`${log.completedDate}T00:00:00`));
    if (week < goal.startDate || week > goal.targetDate) continue;
    if (!byWeek.has(week)) byWeek.set(week, new Set<string>());
    byWeek.get(week)?.add(`${log.day}-${log.completedDate}`);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, sessions]) => ({ date, value: sessions.size }));
}

function calculateProgress(
  goal: Goal,
  points: GoalProgressPoint[],
): {
  currentValue: number;
  progressPercent: number;
  isOnTrack: boolean;
  status: GoalStatus;
} {
  const baseline = goal.baselineValue ?? points[0]?.value ?? 0;
  const currentValue = points.at(-1)?.value ?? baseline;

  let progressPercent = 0;
  if (goal.type === "consistency") {
    const target = goal.sessionsPerWeek ?? goal.targetValue;
    progressPercent = target > 0 ? (currentValue / target) * 100 : 0;
  } else {
    const direction = goal.targetValue >= baseline ? 1 : -1;
    const denominator = Math.abs(goal.targetValue - baseline);
    if (denominator === 0) {
      progressPercent = 100;
    } else {
      progressPercent = ((currentValue - baseline) * direction * 100) / denominator;
    }
  }

  progressPercent = clamp(progressPercent, 0, 100);
  const isComplete = progressPercent >= 100;

  const now = new Date().toISOString().slice(0, 10);
  let status: GoalStatus = "in_progress";
  if (goal.status === "paused") {
    status = "paused";
  } else if (goal.status === "completed" || isComplete) {
    status = "completed";
  } else if (now > goal.targetDate) {
    status = "missed";
  }

  const elapsedDays = Math.max(
    1,
    Math.floor((new Date(now).getTime() - new Date(goal.startDate).getTime()) / 86400000),
  );
  const totalDays = Math.max(
    1,
    Math.floor(
      (new Date(goal.targetDate).getTime() - new Date(goal.startDate).getTime()) / 86400000,
    ),
  );
  const expectedPercent = clamp((elapsedDays / totalDays) * 100, 0, 100);
  const isOnTrack = status === "completed" || progressPercent >= expectedPercent - 12;

  return { currentValue, progressPercent, isOnTrack, status };
}

function validateGoalInput(input: GoalInput): void {
  if (!input.title?.trim()) throw new Error("Goal title is required");
  if (!["lifting", "bodyweight", "consistency"].includes(input.type)) {
    throw new Error("Invalid goal type");
  }
  if (!input.startDate || !input.targetDate) {
    throw new Error("Goal startDate and targetDate are required");
  }
  if (input.targetDate < input.startDate) {
    throw new Error("Goal targetDate must be on or after startDate");
  }
  if (input.targetValue <= 0) {
    throw new Error("Goal targetValue must be greater than 0");
  }
  if (input.type === "lifting" && !input.exerciseName) {
    throw new Error("Lifting goals require exerciseName");
  }
  if (input.type === "consistency" && !(input.sessionsPerWeek && input.sessionsPerWeek > 0)) {
    throw new Error("Consistency goals require sessionsPerWeek");
  }
}

function toGoal(input: GoalInput): Goal {
  validateGoalInput(input);
  const now = new Date().toISOString();
  return {
    id: input.id ?? randomUUID(),
    createdAt: input.createdAt ?? now,
    title: input.title.trim(),
    type: input.type,
    startDate: input.startDate,
    targetDate: input.targetDate,
    targetValue: input.targetValue,
    baselineValue: input.baselineValue,
    exerciseName: input.exerciseName,
    sessionsPerWeek: input.sessionsPerWeek,
    notes: input.notes,
    status: input.status,
  };
}

export async function getGoals(): Promise<Goal[]> {
  const client = await getGoalsClient();
  const entities = client.listEntities<GoalEntity>({
    queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
  });

  const goals: Goal[] = [];
  for await (const entity of entities) {
    goals.push(JSON.parse(entity.data) as Goal);
  }

  return goals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDismissedRecommendationKeys(): Promise<string[]> {
  const client = await getGoalStateClient();
  const entities = client.listEntities<GoalRecommendationStateEntity>({
    queryOptions: { filter: `PartitionKey eq '${DEFAULT_PK}'` },
  });

  const keys: string[] = [];
  for await (const entity of entities) {
    keys.push(entity.rowKey);
  }

  return keys.sort((a, b) => a.localeCompare(b));
}

export async function dismissRecommendation(goal: GoalRecommendation): Promise<string> {
  const client = await getGoalStateClient();
  const key = getRecommendationKey(goal);
  await client.upsertEntity(
    {
      partitionKey: DEFAULT_PK,
      rowKey: key,
      dismissedAt: new Date().toISOString(),
    },
    "Replace",
  );
  return key;
}

export async function getGoalsWithProgress(): Promise<GoalWithProgress[]> {
  const [goals, logs, weight] = await Promise.all([
    getGoals(),
    getExerciseHistory({ limit: 500 }),
    getWeightHistory(),
  ]);

  return goals.map((goal) => {
    let progressPoints: GoalProgressPoint[];
    if (goal.type === "lifting") {
      progressPoints = getLiftingProgress(goal, logs);
    } else if (goal.type === "bodyweight") {
      progressPoints = getBodyweightProgress(goal, weight);
    } else {
      progressPoints = getConsistencyProgress(goal, logs);
    }

    const calculated = calculateProgress(goal, progressPoints);
    return {
      ...goal,
      ...calculated,
      progressPoints,
    } satisfies GoalWithProgress;
  });
}

export async function saveGoal(goalInput: GoalInput): Promise<Goal> {
  const client = await getGoalsClient();
  const goal = toGoal(goalInput);

  const entity: GoalEntity = {
    partitionKey: DEFAULT_PK,
    rowKey: goal.id,
    data: JSON.stringify(goal),
  };

  await client.upsertEntity(entity, "Replace");
  return goal;
}

export async function deleteGoal(goalId: string): Promise<void> {
  const client = await getGoalsClient();
  await client.deleteEntity(DEFAULT_PK, goalId);
}

function buildFallbackRecommendations(
  logs: ExerciseLog[],
  weights: BodyweightEntry[],
  options: GoalRecommendationOptions = {},
): GoalRecommendation[] {
  const now = new Date();
  const startDate = now.toISOString().slice(0, 10);
  const count = options.count ?? 4;

  const exerciseBest = new Map<string, number>();
  for (const log of logs) {
    for (const ex of log.exercises) {
      const weight = ex.actualWeight ?? ex.targetWeight;
      if (weight === undefined) continue;
      const prev = exerciseBest.get(ex.name) ?? 0;
      exerciseBest.set(ex.name, Math.max(prev, weight));
    }
  }

  const sortedExercises = [...exerciseBest.entries()].sort((a, b) => b[1] - a[1]);
  const latestWeight = weights.at(-1)?.weight;

  const recs = [
    ...buildLiftingRecommendations(sortedExercises, startDate),
    ...buildBodyweightRecommendations(latestWeight, startDate),
    ...buildConsistencyRecommendations(startDate),
  ];

  return filterExcludedRecommendations(
    dedupeRecommendations(recs),
    options.excludeKeys ?? [],
  ).slice(0, count);
}

function normalizeRecommendations(
  raw: GoalRecommendation[],
  options: GoalRecommendationOptions = {},
): GoalRecommendation[] {
  const now = new Date().toISOString().slice(0, 10);
  const normalized = raw
    .filter((goal) => goal.title && goal.type && goal.targetDate && goal.targetValue > 0)
    .map((goal) => {
      const safeType: GoalType = ["lifting", "bodyweight", "consistency"].includes(goal.type)
        ? goal.type
        : "consistency";

      return {
        ...goal,
        type: safeType,
        targetDate: goal.targetDate < now ? addDays(now, 28) : goal.targetDate,
      };
    });

  return filterExcludedRecommendations(
    dedupeRecommendations(normalized),
    options.excludeKeys ?? [],
  ).slice(0, options.count ?? 4);
}

async function getLLMRecommendations(
  logs: ExerciseLog[],
  weights: BodyweightEntry[],
  options: GoalRecommendationOptions = {},
): Promise<GoalRecommendation[]> {
  const client = getOpenAIClient();
  const deployment = getDeploymentName();
  const now = new Date().toISOString().slice(0, 10);
  const count = options.count ?? 4;

  const logsSummary = logs
    .slice(0, 80)
    .map((log) => {
      const ex = log.exercises
        .map((item) => {
          const reps = (item.actualReps ?? item.targetReps).join(",");
          const weight = item.actualWeight ?? item.targetWeight;
          const weightSuffix = weight === undefined ? "" : `@${weight}kg`;
          return `${item.name}:${reps}${weightSuffix}`;
        })
        .join("; ");
      return `${log.weekStart}/${log.day}: ${ex}`;
    })
    .join("\n");

  const weightSummary = weights.map((w) => `${w.date}:${w.weight}`).join(", ");
  const excludeSummary = (options.excludeKeys ?? []).join("\n");

  const response = await client.chat.completions.create({
    model: deployment,
    temperature: 0.7,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `You are a strength and fitness coach. Recommend ${count} goals using history data. Include variety: at least one lifting, one consistency, and one bodyweight goal when possible. Use mixed timelines (4-12 weeks). Return ONLY JSON array with objects: title,type,targetValue,targetDate,exerciseName(optional),sessionsPerWeek(optional),notes(optional). type must be lifting|bodyweight|consistency. Do not repeat or closely paraphrase excluded recommendations.`,
      },
      {
        role: "user",
        content: `Today: ${now}\nExercise history:\n${logsSummary}\n\nWeight history:\n${weightSummary}\n\nExcluded recommendation keys:\n${excludeSummary || "none"}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty LLM response");

  const parsed = JSON.parse(content) as GoalRecommendation[];
  return normalizeRecommendations(parsed, options);
}

export async function getGoalRecommendations(
  options: GoalRecommendationOptions = {},
): Promise<GoalRecommendation[]> {
  const [logs, weights] = await Promise.all([
    getExerciseHistory({ limit: 400 }),
    getWeightHistory(),
  ]);
  const count = options.count ?? 4;
  const persistedExcludeKeys = await getDismissedRecommendationKeys();
  const excludeKeys = Array.from(
    new Set([...(options.excludeKeys ?? []), ...persistedExcludeKeys]),
  );

  if (isLLMConfigured()) {
    try {
      const llm = await getLLMRecommendations(logs, weights, { count, excludeKeys });
      if (llm.length >= count) return llm;

      const fallbackFill = buildFallbackRecommendations(logs, weights, {
        count,
        excludeKeys: [...excludeKeys, ...llm.map((goal) => getRecommendationKey(goal))],
      });
      return [...llm, ...fallbackFill].slice(0, count);
    } catch (err) {
      console.error("LLM goal recommendation failed, falling back:", err);
    }
  }

  return buildFallbackRecommendations(logs, weights, { count, excludeKeys });
}

export async function createGoalFromRecommendation(rec: GoalRecommendation): Promise<Goal> {
  const logs = await getExerciseHistory({ limit: 400 });
  const weights = await getWeightHistory();
  const startDate = new Date().toISOString().slice(0, 10);

  let baselineValue: number | undefined;
  if (rec.type === "lifting" && rec.exerciseName) {
    baselineValue = getLatestExerciseValue(logs, rec.exerciseName);
  } else if (rec.type === "bodyweight") {
    baselineValue = weights.at(-1)?.weight;
  }

  return saveGoal({
    title: rec.title,
    type: rec.type,
    targetValue: rec.targetValue,
    targetDate: rec.targetDate,
    startDate,
    baselineValue,
    exerciseName: rec.exerciseName,
    sessionsPerWeek: rec.sessionsPerWeek,
    notes: rec.notes,
    status: "in_progress",
  });
}
