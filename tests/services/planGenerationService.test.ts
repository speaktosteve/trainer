import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { SmartCopyProvider, LLMPlanProvider } from "$lib/services/planGenerationService";
import type { WeeklyPlan, ExerciseLog } from "$lib/types";

vi.mock("$lib/services/openaiClient", () => ({
  getOpenAIClient: vi.fn(),
  getDeploymentName: vi.fn(() => "gpt-4o-mini"),
}));

import { getOpenAIClient } from "$lib/services/openaiClient";

const basePlan: WeeklyPlan = {
  weekStart: "2026-03-30",
  sessions: [
    {
      day: "monday",
      label: "Push",
      exercises: [
        { name: "Bench Press", targetWeight: 62.5, targetReps: [6, 6, 6, 6] },
        { name: "Overhead Press", targetWeight: 40, targetReps: [8, 8, 8] },
        { name: "Pull-ups", targetReps: [5, 5, 5] }, // bodyweight
      ],
    },
    {
      day: "wednesday",
      label: "Lower",
      exercises: [{ name: "Squat", targetWeight: 80, targetReps: [5, 5, 5] }],
    },
  ],
};

function makeLog(
  day: ExerciseLog["day"],
  exercises: ExerciseLog["exercises"],
  weekStart = "2026-03-30",
): ExerciseLog {
  return {
    day,
    label: "Push",
    completedDate: `${weekStart}`,
    weekStart,
    exercises,
  };
}

describe("SmartCopyProvider", () => {
  const provider = new SmartCopyProvider();

  it("advances weekStart by 7 days", async () => {
    const result = await provider.generateNextPlan(basePlan, [], []);
    expect(result.weekStart).toBe("2026-04-06");
  });

  it("preserves session structure (days and labels)", async () => {
    const result = await provider.generateNextPlan(basePlan, [], []);
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0].day).toBe("monday");
    expect(result.sessions[0].label).toBe("Push");
    expect(result.sessions[1].day).toBe("wednesday");
  });

  it("carries exercises forward unchanged when no completion data exists", async () => {
    const result = await provider.generateNextPlan(basePlan, [], []);
    const benchPress = result.sessions[0].exercises.find((e) => e.name === "Bench Press");
    expect(benchPress).toBeDefined();
    expect(benchPress!.targetWeight).toBe(62.5);
    expect(benchPress!.targetReps).toEqual([6, 6, 6, 6]);
    // No actual data should be present in next week's plan
    expect(benchPress!.actualWeight).toBeUndefined();
    expect(benchPress!.actualReps).toBeUndefined();
  });

  it("bumps weight by 2.5 kg for a weighted exercise ≥ 20 kg when all reps are hit", async () => {
    const logs = [
      makeLog("monday", [
        {
          name: "Bench Press",
          targetWeight: 62.5,
          targetReps: [6, 6, 6, 6],
          actualWeight: 62.5,
          actualReps: [6, 6, 6, 6], // all reps hit
        },
      ]),
    ];

    const result = await provider.generateNextPlan(basePlan, logs, []);
    const benchPress = result.sessions[0].exercises.find((e) => e.name === "Bench Press");
    expect(benchPress!.targetWeight).toBe(65);
    expect(benchPress!.notes).toContain("62.5 kg");
  });

  it("bumps weight by 1 kg for a weighted exercise < 20 kg when all reps are hit", async () => {
    const lightPlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [{ name: "Tricep Extension", targetWeight: 15, targetReps: [10, 10, 10] }],
        },
      ],
    };
    const logs = [
      makeLog("monday", [
        {
          name: "Tricep Extension",
          targetWeight: 15,
          targetReps: [10, 10, 10],
          actualWeight: 15,
          actualReps: [10, 10, 10],
        },
      ]),
    ];

    const result = await provider.generateNextPlan(lightPlan, logs, []);
    const ex = result.sessions[0].exercises[0];
    expect(ex.targetWeight).toBe(16);
  });

  it("keeps weight the same when reps are not fully achieved", async () => {
    const logs = [
      makeLog("monday", [
        {
          name: "Bench Press",
          targetWeight: 62.5,
          targetReps: [6, 6, 6, 6],
          actualWeight: 62.5,
          actualReps: [6, 5, 5, 4], // missed reps
        },
      ]),
    ];

    const result = await provider.generateNextPlan(basePlan, logs, []);
    const benchPress = result.sessions[0].exercises.find((e) => e.name === "Bench Press");
    expect(benchPress!.targetWeight).toBe(62.5);
    expect(benchPress!.notes).toContain("Retry");
    expect(benchPress!.notes).toContain("6, 5, 5, 4");
  });

  it("adds a rep to the lowest set for a bodyweight exercise when all reps are hit", async () => {
    const logs = [
      makeLog("monday", [
        {
          name: "Pull-ups",
          targetReps: [5, 5, 5],
          actualReps: [5, 5, 5], // all reps hit
        },
      ]),
    ];

    const result = await provider.generateNextPlan(basePlan, logs, []);
    const pullUps = result.sessions[0].exercises.find((e) => e.name === "Pull-ups");
    expect(pullUps).toBeDefined();
    expect(pullUps!.targetReps.reduce((a, b) => a + b, 0)).toBe(16); // 5+5+5+1
    expect(pullUps!.targetWeight).toBeUndefined();
  });

  it("retries the same reps for a bodyweight exercise when reps are missed", async () => {
    const logs = [
      makeLog("monday", [
        {
          name: "Pull-ups",
          targetReps: [5, 5, 5],
          actualReps: [5, 4, 3], // missed reps
        },
      ]),
    ];

    const result = await provider.generateNextPlan(basePlan, logs, []);
    const pullUps = result.sessions[0].exercises.find((e) => e.name === "Pull-ups");
    expect(pullUps!.targetReps).toEqual([5, 5, 5]);
  });

  it("handles multiple days with different performance data", async () => {
    const logs = [
      makeLog("monday", [
        {
          name: "Bench Press",
          targetWeight: 62.5,
          targetReps: [6, 6, 6, 6],
          actualWeight: 62.5,
          actualReps: [6, 6, 6, 6],
        },
      ]),
      makeLog("wednesday", [
        {
          name: "Squat",
          targetWeight: 80,
          targetReps: [5, 5, 5],
          actualWeight: 80,
          actualReps: [5, 5, 5],
        },
      ]),
    ];

    const result = await provider.generateNextPlan(basePlan, logs, []);
    const bench = result.sessions[0].exercises.find((e) => e.name === "Bench Press");
    const squat = result.sessions[1].exercises.find((e) => e.name === "Squat");
    expect(bench!.targetWeight).toBe(65);
    expect(squat!.targetWeight).toBe(82.5);
  });

  it("ignores exercises where actualReps is not set", async () => {
    const logs = [
      makeLog("monday", [
        {
          name: "Bench Press",
          targetWeight: 62.5,
          targetReps: [6, 6, 6, 6],
          // no actualReps — treat as incomplete
        },
      ]),
    ];

    const result = await provider.generateNextPlan(basePlan, logs, []);
    const bench = result.sessions[0].exercises.find((e) => e.name === "Bench Press");
    // Should carry forward unchanged
    expect(bench!.targetWeight).toBe(62.5);
    expect(bench!.notes).toBeUndefined();
  });
});

describe("LLMPlanProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when LLM returns empty content", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const provider = new LLMPlanProvider();
    await expect(provider.generateNextPlan(basePlan, [], [])).rejects.toThrow(
      "LLM plan generation failed",
    );
  });

  it("throws when LLM call fails", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const provider = new LLMPlanProvider();
    await expect(provider.generateNextPlan(basePlan, [], [])).rejects.toThrow(
      "LLM plan generation failed",
    );
  });

  it("parses valid LLM JSON response and overrides weekStart", async () => {
    const llmPayload: WeeklyPlan = {
      weekStart: "2099-01-01", // LLM may return wrong date; should be overridden
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [{ name: "Bench Press", targetWeight: 65, targetReps: [6, 6, 6, 6] }],
        },
      ],
      summary: {
        weekStart: "2026-04-06",
        text: "Strong week",
        headline: "Strong week!",
        lines: [{ icon: "📈", label: "Bench", detail: "65kg" }],
      },
    };
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(llmPayload) } }],
    });
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const provider = new LLMPlanProvider();
    const result = await provider.generateNextPlan(basePlan, [], []);
    // weekStart must be next week, not what LLM returned
    expect(result.weekStart).toBe("2026-04-06");
    expect(result.sessions[0].exercises[0].targetWeight).toBe(65);
  });

  it("backfills targetWeight from source plan when LLM omits it", async () => {
    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            { name: "Bench Press", targetReps: [6, 6, 6, 6] }, // no targetWeight
          ],
        },
      ],
    };
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(llmPayload) } }],
    });
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const provider = new LLMPlanProvider();
    const result = await provider.generateNextPlan(basePlan, [], []);
    const bench = result.sessions[0].exercises.find((e) => e.name === "Bench Press");
    // Should be backfilled from the source plan
    expect(bench!.targetWeight).toBe(62.5);
  });
});
