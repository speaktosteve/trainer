import type { ExerciseEntry } from "$lib/types";

export type ExerciseDefaults = Pick<ExerciseEntry, "targetReps" | "targetWeight">;

export async function fetchLatestSubmittedExerciseDefaults(
  exerciseName: string,
): Promise<ExerciseDefaults | null> {
  const trimmed = exerciseName.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({ latestFor: trimmed });
  const res = await fetch(`/data/exercises?${params.toString()}`);
  if (!res.ok) return null;

  const payload = (await res.json()) as Partial<ExerciseDefaults> | null;
  if (!payload || !Array.isArray(payload.targetReps)) {
    return null;
  }

  const targetReps = payload.targetReps
    .map(Number)
    .filter((rep) => Number.isFinite(rep) && rep > 0)
    .map((rep) => Math.floor(rep));
  if (targetReps.length === 0) {
    return null;
  }

  const targetWeight =
    typeof payload.targetWeight === "number" && Number.isFinite(payload.targetWeight)
      ? payload.targetWeight
      : undefined;

  return { targetReps, targetWeight };
}
