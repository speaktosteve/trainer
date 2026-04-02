import type { ExerciseEntry, ExerciseLog, WeeklyPlan } from "$lib/types";
import { getDeploymentName, getOpenAIClient } from "../openaiClient";
import {
  buildLegacyExerciseKey,
  buildPerformanceMap,
  didMeetSetTargets,
  getNextWeekStart,
  incrementRepsUpToMax,
  normalizeExerciseName,
} from "./common";
import type { PlanGenerationProvider } from "./provider";

type SourceExerciseRef = {
  day: string;
  exercise: ExerciseEntry;
};

type ExerciseSnapshot = {
  targetWeight?: number;
  targetReps: number[];
  notes?: string;
};

/**
 * LLM-backed plan generation provider using Azure OpenAI.
 * Falls back to SmartCopyProvider on error.
 */
export class LLMPlanProvider implements PlanGenerationProvider {
  async generateNextPlan(
    currentPlan: WeeklyPlan,
    completedLogs: ExerciseLog[],
    previousLogs: ExerciseLog[],
  ): Promise<WeeklyPlan> {
    try {
      const client = getOpenAIClient();
      const deployment = getDeploymentName();
      const sourcePlan = this.withExerciseIds(currentPlan);

      const nextWeekStart = getNextWeekStart(sourcePlan.weekStart);
      const prompt = this.buildPrompt(sourcePlan, completedLogs, previousLogs);

      const response = await client.chat.completions.create({
        model: deployment,
        messages: [
          {
            role: "system",
            content: `You are an expert strength & conditioning coach. Given the current training plan and recent performance data, generate next week's plan with intelligent progressive overload.

Rules:
- If the lifter hit all target reps, suggest a sensible progression for next week.
- If they missed reps, keep progression conservative (hold load and/or adjust reps) and add a brief rationale.
- For bodyweight exercises, add 1 rep to the weakest set if all reps were hit.
- Keep the same session structure (days, labels) unless there's a clear reason to change.
- Add brief "notes" on exercises where you made a change, explaining why.
- If no record: targetWeight/reps = UNCHANGED, note = "No record last week".
- If machine maxed: Weight = UNCHANGED, Reps +1 (cap 15), note = "Machine already at max weight".

Enforcement note:
- The application will enforce exact progression math and hard constraints after you respond.
- Your primary job is coherent plan direction plus an accurate summary of key lifts based on the session values you return.
- Do not rely on strict numeric progression formulas in your reasoning; prioritize consistency between sessions and summary.

Return ONLY valid JSON (no markdown fences) with this compact schema:
{ "weekStart": "YYYY-MM-DD", "sessions": [{ "day": string, "label": string, "exercises": [{ "exerciseId"?: string, "name": string, "targetWeight"?: number, "targetReps": number[], "notes"?: string, "machineWeightMaxedOut"?: boolean }] }], "summary": { "headline": string, "lines": [{ "icon": string, "label": string, "detail": string }] } }

Summary rules:
- "headline": a single punchy coaching sentence (max 8 words) capturing the week's theme.
- "lines": 3-5 lines focused on KEY CHANGES to major compound lifts (bench, squat, deadlift, overhead press, rows). Use 📈 for progressions, 🔒 for consolidation, ⚠️ for caution. Include the specific weight or rep change. Add one line for session structure.
- Do NOT list every exercise — only the headline changes and goals.
- CRITICAL: Only reference data actually provided. If no sessions were completed, do NOT claim reps were hit. Base the summary only on the plan and actual performance data given.
- If no completion data exists, the summary should reflect that the plan is carried forward unchanged or describe the planned structure.
- Keep summary claims consistent with the session values you return. Do not claim a larger numeric jump than shown in sessions.
For bodyweight exercises, omit "targetWeight". Always include "name" and "targetReps".`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) throw new Error("Empty LLM response");

      const parsed = JSON.parse(content) as WeeklyPlan;
      // Ensure the weekStart is correct regardless of what the LLM returns
      parsed.weekStart = nextWeekStart;
      // Ensure summary has required text field
      if (parsed.summary) {
        parsed.summary.weekStart = nextWeekStart;
        parsed.summary.text =
          parsed.summary.lines?.map((l) => `${l.icon} ${l.detail}`).join(" · ") ??
          parsed.summary.headline;
      }
      // Carry forward targetWeight from source plan if the LLM dropped it
      this.backfillWeights(parsed, sourcePlan);
      this.backfillMachineFlags(parsed, sourcePlan);
      this.backfillExerciseIds(parsed, sourcePlan);
      const corrections = this.enforceGeneratedConstraints(parsed, sourcePlan, completedLogs);
      this.applySummaryCorrections(parsed, corrections);
      return parsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown LLM error";
      console.error("LLM plan generation failed:", message);
      throw new Error(`LLM plan generation failed: ${message}`);
    }
  }

  /** If the LLM omitted targetWeight for an exercise that had one in the source plan, restore it. */
  private backfillWeights(generated: WeeklyPlan, source: WeeklyPlan): void {
    const sourceLookups = this.buildSourceLookups(source);
    for (const session of generated.sessions) {
      for (const ex of session.exercises) {
        const sourceRef = this.resolveSourceExercise(ex, session.day, sourceLookups);
        if (ex.targetWeight === undefined && sourceRef?.exercise.targetWeight !== undefined) {
          ex.targetWeight = sourceRef.exercise.targetWeight;
        }
      }
    }
  }

  private backfillMachineFlags(generated: WeeklyPlan, source: WeeklyPlan): void {
    const sourceLookups = this.buildSourceLookups(source);
    for (const session of generated.sessions) {
      for (const ex of session.exercises) {
        const sourceRef = this.resolveSourceExercise(ex, session.day, sourceLookups);
        if (
          ex.machineWeightMaxedOut === undefined &&
          sourceRef?.exercise.machineWeightMaxedOut !== undefined
        ) {
          ex.machineWeightMaxedOut = sourceRef.exercise.machineWeightMaxedOut;
        }
      }
    }
  }

  private backfillExerciseIds(generated: WeeklyPlan, source: WeeklyPlan): void {
    const sourceLookups = this.buildSourceLookups(source);
    for (const session of generated.sessions) {
      for (const ex of session.exercises) {
        const sourceRef = this.resolveSourceExercise(ex, session.day, sourceLookups);
        if (!ex.exerciseId && sourceRef?.exercise.exerciseId) {
          ex.exerciseId = sourceRef.exercise.exerciseId;
        }
      }
    }
  }

  private enforceGeneratedConstraints(
    generated: WeeklyPlan,
    source: WeeklyPlan,
    completedLogs: ExerciseLog[],
  ): string[] {
    const corrections: string[] = [];
    const sourceLookups = this.buildSourceLookups(source);
    const completionLookups = this.buildCompletionLookups(completedLogs);
    const performanceLookups = this.buildPerformanceLookups(completedLogs);

    for (const session of generated.sessions) {
      for (const ex of session.exercises) {
        const before = this.snapshotExercise(ex);
        const sourceRef = this.resolveSourceExercise(ex, session.day, sourceLookups);
        if (!sourceRef) continue;

        if (!this.hasCompletion(sourceRef, completionLookups)) {
          this.applyNoRecordConstraint(ex, sourceRef.exercise);
        }

        this.applyMachineMaxConstraint(
          ex,
          sourceRef.exercise,
          this.resolvePerformance(sourceRef, performanceLookups),
        );

        const correction = this.describeCorrection(ex, before);
        if (correction) {
          corrections.push(correction);
        }
      }
    }

    return corrections;
  }

  private snapshotExercise(exercise: ExerciseEntry): ExerciseSnapshot {
    return {
      targetWeight: exercise.targetWeight,
      targetReps: [...exercise.targetReps],
      notes: exercise.notes,
    };
  }

  private describeCorrection(after: ExerciseEntry, before: ExerciseSnapshot): string | null {
    if (before.targetWeight !== after.targetWeight) {
      const beforeWeight = before.targetWeight ?? "bodyweight";
      const afterWeight = after.targetWeight ?? "bodyweight";
      return `${after.name}: weight ${beforeWeight}→${afterWeight}`;
    }

    if (!this.areRepsEqual(before.targetReps, after.targetReps)) {
      return `${after.name}: reps adjusted to ${after.targetReps.join("/")}`;
    }

    if (before.notes !== after.notes) {
      return `${after.name}: note aligned with enforced constraints`;
    }

    return null;
  }

  private areRepsEqual(left: number[], right: number[]): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  private applySummaryCorrections(plan: WeeklyPlan, corrections: string[]): void {
    if (corrections.length === 0) return;

    const summary = plan.summary ?? {
      weekStart: plan.weekStart,
      text: "",
      headline: "Progression constraints applied",
      lines: [],
    };

    const detail =
      corrections.length === 1
        ? corrections[0]
        : `${corrections.length} exercises auto-corrected to enforced progression rules`;

    summary.lines = [
      ...summary.lines,
      {
        icon: "🔒",
        label: "Auto-correct",
        detail,
      },
    ];
    summary.text = summary.lines.map((line) => `${line.icon} ${line.detail}`).join(" · ");
    summary.weekStart = plan.weekStart;
    plan.summary = summary;
  }

  private withExerciseIds(plan: WeeklyPlan): WeeklyPlan {
    return {
      ...plan,
      sessions: plan.sessions.map((session) => ({
        ...session,
        exercises: session.exercises.map((exercise, index) => ({
          ...exercise,
          exerciseId:
            exercise.exerciseId ?? this.deriveExerciseId(session.day, exercise.name, index),
        })),
      })),
    };
  }

  private deriveExerciseId(day: string, name: string, index: number): string {
    return `${day.toLowerCase()}:${index}:${normalizeExerciseName(name)}`;
  }

  private buildSourceLookups(source: WeeklyPlan): {
    byId: Map<string, SourceExerciseRef>;
    byLegacy: Map<string, SourceExerciseRef>;
    byName: Map<string, SourceExerciseRef[]>;
  } {
    const byId = new Map<string, SourceExerciseRef>();
    const byLegacy = new Map<string, SourceExerciseRef>();
    const byName = new Map<string, SourceExerciseRef[]>();

    for (const session of source.sessions) {
      for (const ex of session.exercises) {
        const ref: SourceExerciseRef = { day: session.day, exercise: ex };
        byLegacy.set(buildLegacyExerciseKey(session.day, ex.name), ref);
        if (ex.exerciseId) {
          byId.set(ex.exerciseId, ref);
        }

        const nameKey = normalizeExerciseName(ex.name);
        const refs = byName.get(nameKey) ?? [];
        refs.push(ref);
        byName.set(nameKey, refs);
      }
    }

    return { byId, byLegacy, byName };
  }

  private resolveSourceExercise(
    generatedExercise: ExerciseEntry,
    generatedDay: string,
    lookups: {
      byId: Map<string, SourceExerciseRef>;
      byLegacy: Map<string, SourceExerciseRef>;
      byName: Map<string, SourceExerciseRef[]>;
    },
  ): SourceExerciseRef | undefined {
    if (generatedExercise.exerciseId && lookups.byId.has(generatedExercise.exerciseId)) {
      return lookups.byId.get(generatedExercise.exerciseId);
    }

    const legacyMatch = lookups.byLegacy.get(
      buildLegacyExerciseKey(generatedDay, generatedExercise.name),
    );
    if (legacyMatch) {
      return legacyMatch;
    }

    const nameMatches = lookups.byName.get(normalizeExerciseName(generatedExercise.name));
    if ((nameMatches?.length ?? 0) === 1) {
      return nameMatches?.[0];
    }

    return undefined;
  }

  private buildCompletionLookups(completedLogs: ExerciseLog[]): {
    byId: Set<string>;
    byLegacy: Set<string>;
  } {
    const byId = new Set<string>();
    const byLegacy = new Set<string>();

    for (const log of completedLogs) {
      for (const ex of log.exercises) {
        if ((ex.actualReps?.length ?? 0) > 0) {
          byLegacy.add(buildLegacyExerciseKey(log.day, ex.name));
          if (ex.exerciseId) {
            byId.add(ex.exerciseId);
          }
        }
      }
    }

    return { byId, byLegacy };
  }

  private buildPerformanceLookups(completedLogs: ExerciseLog[]): {
    byId: Map<string, { weight?: number; reps: number[] }>;
    byLegacy: Map<string, { weight?: number; reps: number[] }>;
  } {
    const byId = new Map<string, { weight?: number; reps: number[] }>();
    const byLegacy = buildPerformanceMap(completedLogs);

    for (const log of completedLogs) {
      for (const ex of log.exercises) {
        if (ex.exerciseId && ex.actualReps) {
          byId.set(ex.exerciseId, { weight: ex.actualWeight, reps: [...ex.actualReps] });
        }
      }
    }

    return { byId, byLegacy };
  }

  private hasCompletion(
    sourceRef: SourceExerciseRef,
    lookups: { byId: Set<string>; byLegacy: Set<string> },
  ): boolean {
    if (sourceRef.exercise.exerciseId && lookups.byId.has(sourceRef.exercise.exerciseId)) {
      return true;
    }

    return lookups.byLegacy.has(buildLegacyExerciseKey(sourceRef.day, sourceRef.exercise.name));
  }

  private resolvePerformance(
    sourceRef: SourceExerciseRef,
    lookups: {
      byId: Map<string, { weight?: number; reps: number[] }>;
      byLegacy: Map<string, { weight?: number; reps: number[] }>;
    },
  ): { weight?: number; reps: number[] } | undefined {
    if (sourceRef.exercise.exerciseId && lookups.byId.has(sourceRef.exercise.exerciseId)) {
      return lookups.byId.get(sourceRef.exercise.exerciseId);
    }

    return lookups.byLegacy.get(buildLegacyExerciseKey(sourceRef.day, sourceRef.exercise.name));
  }

  private applyNoRecordConstraint(target: ExerciseEntry, sourceExercise: ExerciseEntry): void {
    target.exerciseId = sourceExercise.exerciseId;
    target.targetReps = [...sourceExercise.targetReps];
    target.targetWeight = sourceExercise.targetWeight;
    target.notes = "No record last week";
  }

  private applyMachineMaxConstraint(
    target: ExerciseEntry,
    sourceExercise: ExerciseEntry,
    performance: { weight?: number; reps: number[] } | undefined,
  ): void {
    if (!sourceExercise.machineWeightMaxedOut || sourceExercise.targetWeight === undefined) {
      return;
    }

    const hitAllReps =
      performance !== undefined && didMeetSetTargets(sourceExercise.targetReps, performance.reps);

    if (target.targetWeight === undefined || target.targetWeight > sourceExercise.targetWeight) {
      target.targetWeight = sourceExercise.targetWeight;
    }

    if (hitAllReps) {
      target.targetReps = incrementRepsUpToMax(sourceExercise.targetReps, 15);
    }

    target.machineWeightMaxedOut = true;
    target.notes =
      target.notes === "No record last week"
        ? "Machine already at max weight; No record last week"
        : "Machine already at max weight";
  }

  private buildPrompt(
    currentPlan: WeeklyPlan,
    completedLogs: ExerciseLog[],
    previousLogs: ExerciseLog[],
  ): string {
    const parts: string[] = [];

    parts.push(`Current plan (week of ${currentPlan.weekStart}):`);
    for (const session of currentPlan.sessions) {
      const exercises = session.exercises
        .map((ex) => {
          const idText = ex.exerciseId ? ` [id:${ex.exerciseId}]` : "";
          const w = ex.targetWeight ? ` @ ${ex.targetWeight}kg` : "";
          const machineFlag = ex.machineWeightMaxedOut ? " [MAX MACHINE WEIGHT]" : "";
          return `${ex.name}${idText}: ${ex.targetReps.join(",")} reps${w}${machineFlag}`;
        })
        .join("; ");
      parts.push(`  ${session.day} (${session.label}): ${exercises}`);
    }

    if (completedLogs.length > 0) {
      parts.push(`\nActual performance this week (${completedLogs.length} sessions):`);
      for (const log of completedLogs) {
        const exercises = log.exercises
          .map((ex) => {
            const idText = ex.exerciseId ? ` [id:${ex.exerciseId}]` : "";
            const reps = (ex.actualReps ?? ex.targetReps).join(",");
            const w = ex.actualWeight ?? ex.targetWeight;
            const weightText = w ? ` @ ${w}kg` : "";
            const machineFlag = ex.machineWeightMaxedOut ? " [MAX MACHINE WEIGHT]" : "";
            const notesText = ex.notes ? ` (${ex.notes})` : "";
            return `${ex.name}${idText}: ${reps} reps${weightText}${machineFlag}${notesText}`;
          })
          .join("; ");
        parts.push(`  ${log.day} (${log.label}): ${exercises}`);
      }
    } else {
      parts.push(
        "\nNo sessions completed this week. No performance data is available — do not reference any results.",
      );
    }

    if (previousLogs.length > 0) {
      parts.push(`\nPrevious week performance (${previousLogs.length} sessions):`);
      for (const log of previousLogs) {
        const exercises = log.exercises
          .map((ex) => {
            const idText = ex.exerciseId ? ` [id:${ex.exerciseId}]` : "";
            const reps = (ex.actualReps ?? ex.targetReps).join(",");
            const w = ex.actualWeight ?? ex.targetWeight;
            const weightText = w ? ` @ ${w}kg` : "";
            const machineFlag = ex.machineWeightMaxedOut ? " [MAX MACHINE WEIGHT]" : "";
            return `${ex.name}${idText}: ${reps} reps${weightText}${machineFlag}`;
          })
          .join("; ");
        parts.push(`  ${log.day} (${log.label}): ${exercises}`);
      }
    }

    return parts.join("\n");
  }
}
