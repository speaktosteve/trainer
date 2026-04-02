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

  it("rejects unknown tool names", async () => {
    await expect(executeMcpTool("does_not_exist", {})).rejects.toThrow("Unknown tool");
  });
});
