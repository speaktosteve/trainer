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
	let machineMaxedOverride = $state<boolean | null>(null);

	let actualWeight = $derived(weightOverride ?? exercise.actualWeight ?? exercise.targetWeight ?? 0);
	let actualReps = $derived(repsOverride ?? exercise.actualReps ?? [...exercise.targetReps]);
	let machineWeightMaxedOut = $derived(
		machineMaxedOverride ?? exercise.machineWeightMaxedOut ?? false
	);

	function handleComplete() {
		if (onComplete) {
			onComplete({
				...exercise,
				machineWeightMaxedOut,
				actualWeight: exercise.targetWeight !== undefined ? actualWeight : undefined,
				actualReps: [...actualReps]
			});
		}
		editing = false;
	}

	function formatReps(reps: number[]): string {
		return reps.join(', ');
	}

	function addSet() {
		const nextRep = actualReps.length > 0 ? actualReps[actualReps.length - 1] : 0;
		repsOverride = [...actualReps, nextRep];
	}

	function removeSet() {
		if (actualReps.length <= 1) return;
		repsOverride = actualReps.slice(0, -1);
	}
</script>

<div
	class="card card-border bg-base-100 p-3 {completed ? 'border-success/40 bg-success/10' : ''}"
>
	<div class="flex items-start justify-between">
		<div class="flex-1">
			<h4 class="text-sm font-semibold text-base-content">{exercise.name}</h4>
			{#if machineWeightMaxedOut}
				<p class="mt-0.5 text-xs font-medium text-warning">Machine weight maxed</p>
			{/if}
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
			<div class="flex flex-wrap items-end gap-3">
				{#if exercise.targetWeight !== undefined}
					<label class="min-w-32 flex-1">
						<span class="text-xs text-base-content/60">Weight (kg)</span>
						<input
							type="number"
							step="0.5"
							value={actualWeight}
							oninput={(e) => (weightOverride = Number(e.currentTarget.value))}
							class="input input-bordered input-sm mt-1 w-full"
						/>
					</label>
					<label class="label label-text-alt mt-5 cursor-pointer justify-start self-center gap-2 p-0">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={machineWeightMaxedOut}
							onchange={(e) => (machineMaxedOverride = e.currentTarget.checked)}
						/>
						<span class="label-text text-xs">Max machine weight</span>
					</label>
				{/if}
			</div>
			<div>
				<span class="text-xs text-base-content/60">Reps per set</span>
				<div class="mt-1 flex items-center gap-1">
					{#each actualReps as rep, i (i)}
						<input
							type="number"
							value={rep}
							oninput={(e) => {
								const newReps = [...actualReps];
								newReps[i] = Number(e.currentTarget.value);
								repsOverride = newReps;
							}}
							class="input input-bordered input-sm w-12 text-center"
						/>
					{/each}
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={addSet}
						title="Add set"
					>
						+
					</button>
					{#if actualReps.length > 1}
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={removeSet}
							title="Remove set"
						>
							−
						</button>
					{/if}
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
