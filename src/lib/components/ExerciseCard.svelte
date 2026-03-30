<script lang="ts">
	import type { ExerciseEntry } from '$lib/types';

	let {
		exercise,
		completed = false,
		onComplete
	}: {
		exercise: ExerciseEntry;
		completed?: boolean;
		onComplete?: (actual: ExerciseEntry) => void;
	} = $props();

	let editing = $state(false);
	let actualWeight = $state(exercise.actualWeight ?? exercise.targetWeight ?? 0);
	let actualReps = $state<number[]>(exercise.actualReps ?? [...exercise.targetReps]);

	function handleComplete() {
		if (onComplete) {
			onComplete({
				...exercise,
				actualWeight: exercise.targetWeight !== undefined ? actualWeight : undefined,
				actualReps: [...actualReps]
			});
		}
		editing = false;
	}

	function formatReps(reps: number[]): string {
		return reps.join(', ');
	}
</script>

<div
	class="rounded-lg border p-3 {completed
		? 'border-green-200 bg-green-50'
		: 'border-gray-200 bg-white'}"
>
	<div class="flex items-start justify-between">
		<div class="flex-1">
			<h4 class="text-sm font-semibold text-gray-900">{exercise.name}</h4>
			<p class="mt-0.5 text-xs text-gray-500">
				Target: {formatReps(exercise.targetReps)}
				{#if exercise.targetWeight !== undefined}
					@ {exercise.targetWeight} kg
				{/if}
			</p>
			{#if exercise.notes}
				<p class="mt-0.5 text-xs italic text-blue-600">{exercise.notes}</p>
			{/if}
		</div>

		{#if completed && exercise.actualReps}
			<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
				✓ {formatReps(exercise.actualReps)}
				{#if exercise.actualWeight !== undefined}
					@ {exercise.actualWeight} kg
				{/if}
			</span>
		{:else if !completed}
			<button
				class="min-h-[44px] min-w-[44px] rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white active:bg-blue-600"
				onclick={() => (editing = !editing)}
			>
				{editing ? 'Cancel' : 'Log'}
			</button>
		{/if}
	</div>

	{#if editing}
		<div class="mt-3 space-y-2 border-t border-gray-100 pt-3">
			{#if exercise.targetWeight !== undefined}
				<label class="block">
					<span class="text-xs text-gray-600">Weight (kg)</span>
					<input
						type="number"
						step="0.5"
						bind:value={actualWeight}
						class="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
					/>
				</label>
			{/if}
			<div>
				<span class="text-xs text-gray-600">Reps per set</span>
				<div class="mt-1 flex gap-2">
					{#each actualReps as _, i}
						<input
							type="number"
							bind:value={actualReps[i]}
							class="w-14 rounded-md border border-gray-300 px-2 py-1.5 text-center text-sm"
						/>
					{/each}
				</div>
			</div>
			<button
				class="min-h-[44px] w-full rounded-lg bg-green-500 py-2 text-sm font-medium text-white active:bg-green-600"
				onclick={handleComplete}
			>
				Mark Complete ✓
			</button>
		</div>
	{/if}
</div>
