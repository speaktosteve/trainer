import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getExerciseHistory,
  getExerciseLogsForWeek,
  getWeightHistory,
} from "$lib/services/exerciseService";
import { generateHistoryFocusSummary } from "$lib/services/summaryService";
import { getHistorySummary, saveHistorySummary } from "$lib/services/historySummaryService";
import { getWeekStart } from "$lib/utils/dates";

function shiftDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export const GET: RequestHandler = async () => {
  const currentWeekStart = getWeekStart();

  const existing = await getHistorySummary(currentWeekStart);
  if (existing) {
    return json(existing);
  }

  const lastCompletedWeekStart = shiftDays(currentWeekStart, -7);
  const lastCompletedWeekLogs = await getExerciseLogsForWeek(lastCompletedWeekStart);

  if (lastCompletedWeekLogs.length === 0) {
    return json(null);
  }

  const periodStart = shiftDays(lastCompletedWeekStart, -49);
  const periodEnd = shiftDays(lastCompletedWeekStart, 6);

  const [logs, weightHistory] = await Promise.all([
    getExerciseHistory({ fromDate: periodStart, toDate: periodEnd, limit: 800 }),
    getWeightHistory({ fromDate: periodStart, toDate: periodEnd }),
  ]);

  const summary = await generateHistoryFocusSummary(currentWeekStart, logs, weightHistory);
  await saveHistorySummary(currentWeekStart, summary);

  return json(summary);
};
