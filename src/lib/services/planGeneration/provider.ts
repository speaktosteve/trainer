import type { ExerciseLog, WeeklyPlan } from "$lib/types";

/**
 * Plan generation provider interface.
 */
export interface PlanGenerationProvider {
  generateNextPlan(
    currentPlan: WeeklyPlan,
    completedLogs: ExerciseLog[],
    previousLogs: ExerciseLog[],
  ): Promise<WeeklyPlan>;
}
