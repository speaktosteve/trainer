import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { summaryProvider, llmSummaryProvider } from "$lib/services/summaryService";
import { isLLMConfigured } from "$lib/services/openaiClient";
import { getExerciseLogsForWeek } from "$lib/services/exerciseService";
import { getWeightHistory } from "$lib/services/exerciseService";
import { getWeekStart } from "$lib/utils/dates";

export const GET: RequestHandler = async ({ url }) => {
  const weekStart = url.searchParams.get("week") ?? getWeekStart();

  // Get current and previous week's logs
  const currentLogs = await getExerciseLogsForWeek(weekStart);

  // Calculate previous week start (subtract 7 days)
  const prevDate = new Date(weekStart);
  prevDate.setDate(prevDate.getDate() - 7);
  const prevWeekStart = prevDate.toISOString().slice(0, 10);
  const previousLogs = await getExerciseLogsForWeek(prevWeekStart);

  const weightHistory = await getWeightHistory();

  const provider = isLLMConfigured() ? llmSummaryProvider : summaryProvider;
  const summary = await provider.generateSummary(
    weekStart,
    currentLogs,
    previousLogs,
    weightHistory,
  );

  return json(summary);
};
