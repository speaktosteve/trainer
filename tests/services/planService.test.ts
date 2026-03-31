import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import type { WeeklyPlan, PlanEntity } from "$lib/types";

// Mock the tableStorage module
vi.mock("$lib/services/tableStorage", () => ({
  getTableClient: vi.fn(),
  DEFAULT_PK: "default",
}));

vi.mock("$lib/utils/dates", async () => {
  const actual = await vi.importActual<typeof import("$lib/utils/dates")>("$lib/utils/dates");
  return {
    ...actual,
    getWeekStart: vi.fn(() => "2026-03-30"),
  };
});

import { getCurrentWeekPlan, getPlan, savePlan, getPlansForRange } from "$lib/services/planService";
import { getTableClient } from "$lib/services/tableStorage";

const mockPlan: WeeklyPlan = {
  weekStart: "2026-03-30",
  sessions: [
    {
      day: "monday",
      label: "Push",
      exercises: [{ name: "Bench Press", targetWeight: 62.5, targetReps: [6, 6, 6, 6] }],
    },
  ],
};

function createMockTableClient(entities: PlanEntity[] = []) {
  return {
    getEntity: vi.fn((_pk: string, rk: string) => {
      const found = entities.find((e) => e.rowKey === rk);
      if (!found) {
        const err = new Error("Not found") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }
      return found;
    }),
    upsertEntity: vi.fn(),
    listEntities: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        for (const e of entities) yield e;
      },
    })),
  };
}

describe("planService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCurrentWeekPlan", () => {
    it("returns the plan for the current week", async () => {
      const entity: PlanEntity = {
        partitionKey: "default",
        rowKey: "2026-03-30",
        data: JSON.stringify(mockPlan),
      };
      const mockClient = createMockTableClient([entity]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getCurrentWeekPlan();
      expect(result).toEqual(mockPlan);
      expect(mockClient.getEntity).toHaveBeenCalledWith("default", "2026-03-30");
    });

    it("returns null when no plan exists", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getCurrentWeekPlan();
      expect(result).toBeNull();
    });
  });

  describe("getPlan", () => {
    it("returns the plan for a specific week", async () => {
      const entity: PlanEntity = {
        partitionKey: "default",
        rowKey: "2026-03-23",
        data: JSON.stringify({ ...mockPlan, weekStart: "2026-03-23" }),
      };
      const mockClient = createMockTableClient([entity]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getPlan("2026-03-23");
      expect(result).toEqual({ ...mockPlan, weekStart: "2026-03-23" });
    });
  });

  describe("savePlan", () => {
    it("upserts the plan entity", async () => {
      const mockClient = createMockTableClient();
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await savePlan(mockPlan);
      expect(mockClient.upsertEntity).toHaveBeenCalledWith(
        {
          partitionKey: "default",
          rowKey: "2026-03-30",
          data: JSON.stringify(mockPlan),
        },
        "Replace",
      );
    });
  });

  describe("getPlansForRange", () => {
    it("returns plans sorted by week start", async () => {
      const plan1 = { ...mockPlan, weekStart: "2026-03-16" };
      const plan2 = { ...mockPlan, weekStart: "2026-03-23" };
      const entities: PlanEntity[] = [
        { partitionKey: "default", rowKey: "2026-03-23", data: JSON.stringify(plan2) },
        { partitionKey: "default", rowKey: "2026-03-16", data: JSON.stringify(plan1) },
      ];
      const mockClient = createMockTableClient(entities);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getPlansForRange("2026-03-16", "2026-03-30");
      expect(result).toHaveLength(2);
      expect(result[0].weekStart).toBe("2026-03-16");
      expect(result[1].weekStart).toBe("2026-03-23");
    });
  });
});
