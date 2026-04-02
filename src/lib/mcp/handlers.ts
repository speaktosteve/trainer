import type { BodyweightEntry, ExerciseLog, WeeklyPlan, WeeklySummary } from "$lib/types";
import {
  getExerciseHistory,
  getExerciseLogsForWeek,
  getWeightHistory,
} from "$lib/services/exerciseService";
import { getCurrentWeekPlan, getPlan } from "$lib/services/planService";
import { getWeekStart } from "$lib/utils/dates";
import { getSummaryProvider } from "$lib/services/summaryService";
import { MCP_TOOLS } from "./tools";
import { ensureObject, parseIsoDate, parseLimit } from "./validation";

export interface McpToolCallResult<T = unknown> {
  data: T;
}

interface ExerciseHistoryArgs {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface BodyweightHistoryArgs {
  startDate?: string;
  endDate?: string;
}

interface PlanArgs {
  weekStart?: string;
}

interface WeekSummaryArgs {
  weekStart?: string;
}

async function getExerciseHistoryTool(
  args: ExerciseHistoryArgs,
): Promise<McpToolCallResult<ExerciseLog[]>> {
  return {
    data: await getExerciseHistory({
      fromDate: parseIsoDate(args.startDate, "startDate"),
      toDate: parseIsoDate(args.endDate, "endDate"),
      limit: parseLimit(args.limit),
    }),
  };
}

async function getBodyweightHistoryTool(
  args: BodyweightHistoryArgs,
): Promise<McpToolCallResult<BodyweightEntry[]>> {
  return {
    data: await getWeightHistory({
      fromDate: parseIsoDate(args.startDate, "startDate"),
      toDate: parseIsoDate(args.endDate, "endDate"),
    }),
  };
}

async function getPlanTool(args: PlanArgs): Promise<McpToolCallResult<WeeklyPlan | null>> {
  const weekStart = parseIsoDate(args.weekStart, "weekStart");
  const plan = weekStart ? await getPlan(weekStart) : await getCurrentWeekPlan();
  return { data: plan };
}

async function getWeekSummaryTool(
  args: WeekSummaryArgs,
): Promise<McpToolCallResult<WeeklySummary>> {
  const weekStart = parseIsoDate(args.weekStart, "weekStart") ?? getWeekStart();

  const currentLogs = await getExerciseLogsForWeek(weekStart);
  const prevDate = new Date(weekStart + "T00:00:00Z");
  prevDate.setDate(prevDate.getDate() - 7);
  const prevWeekStart = prevDate.toISOString().slice(0, 10);
  const previousLogs = await getExerciseLogsForWeek(prevWeekStart);
  const weightHistory = await getWeightHistory();

  const provider = getSummaryProvider();
  const summary = await provider.generateSummary(
    weekStart,
    currentLogs,
    previousLogs,
    weightHistory,
  );
  return { data: summary };
}

type ToolHandler = (args: Record<string, unknown>) => Promise<McpToolCallResult>;

const handlers: Record<string, ToolHandler> = {
  get_exercise_history: (args) => getExerciseHistoryTool(args as ExerciseHistoryArgs),
  get_bodyweight_history: (args) => getBodyweightHistoryTool(args as BodyweightHistoryArgs),
  get_plan: (args) => getPlanTool(args as PlanArgs),
  get_week_summary: (args) => getWeekSummaryTool(args as WeekSummaryArgs),
};

export function listMcpTools() {
  return MCP_TOOLS;
}

export async function executeMcpTool(name: string, rawArgs: unknown): Promise<McpToolCallResult> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const args = ensureObject(rawArgs ?? {});
  return handler(args);
}
