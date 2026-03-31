<script lang="ts">
	import type { ExerciseEntry } from '$lib/types';

	let {
		exercise,
		completed = false,
		onComplete,
		onUndo
	}: {
		exercise: ExerciseEntry;
		completed?: boolean;
		onComplete?: (actual: ExerciseEntry) => void;
		onUndo?: () => void;
	} = $props();

	let editing = $state(false);
	let weightOverride = $state<number | null>(null);
	let repsOverride = $state<number[] | null>(null);

	let actualWeight = $derived(weightOverride ?? exercise.actualWeight ?? exercise.targetWeight ?? 0);
	let actualReps = $derived(repsOverride ?? exercise.actualReps ?? [...exercise.targetReps]);

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
	class="card card-border bg-base-100 p-3 {completed ? 'border-success/40 bg-success/10' : ''}"
>
	<div class="flex items-start justify-between">
		<div class="flex-1">
			<h4 class="text-sm font-semibold text-base-content">{exercise.name}</h4>
			{#if completed && exercise.actualReps}
				<p class="mt-0.5 text-xs text-success">
					Actual: {formatReps(exercise.actualReps)}
					{#if exercise.actualWeight !== undefined}
						@ {exercise.actualWeight} kg
					{/if}
				</p>
			{:else}
				<p class="mt-0.5 text-xs text-base-content/60">
					Target: {formatReps(exercise.targetReps)}
					{#if exercise.targetWeight !== undefined}
						@ {exercise.targetWeight} kg
					{/if}
				</p>
			{/if}
			{#if exercise.notes}
				<p class="mt-0.5 text-xs italic text-info">{exercise.notes}</p>
			{/if}
		</div>

		{#if completed}
			<div class="flex items-center gap-1.5">
				<span class="badge badge-success badge-sm">✓</span>
				{#if onUndo}
					<button
						class="btn btn-ghost btn-xs"
						onclick={onUndo}
						title="Undo"
					>
						↩
					</button>
				{/if}
			</div>
		{:else}
			<button
				class="btn btn-primary btn-sm"
				onclick={() => (editing = !editing)}
			>
				{editing ? 'Cancel' : 'Log'}
			</button>
		{/if}
	</div>

	{#if editing}
		<div class="mt-3 space-y-2 border-t border-base-300 pt-3">
			{#if exercise.targetWeight !== undefined}
				<label class="block">
					<span class="text-xs text-base-content/60">Weight (kg)</span>
					<input
						type="number"
						step="0.5"
						value={actualWeight}
						oninput={(e) => (weightOverride = Number(e.currentTarget.value))}
						class="input input-bordered input-sm mt-1 w-full"
					/>
				</label>
			{/if}
			<div>
				<span class="text-xs text-base-content/60">Reps per set</span>
				<div class="mt-1 flex gap-2">
					{#each actualReps as rep, i}
						<input
							type="number"
							value={rep}
							oninput={(e) => {
								const newReps = [...actualReps];
								newReps[i] = Number(e.currentTarget.value);
								repsOverride = newReps;
							}}
							class="input input-bordered input-sm w-14 text-center"
						/>
					{/each}
				</div>
			</div>
			<button
				class="btn btn-success btn-block"
				onclick={handleComplete}
			>
				Mark Complete ✓
			</button>
		</div>
	{/if}
</div>
