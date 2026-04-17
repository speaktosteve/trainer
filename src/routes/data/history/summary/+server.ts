import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getExerciseHistory, getWeightHistory } from "$lib/services/exerciseService";
import { generateHistoryFocusSummary } from "$lib/services/summaryService";
import {
  getHistorySummary,
  saveHistorySummaryWithSignature,
} from "$lib/services/historySummaryService";
import { getWeekStart } from "$lib/utils/dates";

function shiftDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const GET: RequestHandler = async () => {
  const currentWeekStart = getWeekStart();

  const periodStart = shiftDays(currentWeekStart, -49);
  const periodEnd = shiftDays(currentWeekStart, 6);

  const [logs, weightHistory] = await Promise.all([
    getExerciseHistory({ fromDate: periodStart, toDate: periodEnd, limit: 800 }),
    getWeightHistory({ fromDate: periodStart, toDate: periodEnd }),
  ]);

  if (logs.length === 0) {
    return json(null);
  }

  const signature = buildHistorySignature(logs);

  const existing = await getHistorySummary(currentWeekStart);
  if (existing?.signature === signature) {
    return json(existing.summary);
  }

  const summary = await generateHistoryFocusSummary(currentWeekStart, logs, weightHistory);
  await saveHistorySummaryWithSignature(currentWeekStart, summary, signature);

  return json(summary);
};

function buildHistorySignature(logs: Awaited<ReturnType<typeof getExerciseHistory>>): string {
  return logs
    .map((log) => {
      const exercises = log.exercises
        .map(
          (exercise) =>
            `${exercise.name}:${(exercise.actualReps ?? exercise.targetReps).join("-")}`,
        )
        .join("|");
      return `${log.weekStart}:${log.day}:${log.completedDate}:${exercises}`;
    })
    .sort()
    .join(";");
}
