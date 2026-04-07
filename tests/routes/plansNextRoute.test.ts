import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { WeeklyPlan } from "$lib/types";

vi.mock("$lib/services/planService", () => ({
  deletePendingNextPlan: vi.fn(),
  getPendingNextPlan: vi.fn(),
  getPlan: vi.fn(),
  savePendingNextPlan: vi.fn(),
  savePlan: vi.fn(),
}));

vi.mock("$lib/services/exerciseService", () => ({
  getExerciseLogsForWeek: vi.fn(),
}));

vi.mock("$lib/services/planGenerationService", () => ({
  getPlanGenerator: vi.fn(),
}));

vi.mock("$lib/utils/dates", async () => {
  const actual = await vi.importActual<typeof import("$lib/utils/dates")>("$lib/utils/dates");
  return {
    ...actual,
    getWeekStart: vi.fn(() => "2026-03-30"),
  };
});

import { DELETE, GET, POST } from "../../src/routes/data/plans/next/+server";
import {
  deletePendingNextPlan,
  getPendingNextPlan,
  getPlan,
  savePendingNextPlan,
  savePlan,
} from "$lib/services/planService";
import { getExerciseLogsForWeek } from "$lib/services/exerciseService";
import { getPlanGenerator } from "$lib/services/planGenerationService";

const sourcePlan: WeeklyPlan = {
  weekStart: "2026-03-30",
  sessions: [
    {
      day: "monday",
      label: "Push",
      exercises: [{ name: "Bench Press", targetWeight: 62.5, targetReps: [6, 6, 6, 6] }],
    },
  ],
};

const nextPlan: WeeklyPlan = {
  weekStart: "2026-04-06",
  sessions: [
    {
      day: "monday",
      label: "Push",
      exercises: [{ name: "Bench Press", targetWeight: 65, targetReps: [6, 6, 6, 6] }],
    },
  ],
};

async function parseResponse(response: Response) {
  return (await response.json()) as WeeklyPlan | { error: string; plan?: WeeklyPlan } | null;
}

describe("/data/plans/next route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns the pending next plan for the source week", async () => {
    vi.mocked(getPendingNextPlan).mockResolvedValue(nextPlan);

    const request = new Request("http://localhost/data/plans/next?sourceWeek=2026-03-30");
    const response = await GET({ url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual(nextPlan);
    expect(getPendingNextPlan).toHaveBeenCalledWith("2026-03-30");
  });

  it("DELETE removes the pending next plan for the source week", async () => {
    const request = new Request("http://localhost/data/plans/next?sourceWeek=2026-03-30", {
      method: "DELETE",
    });

    const response = await DELETE({ url: new URL(request.url) } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(deletePendingNextPlan).toHaveBeenCalledWith("2026-03-30");
  });

  it("POST returns the persisted pending plan when one already exists", async () => {
    vi.mocked(getPlan).mockResolvedValue(sourcePlan);
    vi.mocked(getPendingNextPlan).mockResolvedValue(nextPlan);

    const request = new Request("http://localhost/data/plans/next", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceWeek: "2026-03-30" }),
    });

    const response = await POST({ request } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual(nextPlan);
    expect(savePendingNextPlan).not.toHaveBeenCalled();
  });

  it("POST persists a generated next plan when no pending draft exists", async () => {
    vi.mocked(getPlan)
      .mockResolvedValueOnce(sourcePlan)
      .mockResolvedValueOnce(null);
    vi.mocked(getPendingNextPlan).mockResolvedValue(null);
    vi.mocked(getExerciseLogsForWeek).mockResolvedValue([]);
    vi.mocked(getPlanGenerator).mockReturnValue({
      generateNextPlan: vi.fn().mockResolvedValue(nextPlan),
    });

    const request = new Request("http://localhost/data/plans/next", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceWeek: "2026-03-30" }),
    });

    const response = await POST({ request } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(201);
    expect(payload).toEqual(nextPlan);
    expect(savePendingNextPlan).toHaveBeenCalledWith("2026-03-30", nextPlan);
  });

  it("POST saves the accepted next plan and clears the pending draft when save=true", async () => {
    vi.mocked(getPlan)
      .mockResolvedValueOnce(sourcePlan)
      .mockResolvedValueOnce(null);
    vi.mocked(getPendingNextPlan).mockResolvedValue(null);
    vi.mocked(getExerciseLogsForWeek).mockResolvedValue([]);
    vi.mocked(getPlanGenerator).mockReturnValue({
      generateNextPlan: vi.fn().mockResolvedValue(nextPlan),
    });

    const request = new Request("http://localhost/data/plans/next", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceWeek: "2026-03-30", save: true }),
    });

    const response = await POST({ request } as any);
    const payload = await parseResponse(response);

    expect(response.status).toBe(201);
    expect(payload).toEqual(nextPlan);
    expect(savePlan).toHaveBeenCalledWith(nextPlan);
    expect(deletePendingNextPlan).toHaveBeenCalledWith("2026-03-30");
    expect(savePendingNextPlan).not.toHaveBeenCalled();
  });
});
