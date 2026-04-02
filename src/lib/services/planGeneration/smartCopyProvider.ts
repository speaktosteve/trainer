import type { ExerciseEntry, ExerciseLog, PlannedSession, WeeklyPlan } from "$lib/types";
import {
  buildLegacyExerciseKey,
  buildPerformanceMap,
  didMeetSetTargets,
  getNextWeekStart,
  incrementRepsUpToMax,
} from "./common";
import type { ExercisePerformance } from "./common";
import type { PlanGenerationProvider } from "./provider";

/**
 * Smart copy provider — copies the current plan forward and applies
 * simple progressive overload rules based on completed performance.
 */
export class SmartCopyProvider implements PlanGenerationProvider {
  async generateNextPlan(
    currentPlan: WeeklyPlan,
    completedLogs: ExerciseLog[],
    _previousLogs: ExerciseLog[],
  ): Promise<WeeklyPlan> {
    const nextMonday = getNextWeekStart(currentPlan.weekStart);

    // Build a lookup of actual performance this week
    const performanceMap = buildPerformanceMap(completedLogs);

    const sessions: PlannedSession[] = currentPlan.sessions.map((session) => ({
      day: session.day,
      label: session.label,
      sessionNotes: session.sessionNotes,
      exercises: session.exercises.map((ex) => {
        const key = buildLegacyExerciseKey(session.day, ex.name);
        const actual = performanceMap.get(key);
        return progressExercise(ex, actual);
      }),
    }));

    return { weekStart: nextMonday, sessions };
  }
}

/**
 * Apply simple progressive overload rules:
 * - If all target reps were hit: bump weight by smallest increment
 * - If reps fell short: keep same weight, maybe note it
 * - Bodyweight exercises: try to add a rep to the weakest set
 */
function progressExercise(
  plan: ExerciseEntry,
  actual: ExercisePerformance | undefined,
): ExerciseEntry {
  // No completion data — carry forward as-is
  if (!actual) {
    return {
      exerciseId: plan.exerciseId,
      name: plan.name,
      targetWeight: plan.targetWeight,
      machineWeightMaxedOut: plan.machineWeightMaxedOut,
      targetReps: [...plan.targetReps],
      notes: plan.notes,
    };
  }

  const hitAllReps = didMeetSetTargets(plan.targetReps, actual.reps);

  // Bodyweight exercise (no target weight)
  if (plan.targetWeight === undefined) {
    if (hitAllReps) {
      // Try adding 1 rep to the lowest set
      const newReps = [...actual.reps];
      const minIdx = newReps.indexOf(Math.min(...newReps));
      newReps[minIdx] += 1;
      return {
        exerciseId: plan.exerciseId,
        name: plan.name,
        machineWeightMaxedOut: plan.machineWeightMaxedOut,
        targetReps: newReps,
      };
    }

    // Retry same target
    return {
      exerciseId: plan.exerciseId,
      name: plan.name,
      machineWeightMaxedOut: plan.machineWeightMaxedOut,
      targetReps: [...plan.targetReps],
    };
  }

  // Weighted exercise
  if (hitAllReps) {
    if (plan.machineWeightMaxedOut) {
      const progressedReps = incrementRepsUpToMax(plan.targetReps, 15);
      return {
        exerciseId: plan.exerciseId,
        name: plan.name,
        targetWeight: plan.targetWeight,
        machineWeightMaxedOut: true,
        targetReps: progressedReps,
        notes: "Machine already at max weight",
      };
    }

    const increment = plan.targetWeight < 20 ? 1 : 2.5;
    return {
      exerciseId: plan.exerciseId,
      name: plan.name,
      targetWeight: plan.targetWeight + increment,
      machineWeightMaxedOut: plan.machineWeightMaxedOut,
      targetReps: [...plan.targetReps],
      notes: `Progressed from ${plan.targetWeight} kg`,
    };
  }

  // Didn't hit target — keep same weight
  return {
    exerciseId: plan.exerciseId,
    name: plan.name,
    targetWeight: plan.targetWeight,
    machineWeightMaxedOut: plan.machineWeightMaxedOut,
    targetReps: [...plan.targetReps],
    notes:
      actual.reps.length > 0 ? `Retry — last week hit ${actual.reps.join(", ")} reps` : plan.notes,
  };
}
