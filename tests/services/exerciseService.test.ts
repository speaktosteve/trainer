import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import type { ExerciseLog, ExerciseLogEntity, BodyweightEntry, BodyweightEntity } from "$lib/types";

vi.mock("$lib/services/tableStorage", () => ({
	getTableClient: vi.fn(),
	DEFAULT_PK: "default",
}));

import {
	logExercise,
	getExerciseHistory,
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
	});

	describe("logWeight", () => {
		it("upserts a bodyweight entity", async () => {
			const mockClient = createMockTableClient();
			vi.mocked(getTableClient).mockResolvedValue(mockClient as any);

			const entry: BodyweightEntry = { date: "2026-03-30", weight: 77.7 };
			await logWeight(entry);

			expect(mockClient.upsertEntity).toHaveBeenCalledWith(
				{ partitionKey: "default", rowKey: "2026-03-30", weight: 77.7 },
				"Replace"
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
	});
});
