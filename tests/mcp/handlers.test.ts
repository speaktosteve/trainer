import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("$lib/services/exerciseService", () => ({
  getExerciseHistory: vi.fn(),
  getExerciseLogsForWeek: vi.fn(),
  getWeightHistory: vi.fn(),
}));

vi.mock("$lib/services/planService", () => ({
  getCurrentWeekPlan: vi.fn(),
  getPlan: vi.fn(),
}));

vi.mock("$lib/services/summaryService", () => ({
  getSummaryProvider: vi.fn(),
  summaryProvider: { generateSummary: vi.fn() },
  llmSummaryProvider: { generateSummary: vi.fn() },
}));

vi.mock("$lib/services/goalsService", () => ({
  getGoalsWithProgress: vi.fn(),
}));

vi.mock("$lib/services/openaiClient", () => ({
  isLLMConfigured: vi.fn(() => false),
}));

import { executeMcpTool, listMcpTools } from "$lib/mcp/handlers";
import {
  getExerciseHistory,
  getExerciseLogsForWeek,
  getWeightHistory,
} from "$lib/services/exerciseService";
import { getCurrentWeekPlan, getPlan } from "$lib/services/planService";
import { getGoalsWithProgress } from "$lib/services/goalsService";
import { getSummaryProvider, summaryProvider } from "$lib/services/summaryService";

describe("mcp handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSummaryProvider).mockReturnValue(summaryProvider as any);
  });

  it("lists expected read-only tools", () => {
    const tools = listMcpTools();
    expect(tools.map((t) => t.name)).toEqual([
      "get_exercise_history",
      "get_bodyweight_history",
      "get_plan",
      "get_week_summary",
      "get_goals",
      "get_goal_progress",
    ]);
  });

  it("executes get_exercise_history with validated args", async () => {
    vi.mocked(getExerciseHistory).mockResolvedValue([]);

    const result = await executeMcpTool("get_exercise_history", {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      limit: 25,
    });

    expect(result.data).toEqual([]);
    expect(getExerciseHistory).toHaveBeenCalledWith({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      limit: 25,
    });
  });

  it("executes get_bodyweight_history", async () => {
    vi.mocked(getWeightHistory).mockResolvedValue([{ date: "2026-03-27", weight: 77.5 }]);

    const result = await executeMcpTool("get_bodyweight_history", {
      startDate: "2026-03-01",
    });

    expect(result.data).toEqual([{ date: "2026-03-27", weight: 77.5 }]);
    expect(getWeightHistory).toHaveBeenCalledWith({
      fromDate: "2026-03-01",
      toDate: undefined,
    });
  });

  it("executes get_plan for current week when no weekStart is provided", async () => {
    vi.mocked(getCurrentWeekPlan).mockResolvedValue(null);

    const result = await executeMcpTool("get_plan", {});

    expect(result.data).toBeNull();
    expect(getCurrentWeekPlan).toHaveBeenCalledTimes(1);
    expect(getPlan).not.toHaveBeenCalled();
  });

  it("executes get_plan for explicit weekStart", async () => {
    vi.mocked(getPlan).mockResolvedValue({ weekStart: "2026-03-30", sessions: [] });

    const result = await executeMcpTool("get_plan", { weekStart: "2026-03-30" });

    expect(result.data).toEqual({ weekStart: "2026-03-30", sessions: [] });
    expect(getPlan).toHaveBeenCalledWith("2026-03-30");
  });

  it("executes get_week_summary using current+previous logs", async () => {
    vi.mocked(getExerciseLogsForWeek).mockResolvedValue([]);
    vi.mocked(getWeightHistory).mockResolvedValue([]);
    vi.mocked(summaryProvider.generateSummary).mockResolvedValue({
      weekStart: "2026-03-30",
      headline: "Ready to start this week.",
      text: "Ready to start this week.",
      lines: [],
    });

    const result = await executeMcpTool("get_week_summary", { weekStart: "2026-03-30" });

    expect((result.data as { weekStart: string }).weekStart).toBe("2026-03-30");
    expect(getExerciseLogsForWeek).toHaveBeenCalledWith("2026-03-30");
    expect(getSummaryProvider).toHaveBeenCalledTimes(1);
    expect(summaryProvider.generateSummary).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid date inputs", async () => {
    await expect(
      executeMcpTool("get_exercise_history", { startDate: "03/31/2026" }),
    ).rejects.toThrow("startDate must be an ISO date string");
  });

  it("executes get_goals and returns active goals only", async () => {
    vi.mocked(getGoalsWithProgress).mockResolvedValue([
      {
        id: "goal-1",
        title: "Bench 70kg",
        type: "lifting",
        startDate: "2026-04-01",
        targetDate: "2026-05-15",
        targetValue: 70,
        exerciseName: "Bench Press",
        status: "in_progress",
        createdAt: "2026-04-01T09:00:00Z",
        currentValue: 67.5,
        progressPercent: 60,
        progressPoints: [],
        isOnTrack: true,
      },
      {
        id: "goal-2",
        title: "3 sessions/week",
        type: "consistency",
        startDate: "2026-04-01",
        targetDate: "2026-05-27",
        targetValue: 3,
        sessionsPerWeek: 3,
        status: "completed",
        createdAt: "2026-04-01T09:00:00Z",
        currentValue: 3,
        progressPercent: 100,
        progressPoints: [],
        isOnTrack: true,
      },
    ] as any);

    const result = await executeMcpTool("get_goals", {});

    expect(result.data).toHaveLength(1);
    expect((result.data as Array<{ id: string }>)[0]?.id).toBe("goal-1");
  });

  it("executes get_goal_progress for a specific goal", async () => {
    vi.mocked(getGoalsWithProgress).mockResolvedValue([
      {
        id: "goal-1",
        title: "Bench 70kg",
        type: "lifting",
        startDate: "2026-04-01",
        targetDate: "2026-05-15",
        targetValue: 70,
        exerciseName: "Bench Press",
        status: "in_progress",
        createdAt: "2026-04-01T09:00:00Z",
        currentValue: 67.5,
        progressPercent: 60,
        progressPoints: [],
        isOnTrack: true,
      },
    ] as any);

    const result = await executeMcpTool("get_goal_progress", { id: "goal-1" });

    expect((result.data as { id: string }).id).toBe("goal-1");
    expect(getGoalsWithProgress).toHaveBeenCalledTimes(1);
  });

  it("rejects get_goal_progress when goal is missing", async () => {
    vi.mocked(getGoalsWithProgress).mockResolvedValue([]);

    await expect(executeMcpTool("get_goal_progress", { id: "missing" })).rejects.toThrow(
      "Goal not found: missing",
    );
  });

  it("rejects unknown tool names", async () => {
    await expect(executeMcpTool("does_not_exist", {})).rejects.toThrow("Unknown tool");
  });
});
