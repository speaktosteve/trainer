import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ExerciseLog } from "$lib/types";

vi.mock("$lib/services/exerciseService", () => ({
  logExercise: vi.fn(),
  getExerciseHistory: vi.fn(),
  deleteExerciseLog: vi.fn(),
  getExerciseLogsForWeek: vi.fn(),
  getLatestSubmittedExerciseTargets: vi.fn(),
}));

import { DELETE, GET, POST } from "../../src/routes/data/exercises/+server";
import {
  logExercise,
  getExerciseHistory,
  deleteExerciseLog,
  getExerciseLogsForWeek,
  getLatestSubmittedExerciseTargets,
} from "$lib/services/exerciseService";

const sampleLog: ExerciseLog = {
  day: "monday",
  label: "Push",
  completedDate: "2026-05-11",
  weekStart: "2026-05-11",
  exercises: [
    {
      name: "Bench Press",
      targetWeight: 80,
      targetReps: [6, 6, 6],
      actualWeight: 80,
      actualReps: [6, 6, 6],
    },
  ],
};

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("/data/exercises route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns latest submitted targets when latestFor is provided", async () => {
    vi.mocked(getLatestSubmittedExerciseTargets).mockResolvedValue({
      targetReps: [5, 5, 5],
      targetWeight: 82.5,
    });

    const request = new Request("http://localhost/data/exercises?latestFor=Bench%20Press");
    const response = await GET({ url: new URL(request.url) } as any);
    const payload = await parseJson<{ targetReps: number[]; targetWeight?: number }>(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ targetReps: [5, 5, 5], targetWeight: 82.5 });
    expect(getLatestSubmittedExerciseTargets).toHaveBeenCalledWith("Bench Press");
    expect(getExerciseLogsForWeek).not.toHaveBeenCalled();
  });

  it("GET returns week logs when weekStart is provided", async () => {
    vi.mocked(getExerciseLogsForWeek).mockResolvedValue([sampleLog]);

    const request = new Request("http://localhost/data/exercises?weekStart=2026-05-11");
    const response = await GET({ url: new URL(request.url) } as any);
    const payload = await parseJson<ExerciseLog[]>(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual([sampleLog]);
    expect(getExerciseLogsForWeek).toHaveBeenCalledWith("2026-05-11");
    expect(getExerciseHistory).not.toHaveBeenCalled();
  });

  it("GET returns date-filtered history when no specialized query is provided", async () => {
    vi.mocked(getExerciseHistory).mockResolvedValue([sampleLog]);

    const request = new Request("http://localhost/data/exercises?from=2026-05-01&to=2026-05-12&limit=50");
    const response = await GET({ url: new URL(request.url) } as any);
    const payload = await parseJson<ExerciseLog[]>(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual([sampleLog]);
    expect(getExerciseHistory).toHaveBeenCalledWith({
      fromDate: "2026-05-01",
      toDate: "2026-05-12",
      limit: 50,
    });
  });

  it("POST returns 400 when required fields are missing", async () => {
    const request = new Request("http://localhost/data/exercises", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ day: "monday" }),
    });

    const response = await POST({ request } as any);
    const payload = await parseJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: "Invalid log: completedDate, day, and exercises are required",
    });
    expect(logExercise).not.toHaveBeenCalled();
  });

  it("DELETE returns 400 when query params are missing", async () => {
    const request = new Request("http://localhost/data/exercises?weekStart=2026-05-11", {
      method: "DELETE",
    });

    const response = await DELETE({ url: new URL(request.url) } as any);
    const payload = await parseJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "weekStart, day, and name query params are required" });
    expect(deleteExerciseLog).not.toHaveBeenCalled();
  });
});
