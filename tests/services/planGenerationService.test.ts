import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import {
  SmartCopyProvider,
  LLMPlanProvider,
  getPlanGenerator,
  planGenerator,
  llmPlanGenerator,
} from "$lib/services/planGenerationService";
import type { WeeklyPlan, ExerciseLog } from "$lib/types";

vi.mock("$lib/services/openaiClient", () => ({
  getOpenAIClient: vi.fn(),
  getDeploymentName: vi.fn(() => "gpt-4o-mini"),
  isLLMConfigured: vi.fn(() => false),
}));

import { getOpenAIClient, isLLMConfigured } from "$lib/services/openaiClient";

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

describe("getPlanGenerator", () => {
  it("returns llmPlanGenerator when LLM is configured", () => {
    vi.mocked(isLLMConfigured).mockReturnValue(true);
    expect(getPlanGenerator()).toBe(llmPlanGenerator);
  });

  it("returns planGenerator when LLM is not configured", () => {
    vi.mocked(isLLMConfigured).mockReturnValue(false);
    expect(getPlanGenerator()).toBe(planGenerator);
  });
});

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

  it("does not increase weight when machine weight is maxed out", async () => {
    const machinePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Pull",
          exercises: [
            {
              name: "Machine Seated Row",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [10, 10, 10],
            },
          ],
        },
      ],
    };
    const logs = [
      makeLog("monday", [
        {
          name: "Machine Seated Row",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [10, 10, 10],
          actualWeight: 109,
          actualReps: [10, 10, 10],
        },
      ]),
    ];

    const result = await provider.generateNextPlan(machinePlan, logs, []);
    const row = result.sessions[0].exercises[0];
    expect(row.targetWeight).toBe(109);
    expect(row.machineWeightMaxedOut).toBe(true);
    expect(row.targetReps).toEqual([11, 10, 10]);
    expect(row.notes).toBe("Machine already at max weight");
  });

  it("does not increase weight when machineWeightMaxedOut is true", async () => {
    const machinePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Pull",
          exercises: [
            {
              name: "Machine Seated Row",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [10, 10, 10],
            },
          ],
        },
      ],
    };
    const logs = [
      makeLog("monday", [
        {
          name: "Machine Seated Row",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [10, 10, 10],
          actualWeight: 109,
          actualReps: [10, 10, 10],
        },
      ]),
    ];

    const result = await provider.generateNextPlan(machinePlan, logs, []);
    const exercise = result.sessions[0].exercises[0];

    expect(exercise.targetWeight).toBe(109);
    expect(exercise.machineWeightMaxedOut).toBe(true);
    expect(exercise.targetReps).toEqual([11, 10, 10]);
    expect(exercise.notes).toBe("Machine already at max weight");
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

  it("does not progress when total reps match but set targets are missed", async () => {
    const perSetPlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [{ name: "Bench Press", targetWeight: 62.5, targetReps: [5, 5, 5] }],
        },
      ],
    };
    const logs = [
      makeLog("monday", [
        {
          name: "Bench Press",
          targetWeight: 62.5,
          targetReps: [5, 5, 5],
          actualWeight: 62.5,
          actualReps: [8, 4, 3],
        },
      ]),
    ];

    const result = await provider.generateNextPlan(perSetPlan, logs, []);
    const bench = result.sessions[0].exercises[0];
    expect(bench.targetWeight).toBe(62.5);
    expect(bench.notes).toContain("Retry");
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
    expect(result.sessions[0].exercises[0].targetWeight).toBe(62.5);
    expect(result.sessions[0].exercises[0].notes).toContain("No record last week");
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

  it("includes machine max flags in the LLM prompt and backfills them when omitted", async () => {
    const machinePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [10, 10, 10],
            },
          ],
        },
      ],
    };
    const completedLogs = [
      makeLog("monday", [
        {
          name: "Machine Seated Chest Press",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [10, 10, 10],
          actualWeight: 109,
          actualReps: [10, 10, 10],
        },
      ]),
    ];
    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            { name: "Machine Seated Chest Press", targetWeight: 109, targetReps: [10, 10, 10] },
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
    const result = await provider.generateNextPlan(machinePlan, completedLogs, []);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const userPrompt = mockCreate.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("[MAX MACHINE WEIGHT]");
    expect(result.sessions[0].exercises[0].machineWeightMaxedOut).toBe(true);
  });

  it("includes max machine weight markers in the LLM prompt and backfills the flag", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [10, 10, 10],
            },
          ],
        },
      ],
    };
    const completedLogs = [
      makeLog("monday", [
        {
          name: "Machine Seated Chest Press",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [10, 10, 10],
          actualWeight: 109,
          actualReps: [10, 10, 10],
        },
      ]),
    ];
    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            { name: "Machine Seated Chest Press", targetWeight: 109, targetReps: [10, 10, 10] },
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
    const result = await provider.generateNextPlan(sourcePlan, completedLogs, []);
    const prompt = mockCreate.mock.calls[0][0].messages[1].content as string;

    expect(prompt).toContain("[MAX MACHINE WEIGHT]");
    expect(result.sessions[0].exercises[0].machineWeightMaxedOut).toBe(true);
  });

  it("enforces machine max weight and adds exact note for maxed machines", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [10, 10, 10],
            },
          ],
        },
      ],
    };

    const completedLogs = [
      makeLog("monday", [
        {
          name: "Machine Seated Chest Press",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [10, 10, 10],
          actualWeight: 109,
          actualReps: [10, 10, 10],
        },
      ]),
    ];

    const llmPayload = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 112,
              targetReps: [10, 10, 10],
            },
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
    const result = await provider.generateNextPlan(sourcePlan, completedLogs, []);
    const ex = result.sessions[0].exercises[0];

    expect(ex.targetWeight).toBe(109);
    expect(ex.machineWeightMaxedOut).toBe(true);
    expect(ex.notes).toBe("Machine already at max weight");
  });

  it("keeps targets unchanged and adds note when no record exists for the week", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Bench Press",
              targetWeight: 62.5,
              targetReps: [6, 6, 6, 6],
            },
          ],
        },
      ],
    };

    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Bench Press",
              targetWeight: 65,
              targetReps: [7, 7, 7, 7],
            },
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
    const result = await provider.generateNextPlan(sourcePlan, [], []);
    const ex = result.sessions[0].exercises[0];

    expect(ex.targetWeight).toBe(62.5);
    expect(ex.targetReps).toEqual([6, 6, 6, 6]);
    expect(ex.notes).toBe("No record last week");
  });

  it("removes stale no-record notes when completion exists", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Pull",
          exercises: [
            {
              name: "Lat Pull",
              targetWeight: 68,
              targetReps: [12, 12, 10],
            },
          ],
        },
      ],
    };

    const completedLogs = [
      makeLog("monday", [
        {
          name: "Lat Pull",
          targetWeight: 68,
          targetReps: [12, 12, 10],
          actualWeight: 68,
          actualReps: [12, 12, 10],
        },
      ]),
    ];

    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Pull",
          exercises: [
            {
              name: "Lat Pull",
              targetWeight: 68,
              targetReps: [12, 12, 10],
              notes: "No record last week",
            },
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
    const result = await provider.generateNextPlan(sourcePlan, completedLogs, []);
    const ex = result.sessions[0].exercises[0];

    expect(ex.notes).toBeUndefined();
  });

  it("does not leak notes between same exercise names on different days", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Upper A",
          exercises: [
            {
              name: "Seated Shoulder Press",
              targetWeight: 14,
              targetReps: [10, 10, 10],
            },
          ],
        },
        {
          day: "friday",
          label: "Full Body",
          exercises: [
            {
              name: "Seated Shoulder Press",
              targetWeight: 16,
              targetReps: [10, 10, 10],
            },
          ],
        },
      ],
    };

    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Upper A",
          exercises: [
            {
              name: "Seated Shoulder Press",
              targetWeight: 14,
              targetReps: [10, 10, 10],
              notes: "Holding at 16kg",
            },
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
    const result = await provider.generateNextPlan(sourcePlan, [], []);
    const ex = result.sessions[0].exercises[0];

    expect(ex.targetWeight).toBe(14);
    expect(ex.notes).toBe("No record last week");
  });

  it("stops increasing machine-max reps once every set reaches 15", async () => {
    const machinePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [15, 15, 15],
            },
          ],
        },
      ],
    };
    const completedLogs = [
      makeLog("monday", [
        {
          name: "Machine Seated Chest Press",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [15, 15, 15],
          actualWeight: 109,
          actualReps: [15, 15, 15],
        },
      ]),
    ];
    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 112,
              targetReps: [15, 15, 15],
            },
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
    const result = await provider.generateNextPlan(machinePlan, completedLogs, []);

    expect(result.sessions[0].exercises[0].targetReps).toEqual([15, 15, 15]);
  });

  it("does not increase machine-max reps when only total volume is met", async () => {
    const machinePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [5, 5, 5],
            },
          ],
        },
      ],
    };
    const completedLogs = [
      makeLog("monday", [
        {
          name: "Machine Seated Chest Press",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [5, 5, 5],
          actualWeight: 109,
          actualReps: [8, 4, 3],
        },
      ]),
    ];
    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Machine Seated Chest Press",
              targetWeight: 112,
              targetReps: [5, 5, 5],
            },
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
    const result = await provider.generateNextPlan(machinePlan, completedLogs, []);

    expect(result.sessions[0].exercises[0].targetReps).toEqual([5, 5, 5]);
  });

  it("matches by exerciseId when LLM moves exercise day", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              exerciseId: "monday:0:machine seated chest press",
              name: "Machine Seated Chest Press",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [10, 10, 10],
            },
          ],
        },
      ],
    };
    const completedLogs = [
      makeLog("monday", [
        {
          exerciseId: "monday:0:machine seated chest press",
          name: "Machine Seated Chest Press",
          targetWeight: 109,
          machineWeightMaxedOut: true,
          targetReps: [10, 10, 10],
          actualWeight: 109,
          actualReps: [10, 10, 10],
        },
      ]),
    ];
    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "wednesday",
          label: "Push",
          exercises: [
            {
              exerciseId: "monday:0:machine seated chest press",
              name: "Machine Seated Chest Press",
              targetWeight: 112,
              targetReps: [10, 10, 10],
            },
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
    const result = await provider.generateNextPlan(sourcePlan, completedLogs, []);
    const ex = result.sessions[0].exercises[0];

    expect(ex.exerciseId).toBe("monday:0:machine seated chest press");
    expect(ex.targetWeight).toBe(109);
    expect(ex.targetReps).toEqual([11, 10, 10]);
    expect(ex.notes).toBe("Machine already at max weight");
  });

  it("appends summary correction line when constraints adjust generated values", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Bench Press",
              targetWeight: 62.5,
              targetReps: [6, 6, 6, 6],
            },
          ],
        },
      ],
    };

    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Bench Press",
              targetWeight: 70,
              targetReps: [8, 8, 8, 8],
            },
          ],
        },
      ],
      summary: {
        weekStart: "2026-04-06",
        text: "",
        headline: "Big jump week",
        lines: [{ icon: "📈", label: "Bench", detail: "Jumping to 70kg" }],
      },
    };

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(llmPayload) } }],
    });
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const provider = new LLMPlanProvider();
    const result = await provider.generateNextPlan(sourcePlan, [], []);

    expect(result.sessions[0].exercises[0].targetWeight).toBe(62.5);
    const correctionLine = result.summary?.lines.find((line) => line.label === "Auto-correct");
    expect(correctionLine).toBeDefined();
    expect(correctionLine?.icon).toBe("🔒");
    expect(result.summary?.text).toContain("🔒");
  });

  it("restores source exercises when LLM returns an empty uncompleted day", async () => {
    const sourcePlan: WeeklyPlan = {
      weekStart: "2026-03-30",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Bench Press",
              targetWeight: 62.5,
              targetReps: [6, 6, 6, 6],
            },
          ],
        },
        {
          day: "wednesday",
          label: "Lower",
          exercises: [
            {
              name: "Squat",
              targetWeight: 80,
              targetReps: [5, 5, 5],
            },
          ],
        },
      ],
    };

    const completedLogs = [
      makeLog("monday", [
        {
          name: "Bench Press",
          targetWeight: 62.5,
          targetReps: [6, 6, 6, 6],
          actualWeight: 62.5,
          actualReps: [6, 6, 6, 6],
        },
      ]),
    ];

    const llmPayload: WeeklyPlan = {
      weekStart: "2026-04-06",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            {
              name: "Bench Press",
              targetWeight: 65,
              targetReps: [6, 6, 6, 6],
            },
          ],
        },
        {
          day: "wednesday",
          label: "Lower",
          exercises: [],
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
    const result = await provider.generateNextPlan(sourcePlan, completedLogs, []);
    const lowerSession = result.sessions.find((session) => session.day === "wednesday");

    expect(lowerSession).toBeDefined();
    expect(lowerSession?.exercises).toHaveLength(1);
    expect(lowerSession?.exercises[0].name).toBe("Squat");
    expect(lowerSession?.exercises[0].targetWeight).toBe(80);
    expect(lowerSession?.exercises[0].targetReps).toEqual([5, 5, 5]);
    expect(lowerSession?.exercises[0].notes).toBe("No record last week");
  });
});
