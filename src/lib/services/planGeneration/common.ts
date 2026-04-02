import type { ExerciseLog } from "$lib/types";

export type ExercisePerformance = {
  weight?: number;
  reps: number[];
};

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase();
}

export function buildLegacyExerciseKey(day: string, name: string): string {
  return `${day.toLowerCase()}|${normalizeExerciseName(name)}`;
}

export function didMeetSetTargets(targetReps: number[], actualReps: number[]): boolean {
  if (targetReps.length === 0) return true;

  for (let i = 0; i < targetReps.length; i += 1) {
    if ((actualReps[i] ?? -1) < targetReps[i]) {
      return false;
    }
  }

  return true;
}

export function incrementRepsUpToMax(targetReps: number[], maxRep: number): number[] {
  const nextReps = [...targetReps];
  const candidateIndices = nextReps
    .map((rep, index) => ({ rep, index }))
    .filter(({ rep }) => rep < maxRep);

  if (candidateIndices.length === 0) return nextReps;

  const lowestRep = Math.min(...candidateIndices.map(({ rep }) => rep));
  const targetIndex = candidateIndices.find(({ rep }) => rep === lowestRep)?.index;

  if (targetIndex === undefined) return nextReps;

  nextReps[targetIndex] += 1;
  return nextReps;
}

export function buildPerformanceMap(logs: ExerciseLog[]): Map<string, ExercisePerformance> {
  const map = new Map<string, ExercisePerformance>();
  for (const log of logs) {
    for (const ex of log.exercises) {
      if (ex.actualReps) {
        const key = buildLegacyExerciseKey(log.day, ex.name);
        map.set(key, {
          weight: ex.actualWeight,
          reps: [...ex.actualReps],
        });
      }
    }
  }
  return map;
}

export function getNextWeekStart(currentWeekStart: string): string {
  const date = new Date(currentWeekStart);
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}
