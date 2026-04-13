import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ExerciseLogEntity, PlanEntity } from "$lib/types";

vi.mock("$lib/services/tableStorage", () => ({
  getTableClient: vi.fn(),
  DEFAULT_PK: "default",
}));

import {
  addExerciseToCatalog,
  addPlanExercisesToCatalog,
  getExerciseCatalog,
} from "$lib/services/exerciseService";
import { getTableClient } from "$lib/services/tableStorage";

function createAsyncIterable<T>(items: T[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe("exercise catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addExerciseToCatalog stores normalized row keys", async () => {
    const catalogRows: Array<{
      partitionKey: string;
      rowKey: string;
      name: string;
      createdAt: string;
    }> = [];
    const catalogClient = {
      upsertEntity: vi.fn(
        async (entity: {
          partitionKey: string;
          rowKey: string;
          name: string;
          createdAt: string;
        }) => {
          catalogRows.push(entity);
        },
      ),
      listEntities: vi.fn(() => createAsyncIterable(catalogRows)),
    };

    vi.mocked(getTableClient).mockImplementation(async (tableName: string) => {
      if (tableName === "ExerciseCatalog") return catalogClient as any;
      throw new Error(`Unexpected table name: ${tableName}`);
    });

    await addExerciseToCatalog("  Cable Crunch  ");

    expect(catalogClient.upsertEntity).toHaveBeenCalledTimes(1);
    expect(catalogRows[0]?.rowKey).toBe("cable crunch");
    expect(catalogRows[0]?.name).toBe("Cable Crunch");
  });

  it("getExerciseCatalog backfills missing exercises from plans and logs", async () => {
    const catalogRows: Array<{
      partitionKey: string;
      rowKey: string;
      name: string;
      createdAt: string;
    }> = [
      {
        partitionKey: "default",
        rowKey: "bench press",
        name: "Bench Press",
        createdAt: "2026-04-01T00:00:00.000Z",
      },
    ];

    const catalogClient = {
      upsertEntity: vi.fn(
        async (entity: {
          partitionKey: string;
          rowKey: string;
          name: string;
          createdAt: string;
        }) => {
          const existingIndex = catalogRows.findIndex((row) => row.rowKey === entity.rowKey);
          if (existingIndex >= 0) {
            catalogRows[existingIndex] = { ...catalogRows[existingIndex], ...entity };
          } else {
            catalogRows.push(entity);
          }
        },
      ),
      listEntities: vi.fn(() => createAsyncIterable(catalogRows)),
    };

    const plansRows: PlanEntity[] = [
      {
        partitionKey: "default",
        rowKey: "2026-03-30",
        data: JSON.stringify({
          weekStart: "2026-03-30",
          sessions: [
            {
              day: "monday",
              label: "Push",
              exercises: [{ name: "Incline DB Press", targetReps: [8, 8, 8] }],
            },
          ],
        }),
      },
    ];

    const logsRows: ExerciseLogEntity[] = [
      {
        partitionKey: "default",
        rowKey: "abc",
        data: JSON.stringify({
          weekStart: "2026-03-30",
          completedDate: "2026-04-01",
          day: "tuesday",
          label: "Core",
          exercises: [{ name: "Cable Crunch", targetReps: [12, 12, 12] }],
        }),
      },
    ];

    const plansClient = {
      listEntities: vi.fn(() => createAsyncIterable(plansRows)),
    };

    const logsClient = {
      listEntities: vi.fn(() => createAsyncIterable(logsRows)),
    };

    vi.mocked(getTableClient).mockImplementation(async (tableName: string) => {
      if (tableName === "ExerciseCatalog") return catalogClient as any;
      if (tableName === "Plans") return plansClient as any;
      if (tableName === "ExerciseLogs") return logsClient as any;
      throw new Error(`Unexpected table name: ${tableName}`);
    });

    const catalog = await getExerciseCatalog();

    expect(catalog.map((item) => item.name)).toEqual([
      "Bench Press",
      "Cable Crunch",
      "Incline DB Press",
    ]);
  });

  it("addPlanExercisesToCatalog deduplicates repeated names", async () => {
    const catalogClient = {
      upsertEntity: vi.fn(async () => {}),
      listEntities: vi.fn(() => createAsyncIterable([])),
    };

    vi.mocked(getTableClient).mockImplementation(async (tableName: string) => {
      if (tableName === "ExerciseCatalog") return catalogClient as any;
      throw new Error(`Unexpected table name: ${tableName}`);
    });

    await addPlanExercisesToCatalog({
      weekStart: "2026-04-07",
      sessions: [
        {
          day: "monday",
          label: "Push",
          exercises: [
            { name: "Bench Press", targetReps: [6, 6, 6] },
            { name: "Bench Press", targetReps: [6, 6, 6] },
          ],
        },
      ],
    });

    expect(catalogClient.upsertEntity).toHaveBeenCalledTimes(1);
  });
});
