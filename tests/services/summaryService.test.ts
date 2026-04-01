import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { MockSummaryProvider, LLMSummaryProvider } from "$lib/services/summaryService";
import type { ExerciseLog, BodyweightEntry } from "$lib/types";

vi.mock("$lib/services/openaiClient", () => ({
  getOpenAIClient: vi.fn(),
  getDeploymentName: vi.fn(() => "gpt-4o-mini"),
  isLLMConfigured: vi.fn(() => false),
}));

import { getOpenAIClient } from "$lib/services/openaiClient";

const provider = new MockSummaryProvider();

function makeLog(overrides: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    day: "monday",
    label: "Push",
    completedDate: "2026-03-30",
    weekStart: "2026-03-30",
    exercises: [
      {
        name: "Bench Press",
        targetWeight: 62.5,
        targetReps: [6, 6, 6, 6],
        actualWeight: 62.5,
        actualReps: [6, 6, 6, 6],
      },
    ],
    ...overrides,
  };
}

describe("MockSummaryProvider", () => {
  it("generates a summary with weight trend", async () => {
    const weights: BodyweightEntry[] = [
      { date: "2026-03-20", weight: 77.8 },
      { date: "2026-03-27", weight: 77.7 },
    ];

    const result = await provider.generateSummary("2026-03-30", [], [], weights);
    expect(result.weekStart).toBe("2026-03-30");
    expect(result.headline).toBeTruthy();
    const weightLine = result.lines.find((l) => l.label === "Bodyweight");
    expect(weightLine).toBeDefined();
    expect(weightLine!.detail).toContain("77.7");
  });

  it("detects weight increase improvements", async () => {
    const prevLogs = [
      makeLog({
        weekStart: "2026-03-23",
        exercises: [
          {
            name: "Bench Press",
            targetWeight: 60,
            targetReps: [6, 6, 6, 6],
            actualWeight: 60,
            actualReps: [6, 6, 6, 6],
          },
        ],
      }),
    ];
    const currentLogs = [
      makeLog({
        exercises: [
          {
            name: "Bench Press",
            targetWeight: 62.5,
            targetReps: [6, 6, 6, 6],
            actualWeight: 62.5,
            actualReps: [6, 6, 6, 6],
          },
        ],
      }),
    ];

    const result = await provider.generateSummary("2026-03-30", currentLogs, prevLogs, []);
    const progressLine = result.lines.find((l) => l.label === "Progress");
    expect(progressLine).toBeDefined();
    expect(progressLine!.detail).toContain("Bench Press");
    expect(progressLine!.detail).toContain("↑");
  });

  it("detects injury notes", async () => {
    const logs = [
      makeLog({
        sessionNotes: "Listen to your body regarding the injury",
      }),
    ];

    const result = await provider.generateSummary("2026-03-30", logs, [], []);
    const watchLine = result.lines.find((l) => l.label === "Watch");
    expect(watchLine).toBeDefined();
    expect(watchLine!.detail).toContain("injury");
  });

  it("returns a headline when no data", async () => {
    const result = await provider.generateSummary("2026-03-30", [], [], []);
    expect(result.headline).toBe("Ready to start this week.");
    expect(result.lines).toHaveLength(0);
  });

  it('returns "Solid consistency this week." for 4 or more sessions', async () => {
    const logs = [
      makeLog({ day: "monday" }),
      makeLog({ day: "tuesday" }),
      makeLog({ day: "wednesday" }),
      makeLog({ day: "friday" }),
    ];
    const result = await provider.generateSummary("2026-03-30", logs, [], []);
    expect(result.headline).toBe("Solid consistency this week.");
  });

  it('returns "Keep building momentum." for 1-3 sessions with no improvements', async () => {
    const logs = [makeLog()];
    const result = await provider.generateSummary("2026-03-30", logs, [], []);
    expect(result.headline).toBe("Keep building momentum.");
  });

  it('returns "Great week — multiple PRs!" for 3 or more improvements', async () => {
    const exercises = ["Bench Press", "Overhead Press", "Row"];
    const prevLogs = exercises.map((name) =>
      makeLog({
        exercises: [
          {
            name,
            targetWeight: 50,
            targetReps: [6, 6, 6],
            actualWeight: 50,
            actualReps: [6, 6, 6],
          },
        ],
      }),
    );
    const currentLogs = exercises.map((name) =>
      makeLog({
        exercises: [
          {
            name,
            targetWeight: 52.5,
            targetReps: [6, 6, 6],
            actualWeight: 52.5,
            actualReps: [6, 6, 6],
          },
        ],
      }),
    );
    const result = await provider.generateSummary("2026-03-30", currentLogs, prevLogs, []);
    expect(result.headline).toBe("Great week — multiple PRs!");
  });

  it("detects volume improvement (reps increase, same weight)", async () => {
    const prevLogs = [
      makeLog({
        exercises: [
          {
            name: "Bench Press",
            targetWeight: 62.5,
            targetReps: [5, 5, 5],
            actualWeight: 62.5,
            actualReps: [5, 5, 5],
          },
        ],
      }),
    ];
    const currentLogs = [
      makeLog({
        exercises: [
          {
            name: "Bench Press",
            targetWeight: 62.5,
            targetReps: [6, 6, 6],
            actualWeight: 62.5,
            actualReps: [6, 6, 6],
          },
        ],
      }),
    ];
    const result = await provider.generateSummary("2026-03-30", currentLogs, prevLogs, []);
    const progressLine = result.lines.find((l) => l.label === "Progress");
    expect(progressLine).toBeDefined();
    expect(progressLine!.detail).toContain("volume");
    expect(progressLine!.detail).toContain("↑");
  });

  it("shows weight trend arrow ↑ for meaningful weight gain", async () => {
    const weights: BodyweightEntry[] = [
      { date: "2026-03-20", weight: 75 },
      { date: "2026-03-27", weight: 75.5 },
    ];
    const result = await provider.generateSummary("2026-03-30", [], [], weights);
    const weightLine = result.lines.find((l) => l.label === "Bodyweight");
    expect(weightLine!.detail).toContain("↑");
  });

  it("shows weight trend arrow ↓ for meaningful weight loss", async () => {
    const weights: BodyweightEntry[] = [
      { date: "2026-03-20", weight: 78 },
      { date: "2026-03-27", weight: 77.5 },
    ];
    const result = await provider.generateSummary("2026-03-30", [], [], weights);
    const weightLine = result.lines.find((l) => l.label === "Bodyweight");
    expect(weightLine!.detail).toContain("↓");
  });

  it("shows weight trend arrow → for negligible weight change", async () => {
    const weights: BodyweightEntry[] = [
      { date: "2026-03-20", weight: 77.9 },
      { date: "2026-03-27", weight: 78 },
    ];
    const result = await provider.generateSummary("2026-03-30", [], [], weights);
    const weightLine = result.lines.find((l) => l.label === "Bodyweight");
    expect(weightLine!.detail).toContain("→");
  });

  it("does not add Bodyweight line for fewer than 2 weight entries", async () => {
    const weights: BodyweightEntry[] = [{ date: "2026-03-27", weight: 77.5 }];
    const result = await provider.generateSummary("2026-03-30", [], [], weights);
    expect(result.lines.find((l) => l.label === "Bodyweight")).toBeUndefined();
  });

  it("includes sessions count in lines", async () => {
    const logs = [makeLog(), makeLog({ day: "wednesday" })];
    const result = await provider.generateSummary("2026-03-30", logs, [], []);
    const sessionsLine = result.lines.find((l) => l.label === "Sessions");
    expect(sessionsLine).toBeDefined();
    expect(sessionsLine!.detail).toContain("2 logged");
    expect(sessionsLine!.detail).toContain("2 exercises");
  });

  it("detects injury from exercise-level notes", async () => {
    const logs = [
      makeLog({
        exercises: [
          {
            name: "Bench Press",
            targetReps: [6, 6, 6],
            notes: "Be careful — shoulder pain",
          },
        ],
      }),
    ];
    const result = await provider.generateSummary("2026-03-30", logs, [], []);
    const watchLine = result.lines.find((l) => l.label === "Watch");
    expect(watchLine).toBeDefined();
    expect(watchLine!.detail).toMatch(/pain|careful/i);
  });

  it("detects injury note containing 'caution'", async () => {
    const logs = [makeLog({ sessionNotes: "Use caution with this movement" })];
    const result = await provider.generateSummary("2026-03-30", logs, [], []);
    const watchLine = result.lines.find((l) => l.label === "Watch");
    expect(watchLine).toBeDefined();
  });

  it("populates the text field from lines", async () => {
    const weights: BodyweightEntry[] = [
      { date: "2026-03-20", weight: 77 },
      { date: "2026-03-27", weight: 77.5 },
    ];
    const result = await provider.generateSummary("2026-03-30", [], [], weights);
    expect(result.text).toBeTruthy();
    expect(result.text).toContain("⚖️");
  });
});

describe("LLMSummaryProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to MockSummaryProvider when LLM call throws", async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error("network error"));
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const llmProvider = new LLMSummaryProvider();
    const result = await llmProvider.generateSummary("2026-03-30", [], [], []);

    // Should return a valid (fallback) summary rather than throwing
    expect(result.weekStart).toBe("2026-03-30");
    expect(result.headline).toBe("Ready to start this week.");
  });

  it("falls back when LLM returns empty content", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const llmProvider = new LLMSummaryProvider();
    const result = await llmProvider.generateSummary("2026-03-30", [], [], []);
    expect(result.weekStart).toBe("2026-03-30");
  });

  it("parses valid LLM JSON response", async () => {
    const llmPayload = {
      headline: "Strong week!",
      lines: [{ icon: "📈", label: "Bench", detail: "Up to 65kg" }],
    };
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(llmPayload) } }],
    });
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const llmProvider = new LLMSummaryProvider();
    const result = await llmProvider.generateSummary("2026-03-30", [], [], []);
    expect(result.headline).toBe("Strong week!");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].label).toBe("Bench");
  });

  it("includes machine max flags in the LLM summary prompt", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ headline: "Strong week!", lines: [] }) } }],
    });
    vi.mocked(getOpenAIClient).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    } as any);

    const llmProvider = new LLMSummaryProvider();
    await llmProvider.generateSummary(
      "2026-03-30",
      [
        makeLog({
          exercises: [
            {
              name: "Machine Seated Row",
              targetWeight: 109,
              machineWeightMaxedOut: true,
              targetReps: [10, 10, 10],
              actualWeight: 109,
              actualReps: [10, 10, 10],
            },
          ],
        }),
      ],
      [],
      [],
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const userPrompt = mockCreate.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain("[MAX MACHINE WEIGHT]");
  });
});
