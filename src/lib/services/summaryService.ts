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
    if (weightHistory.length >= 2) {
      const latest = weightHistory[weightHistory.length - 1];
      const prev = weightHistory[weightHistory.length - 2];
      const diff = latest.weight - prev.weight;
      const arrow = diff > 0.2 ? "↑" : diff < -0.2 ? "↓" : "→";
      lines.push({
        icon: "⚖️",
        label: "Bodyweight",
        detail: `${latest.weight} kg ${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg`,
      });
    }

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
    let headline: string;
    if (improvements.length >= 3) {
      headline = "Great week — multiple PRs!";
    } else if (sessionCount >= 4) {
      headline = "Solid consistency this week.";
    } else if (sessionCount > 0) {
      headline = "Keep building momentum.";
    } else {
      headline = "Ready to start this week.";
    }

    // Fallback text for backwards compat
    const text = lines.map((l) => `${l.icon} ${l.detail}`).join(" · ") || headline;

    return { weekStart, text, headline, lines };
  }
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
  private fallback = new MockSummaryProvider();

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
      parts.push(`Bodyweight: ${recent.map((w) => `${w.date}: ${w.weight}kg`).join(", ")}`);
    }

    if (currentLogs.length > 0) {
      parts.push(`\nThis week (${currentLogs.length} sessions):`);
      for (const log of currentLogs) {
        const exSummary = log.exercises
          .map((ex) => {
            const reps = (ex.actualReps ?? ex.targetReps).join(",");
            const w = ex.actualWeight ?? ex.targetWeight;
            return `${ex.name}: ${reps} reps${w ? ` @ ${w}kg` : ""}`;
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
            return `${ex.name}: ${reps} reps${w ? ` @ ${w}kg` : ""}`;
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
