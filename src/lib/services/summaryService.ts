import type { ExerciseLog, BodyweightEntry, WeeklySummary, SummaryLine } from "$lib/types";
import { getOpenAIClient, getDeploymentName, isLLMConfigured } from "./openaiClient";

/**
 * Summary provider interface — swap this implementation
 * with a real AI provider (Azure OpenAI, etc.) later.
 */
export interface SummaryProvider {
  generateSummary(
    weekStart: string,
    currentLogs: ExerciseLog[],
    previousLogs: ExerciseLog[],
    weightHistory: BodyweightEntry[],
  ): Promise<WeeklySummary>;
}

/**
 * Mock summary provider that generates a template-based summary
 * by scanning recent logs for progress indicators.
 */
export class MockSummaryProvider implements SummaryProvider {
  async generateSummary(
    weekStart: string,
    currentLogs: ExerciseLog[],
    previousLogs: ExerciseLog[],
    weightHistory: BodyweightEntry[],
  ): Promise<WeeklySummary> {
    const lines: SummaryLine[] = [];

    // Sessions completed
    const sessionCount = currentLogs.length;
    const exerciseCount = currentLogs.reduce((sum, l) => sum + l.exercises.length, 0);
    if (sessionCount > 0) {
      lines.push({
        icon: "🏋️",
        label: "Sessions",
        detail: `${sessionCount} logged · ${exerciseCount} exercises`,
      });
    }

    // Weight trend
    const weightLine = buildWeightTrendLine(weightHistory);
    if (weightLine) lines.push(weightLine);

    // Compare exercises between weeks
    const improvements = findImprovements(currentLogs, previousLogs);
    for (const imp of improvements) {
      lines.push({ icon: "📈", label: "Progress", detail: imp });
    }

    // Check for injury notes
    const injuryNotes = findInjuryNotes(currentLogs.concat(previousLogs));
    if (injuryNotes.length > 0) {
      lines.push({ icon: "⚠️", label: "Watch", detail: injuryNotes[0] });
    }

    // Headline
    const headline = buildHeadline(improvements.length, sessionCount);

    // Fallback text for backwards compat
    const text = lines.map((l) => `${l.icon} ${l.detail}`).join(" · ") || headline;

    return { weekStart, text, headline, lines };
  }
}

function buildHeadline(improvementCount: number, sessionCount: number): string {
  if (improvementCount >= 3) return "Great week — multiple PRs!";
  if (sessionCount >= 4) return "Solid consistency this week.";
  if (sessionCount > 0) return "Keep building momentum.";
  return "Ready to start this week.";
}

function buildWeightTrendLine(weightHistory: BodyweightEntry[]): SummaryLine | null {
  if (weightHistory.length < 2) return null;
  const latest = weightHistory.at(-1);
  const prev = weightHistory.at(-2);
  if (!latest || !prev) return null;

  const diff = latest.weight - prev.weight;
  let arrow = "→";
  if (diff > 0.2) arrow = "↑";
  else if (diff < -0.2) arrow = "↓";

  return {
    icon: "⚖️",
    label: "Bodyweight",
    detail: `${latest.weight} kg ${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg`,
  };
}

function findImprovements(current: ExerciseLog[], previous: ExerciseLog[]): string[] {
  const improvements: string[] = [];
  const prevMap = new Map<string, { weight?: number; totalReps: number }>();

  for (const log of previous) {
    for (const ex of log.exercises) {
      const key = `${ex.name}|${log.day}`;
      const totalReps = (ex.actualReps ?? ex.targetReps).reduce((a, b) => a + b, 0);
      prevMap.set(key, { weight: ex.actualWeight ?? ex.targetWeight, totalReps });
    }
  }

  for (const log of current) {
    for (const ex of log.exercises) {
      const key = `${ex.name}|${log.day}`;
      const prev = prevMap.get(key);
      if (!prev) continue;

      const currentWeight = ex.actualWeight ?? ex.targetWeight;
      const currentReps = (ex.actualReps ?? ex.targetReps).reduce((a, b) => a + b, 0);

      if (currentWeight && prev.weight && currentWeight > prev.weight) {
        improvements.push(`${ex.name} weight ↑ ${prev.weight}→${currentWeight} kg`);
      } else if (currentReps > prev.totalReps) {
        improvements.push(`${ex.name} volume ↑ ${prev.totalReps}→${currentReps} reps`);
      }
    }
  }

  return improvements.slice(0, 5); // Cap at 5 highlights
}

function findInjuryNotes(logs: ExerciseLog[]): string[] {
  const notes: string[] = [];
  for (const log of logs) {
    if (log.sessionNotes && /injur|pain|careful|caution/i.test(log.sessionNotes)) {
      notes.push(log.sessionNotes);
    }
    for (const ex of log.exercises) {
      if (ex.notes && /injur|pain|careful|caution/i.test(ex.notes)) {
        notes.push(ex.notes);
      }
    }
  }
  return notes;
}

/** Default singleton — use this in API routes */
export const summaryProvider: SummaryProvider = new MockSummaryProvider();

/**
 * LLM-backed summary provider using Azure OpenAI.
 */
export class LLMSummaryProvider implements SummaryProvider {
  private readonly fallback = new MockSummaryProvider();

  async generateSummary(
    weekStart: string,
    currentLogs: ExerciseLog[],
    previousLogs: ExerciseLog[],
    weightHistory: BodyweightEntry[],
  ): Promise<WeeklySummary> {
    try {
      const client = getOpenAIClient();
      const deployment = getDeploymentName();

      const prompt = this.buildPrompt(weekStart, currentLogs, previousLogs, weightHistory);

      const response = await client.chat.completions.create({
        model: deployment,
        messages: [
          {
            role: "system",
            content: `You are a concise gym coaching assistant. Analyze the training data and return a JSON object with:
- "headline": a short motivational headline (max 8 words)
- "lines": an array of objects with "icon" (single emoji), "label" (1-2 word category), and "detail" (short insight, max 15 words)

Include 2-5 lines covering: session count, bodyweight trend (if data exists), notable progress, and any caution notes.
Return ONLY valid JSON, no markdown fences.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) throw new Error("Empty LLM response");

      const parsed = JSON.parse(content) as { headline: string; lines: SummaryLine[] };
      const text = parsed.lines.map((l) => `${l.icon} ${l.detail}`).join(" · ");

      return { weekStart, text, headline: parsed.headline, lines: parsed.lines };
    } catch (err) {
      console.error("LLM summary failed, falling back to mock:", err);
      return this.fallback.generateSummary(weekStart, currentLogs, previousLogs, weightHistory);
    }
  }

  private buildPrompt(
    weekStart: string,
    currentLogs: ExerciseLog[],
    previousLogs: ExerciseLog[],
    weightHistory: BodyweightEntry[],
  ): string {
    const parts: string[] = [`Week starting: ${weekStart}`];

    if (weightHistory.length > 0) {
      const recent = weightHistory.slice(-4);
      const weightSeries = recent.map((w) => w.date + ": " + w.weight + "kg").join(", ");
      parts.push(`Bodyweight: ${weightSeries}`);
    }

    if (currentLogs.length > 0) {
      parts.push(`\nThis week (${currentLogs.length} sessions):`);
      for (const log of currentLogs) {
        const exSummary = log.exercises
          .map((ex) => {
            const reps = (ex.actualReps ?? ex.targetReps).join(",");
            const w = ex.actualWeight ?? ex.targetWeight;
            const weightText = w ? ` @ ${w}kg` : "";
            const machineFlag = ex.machineWeightMaxedOut ? " [MAX MACHINE WEIGHT]" : "";
            return `${ex.name}: ${reps} reps${weightText}${machineFlag}`;
          })
          .join("; ");
        parts.push(`  ${log.day} (${log.label}): ${exSummary}`);
      }
    } else {
      parts.push("No sessions logged this week yet.");
    }

    if (previousLogs.length > 0) {
      parts.push(`\nLast week (${previousLogs.length} sessions):`);
      for (const log of previousLogs) {
        const exSummary = log.exercises
          .map((ex) => {
            const reps = (ex.actualReps ?? ex.targetReps).join(",");
            const w = ex.actualWeight ?? ex.targetWeight;
            const weightText = w ? ` @ ${w}kg` : "";
            const machineFlag = ex.machineWeightMaxedOut ? " [MAX MACHINE WEIGHT]" : "";
            return `${ex.name}: ${reps} reps${weightText}${machineFlag}`;
          })
          .join("; ");
        parts.push(`  ${log.day} (${log.label}): ${exSummary}`);
      }
    }

    return parts.join("\n");
  }
}

/** LLM-backed singleton — use when Azure OpenAI is configured */
export const llmSummaryProvider: SummaryProvider = new LLMSummaryProvider();

export function getSummaryProvider(): SummaryProvider {
  return isLLMConfigured() ? llmSummaryProvider : summaryProvider;
}

export async function generateHistoryFocusSummary(
  currentWeekStart: string,
  logs: ExerciseLog[],
  weightHistory: BodyweightEntry[],
): Promise<WeeklySummary> {
  const weekLabel = `${currentWeekStart} (covering previous 8 weeks)`;

  if (!isLLMConfigured()) {
    return buildHistoryFallbackSummary(weekLabel, logs, weightHistory);
  }

  try {
    const client = getOpenAIClient();
    const deployment = getDeploymentName();
    const prompt = buildHistoryPrompt(weekLabel, logs, weightHistory);

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        {
          role: "system",
          content: `You are a strength coach analyzing 8 weeks of training history.
Return ONLY valid JSON with this schema:
{ "headline": string, "lines": [{ "icon": string, "label": string, "detail": string }] }

Rules:
- Keep headline <= 10 words.
- Return 3-5 lines total.
- Include at least one progress line and one focus-area line.
- Focus areas should be concrete and actionable.
- Keep each detail <= 20 words.
- Use these icons where appropriate: 📈 progress, 🎯 focus, ⚖️ bodyweight, 🔁 consistency.
- Never invent data that is not present in the prompt.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty LLM response");

    const parsed = JSON.parse(content) as { headline: string; lines: SummaryLine[] };
    const lines = (parsed.lines ?? []).slice(0, 5);
    const text = lines.map((line) => `${line.icon} ${line.detail}`).join(" · ");

    return {
      weekStart: currentWeekStart,
      headline: parsed.headline,
      lines,
      text,
    };
  } catch (err) {
    console.error("LLM history summary failed, using fallback:", err);
    return buildHistoryFallbackSummary(weekLabel, logs, weightHistory);
  }
}

function buildHistoryPrompt(
  weekLabel: string,
  logs: ExerciseLog[],
  weightHistory: BodyweightEntry[],
): string {
  const parts: string[] = [`Analysis window: ${weekLabel}`, `Session logs: ${logs.length}`];

  if (logs.length > 0) {
    const byWeek = new Map<string, number>();
    for (const log of logs) {
      byWeek.set(log.weekStart, (byWeek.get(log.weekStart) ?? 0) + 1);
    }
    parts.push(
      `Sessions by week: ${[...byWeek.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, count]) => `${week}: ${count}`)
        .join(", ")}`,
    );

    const recentLogs = [...logs].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-24);
    parts.push("Recent exercise snapshots:");
    for (const log of recentLogs) {
      const exercises = log.exercises
        .map((ex) => {
          const reps = (ex.actualReps ?? ex.targetReps).join(",");
          const weight = ex.actualWeight ?? ex.targetWeight;
          const weightLabel = weight ? `@ ${weight}kg` : "bodyweight";
          return `${ex.name} ${weightLabel} x ${reps}`;
        })
        .join("; ");
      parts.push(`- ${log.weekStart} ${log.day}: ${exercises}`);
    }
  }

  if (weightHistory.length > 0) {
    const recentWeight = [...weightHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12)
      .map((entry) => `${entry.date}: ${entry.weight}kg`)
      .join(", ");
    parts.push(`Weight trend points: ${recentWeight}`);
  }

  return parts.join("\n");
}

function buildHistoryFallbackSummary(
  weekLabel: string,
  logs: ExerciseLog[],
  weightHistory: BodyweightEntry[],
): WeeklySummary {
  const byWeek = new Map<string, number>();
  const exerciseMentions = new Map<string, number>();

  for (const log of logs) {
    byWeek.set(log.weekStart, (byWeek.get(log.weekStart) ?? 0) + 1);
    for (const ex of log.exercises) {
      exerciseMentions.set(ex.name, (exerciseMentions.get(ex.name) ?? 0) + 1);
    }
  }

  const weekCounts = [...byWeek.values()];
  const avgSessions =
    weekCounts.length > 0
      ? (weekCounts.reduce((sum, count) => sum + count, 0) / weekCounts.length).toFixed(1)
      : "0.0";

  const topExercise = [...exerciseMentions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const lines: SummaryLine[] = [
    {
      icon: "🔁",
      label: "Consistency",
      detail: `${logs.length} sessions logged across the last 8 completed weeks (${avgSessions}/week avg).`,
    },
  ];

  if (topExercise) {
    lines.push({
      icon: "📈",
      label: "Progress",
      detail: `${topExercise} appears most often, suggesting steady progression potential.`,
    });
  }

  if (weightHistory.length >= 2) {
    const sorted = [...weightHistory].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.weight ?? sorted.at(-1)?.weight ?? 0;
    const last = sorted.at(-1)?.weight ?? first;
    const diff = last - first;
    lines.push({
      icon: "⚖️",
      label: "Bodyweight",
      detail: `Bodyweight changed by ${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg over the same period.`,
    });
  }

  lines.push({
    icon: "🎯",
    label: "Focus",
    detail:
      "Prioritize at-risk lifts with repeat misses and keep session frequency steady week to week.",
  });

  const trimmed = lines.slice(0, 5);
  return {
    weekStart: weekLabel,
    headline: "8-week trend and focus review",
    lines: trimmed,
    text: trimmed.map((line) => `${line.icon} ${line.detail}`).join(" · "),
  };
}
