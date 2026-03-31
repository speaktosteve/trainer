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

    it("returns null for a 404 error", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getPlan("2099-01-01");
      expect(result).toBeNull();
    });

    it("re-throws non-404 errors", async () => {
      const mockClient = createMockTableClient([]);
      const serverError = new Error("Internal Server Error") as Error & { statusCode: number };
      serverError.statusCode = 500;
      mockClient.getEntity.mockRejectedValue(serverError);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await expect(getPlan("2026-03-30")).rejects.toThrow("Internal Server Error");
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

    it("uses the plan's weekStart as the row key", async () => {
      const mockClient = createMockTableClient();
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const otherPlan = { ...mockPlan, weekStart: "2026-04-06" };
      await savePlan(otherPlan);

      const entity = mockClient.upsertEntity.mock.calls[0][0];
      expect(entity.rowKey).toBe("2026-04-06");
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

    it("returns empty array when no plans are in range", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getPlansForRange("2026-01-01", "2026-01-31");
      expect(result).toEqual([]);
    });

    it("passes correct date range filter to listEntities", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await getPlansForRange("2026-03-01", "2026-03-31");

      const firstCall = mockClient.listEntities.mock.calls.at(0);
      expect(firstCall).toBeDefined();
      const callArgs = firstCall?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs.queryOptions.filter).toContain("RowKey ge '2026-03-01'");
      expect(callArgs.queryOptions.filter).toContain("RowKey le '2026-03-31'");
    });
  });
});
