import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import type { ExerciseLog, ExerciseLogEntity, BodyweightEntry, BodyweightEntity } from "$lib/types";

vi.mock("$lib/services/tableStorage", () => ({
  getTableClient: vi.fn(),
  DEFAULT_PK: "default",
}));

import {
  logExercise,
  getExerciseHistory,
  deleteExerciseLog,
  getExerciseLogsForWeek,
  logWeight,
  getWeightHistory,
} from "$lib/services/exerciseService";
import { getTableClient } from "$lib/services/tableStorage";

const mockLog: ExerciseLog = {
  day: "monday",
  label: "Push",
  completedDate: "2026-03-30",
  weekStart: "2026-03-30",
  exercises: [
    {
      name: "Bench Press",
      targetWeight: 62.5,
      targetReps: [6, 6, 6, 6],
      actualWeight: 62.5,
      actualReps: [6, 6, 6, 5],
    },
  ],
};

function createMockTableClient(entities: (ExerciseLogEntity | BodyweightEntity)[] = []) {
  return {
    getEntity: vi.fn(),
    upsertEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listEntities: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        for (const e of entities) yield e;
      },
    })),
  };
}

describe("exerciseService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logExercise", () => {
    it("upserts an exercise log entity", async () => {
      const mockClient = createMockTableClient();
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await logExercise(mockLog);
      expect(mockClient.upsertEntity).toHaveBeenCalledTimes(1);

      const calledEntity = mockClient.upsertEntity.mock.calls[0][0];
      expect(calledEntity.partitionKey).toBe("default");
      expect(JSON.parse(calledEntity.data)).toEqual(mockLog);
    });

    it("merges into existing entity, updating an exercise that already exists", async () => {
      const existingLog: ExerciseLog = {
        ...mockLog,
        exercises: [
          {
            name: "Bench Press",
            targetWeight: 60,
            targetReps: [6, 6, 6, 6],
            actualWeight: 60,
            actualReps: [6, 6, 6, 6],
          },
        ],
      };
      const existingEntity: ExerciseLogEntity = {
        partitionKey: "default",
        rowKey: "rowkey_monday",
        data: JSON.stringify(existingLog),
      };

      const mockClient = createMockTableClient();
      mockClient.getEntity.mockResolvedValue(existingEntity);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await logExercise(mockLog);

      const savedData = JSON.parse(mockClient.upsertEntity.mock.calls[0][0].data) as ExerciseLog;
      // Should have updated the Bench Press entry with the new data
      expect(savedData.exercises).toHaveLength(1);
      expect(savedData.exercises[0].actualWeight).toBe(62.5);
    });

    it("merges into existing entity, appending a new exercise", async () => {
      const existingLog: ExerciseLog = { ...mockLog };
      const existingEntity: ExerciseLogEntity = {
        partitionKey: "default",
        rowKey: "rowkey_monday",
        data: JSON.stringify(existingLog),
      };

      const newExerciseLog: ExerciseLog = {
        ...mockLog,
        exercises: [
          {
            name: "Overhead Press",
            targetWeight: 40,
            targetReps: [6, 6, 6],
            actualWeight: 40,
            actualReps: [6, 6, 5],
          },
        ],
      };

      const mockClient = createMockTableClient();
      mockClient.getEntity.mockResolvedValue(existingEntity);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await logExercise(newExerciseLog);

      const savedData = JSON.parse(mockClient.upsertEntity.mock.calls[0][0].data) as ExerciseLog;
      expect(savedData.exercises).toHaveLength(2);
      const names = savedData.exercises.map((e) => e.name);
      expect(names).toContain("Bench Press");
      expect(names).toContain("Overhead Press");
    });
  });

  describe("getExerciseHistory", () => {
    it("returns parsed exercise logs", async () => {
      const entity: ExerciseLogEntity = {
        partitionKey: "default",
        rowKey: "8224261199999",
        data: JSON.stringify(mockLog),
      };
      const mockClient = createMockTableClient([entity]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getExerciseHistory();
      expect(result).toHaveLength(1);
      expect(result[0].day).toBe("monday");
      expect(result[0].exercises[0].name).toBe("Bench Press");
    });

    it("respects limit", async () => {
      const entities = Array.from({ length: 5 }, (_, i) => ({
        partitionKey: "default",
        rowKey: String(i).padStart(13, "0"),
        data: JSON.stringify({ ...mockLog, completedDate: `2026-03-${25 + i}` }),
      }));
      const mockClient = createMockTableClient(entities);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getExerciseHistory({ limit: 3 });
      expect(result).toHaveLength(3);
    });

    it("builds correct filter when fromDate is provided", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await getExerciseHistory({ fromDate: "2026-03-01" });

      const callArgs = mockClient.listEntities.mock.calls[0][0];
      expect(callArgs.queryOptions.filter).toContain("RowKey le");
    });

    it("builds correct filter when toDate is provided", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await getExerciseHistory({ toDate: "2026-03-31" });

      const callArgs = mockClient.listEntities.mock.calls[0][0];
      expect(callArgs.queryOptions.filter).toContain("RowKey ge");
    });

    it("returns empty array when there are no entities", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getExerciseHistory();
      expect(result).toEqual([]);
    });
  });

  describe("deleteExerciseLog", () => {
    it("removes the whole entity when deleting the last exercise", async () => {
      const entity: ExerciseLogEntity = {
        partitionKey: "default",
        rowKey: "rowkey_monday",
        data: JSON.stringify(mockLog),
      };
      const mockClient = createMockTableClient([entity]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await deleteExerciseLog("2026-03-30", "monday", "Bench Press");

      expect(result).toBe(true);
      expect(mockClient.deleteEntity).toHaveBeenCalledWith("default", "rowkey_monday");
      expect(mockClient.upsertEntity).not.toHaveBeenCalled();
    });

    it("updates the entity when other exercises remain", async () => {
      const logWithTwo: ExerciseLog = {
        ...mockLog,
        exercises: [
          { name: "Bench Press", targetReps: [6, 6, 6], actualReps: [6, 6, 6] },
          { name: "Overhead Press", targetReps: [6, 6, 6], actualReps: [5, 6, 6] },
        ],
      };
      const entity: ExerciseLogEntity = {
        partitionKey: "default",
        rowKey: "rowkey_monday",
        data: JSON.stringify(logWithTwo),
      };
      const mockClient = createMockTableClient([entity]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await deleteExerciseLog("2026-03-30", "monday", "Bench Press");

      expect(result).toBe(true);
      expect(mockClient.deleteEntity).not.toHaveBeenCalled();
      const savedData = JSON.parse(mockClient.upsertEntity.mock.calls[0][0].data) as ExerciseLog;
      expect(savedData.exercises).toHaveLength(1);
      expect(savedData.exercises[0].name).toBe("Overhead Press");
    });

    it("returns false when no matching log is found", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await deleteExerciseLog("2026-03-30", "monday", "Bench Press");

      expect(result).toBe(false);
      expect(mockClient.deleteEntity).not.toHaveBeenCalled();
    });

    it("skips entities for a different week", async () => {
      const otherWeekLog: ExerciseLog = { ...mockLog, weekStart: "2026-03-23" };
      const entity: ExerciseLogEntity = {
        partitionKey: "default",
        rowKey: "rowkey_monday",
        data: JSON.stringify(otherWeekLog),
      };
      const mockClient = createMockTableClient([entity]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await deleteExerciseLog("2026-03-30", "monday", "Bench Press");

      expect(result).toBe(false);
    });

    it("skips entities where the exercise name does not match", async () => {
      const entity: ExerciseLogEntity = {
        partitionKey: "default",
        rowKey: "rowkey_monday",
        data: JSON.stringify(mockLog),
      };
      const mockClient = createMockTableClient([entity]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await deleteExerciseLog("2026-03-30", "monday", "Squat");

      expect(result).toBe(false);
    });
  });

  describe("getExerciseLogsForWeek", () => {
    it("returns only logs for the specified week", async () => {
      const thisWeekLog: ExerciseLog = { ...mockLog, weekStart: "2026-03-30" };
      const otherWeekLog: ExerciseLog = { ...mockLog, weekStart: "2026-03-23" };
      const entities: ExerciseLogEntity[] = [
        { partitionKey: "default", rowKey: "key1", data: JSON.stringify(thisWeekLog) },
        { partitionKey: "default", rowKey: "key2", data: JSON.stringify(otherWeekLog) },
      ];
      const mockClient = createMockTableClient(entities);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getExerciseLogsForWeek("2026-03-30");
      expect(result).toHaveLength(1);
      expect(result[0].weekStart).toBe("2026-03-30");
    });

    it("returns empty array when no logs match the week", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getExerciseLogsForWeek("2026-03-30");
      expect(result).toEqual([]);
    });
  });

  describe("logWeight", () => {
    it("upserts a bodyweight entity", async () => {
      const mockClient = createMockTableClient();
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const entry: BodyweightEntry = { date: "2026-03-30", weight: 77.7 };
      await logWeight(entry);

      expect(mockClient.upsertEntity).toHaveBeenCalledWith(
        { partitionKey: "default", rowKey: "2026-03-30", weight: 77.7 },
        "Replace",
      );
    });
  });

  describe("getWeightHistory", () => {
    it("returns entries sorted by date ascending", async () => {
      const entities: BodyweightEntity[] = [
        { partitionKey: "default", rowKey: "2026-03-20", weight: 77.8 },
        { partitionKey: "default", rowKey: "2026-03-13", weight: 77.1 },
      ];
      const mockClient = createMockTableClient(entities);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getWeightHistory();
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe("2026-03-13");
      expect(result[1].date).toBe("2026-03-20");
    });

    it("builds correct filter when fromDate is provided", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await getWeightHistory({ fromDate: "2026-03-01" });

      const callArgs = mockClient.listEntities.mock.calls[0][0];
      expect(callArgs.queryOptions.filter).toContain("RowKey ge '2026-03-01'");
    });

    it("builds correct filter when toDate is provided", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      await getWeightHistory({ toDate: "2026-03-31" });

      const callArgs = mockClient.listEntities.mock.calls[0][0];
      expect(callArgs.queryOptions.filter).toContain("RowKey le '2026-03-31'");
    });

    it("returns empty array when there are no entities", async () => {
      const mockClient = createMockTableClient([]);
      vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

      const result = await getWeightHistory();
      expect(result).toEqual([]);
    });
  });
});
