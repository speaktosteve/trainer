<script lang="ts">
	import type { WeeklyPlan, ExerciseEntry } from '$lib/types';
	import SummaryBanner from '$lib/components/SummaryBanner.svelte';

	let {
		plan,
		onSave,
		onDiscard,
		previousResults = {}
	}: {
		plan: WeeklyPlan;
		onSave: (plan: WeeklyPlan) => void;
		onDiscard: () => void;
		/** Completed exercises from the previous week, keyed by day then exercise name. */
		previousResults?: Record<string, Record<string, ExerciseEntry>>;
	} = $props();

	function getPreviousResult(day: string, name: string): ExerciseEntry | undefined {
		return previousResults[day]?.[name];
	}

	function formatPreviousReps(reps: number[]): string {
		return reps.join(', ');
	}

	function clonePlan(): WeeklyPlan {
		return structuredClone($state.snapshot(plan));
	}

	// Deep-clone the plan so edits don't mutate the original
	let editPlan = $state<WeeklyPlan>(clonePlan());

	const dayLabels: Record<string, string> = {
		monday: 'Monday',
		tuesday: 'Tuesday',
		wednesday: 'Wednesday',
		friday: 'Friday'
	};

	function getDayLabel(day: string): string {
		const normalizedDay = day.toLowerCase();
		return dayLabels[normalizedDay] ?? day;
	}

	function updateExercise(sessionIdx: number, exIdx: number, field: string, value: unknown) {
		const session = editPlan.sessions[sessionIdx];
		const ex = session.exercises[exIdx];
		if (field === 'targetWeight') {
			ex.targetWeight = value as number;
		} else if (field === 'notes') {
			ex.notes = value as string || undefined;
		}
		editPlan = { ...editPlan };
	}

	function updateRep(sessionIdx: number, exIdx: number, repIdx: number, value: number) {
		editPlan.sessions[sessionIdx].exercises[exIdx].targetReps[repIdx] = value;
		editPlan = { ...editPlan };
	}

	function addSet(sessionIdx: number, exIdx: number) {
		const reps = editPlan.sessions[sessionIdx].exercises[exIdx].targetReps;
		reps.push(reps[reps.length - 1] ?? 8);
		editPlan = { ...editPlan };
	}

	function removeSet(sessionIdx: number, exIdx: number) {
		const reps = editPlan.sessions[sessionIdx].exercises[exIdx].targetReps;
		if (reps.length > 1) {
			reps.pop();
			editPlan = { ...editPlan };
		}
	}

	function confirmDiscard() {
		if (window.confirm('Discard this generated plan draft? This cannot be undone.')) {
			onDiscard();
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-bold text-base-content md:text-xl">Review Next Week's Plan</h2>
		<span class="badge badge-primary">
			w/c {editPlan.weekStart}
		</span>
	</div>

	<SummaryBanner summary={editPlan.summary ?? null} />

	<p class="text-sm text-base-content/60">
		Adjust weights, reps, and notes before saving.
	</p>

	<div class="space-y-4 md:gap-4 md:space-y-0">
	{#each editPlan.sessions as session, sIdx (session.day)}
		<div class="card card-border bg-base-100 shadow-sm">
			<div class="border-b border-base-300 p-3">
				<h3 class="text-sm font-bold text-base-content">
					{getDayLabel(session.day)} — {session.label}
				</h3>
			</div>

			<div class="space-y-3 p-3">
				{#each session.exercises as exercise, eIdx (exercise.name)}
					{@const prev = getPreviousResult(session.day, exercise.name)}
					<div class="rounded-lg border border-base-300 bg-base-200 p-3">
						<h4 class="text-sm font-semibold text-base-content">{exercise.name}</h4>

						{#if prev}
							<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-base-content/50">
								<span class="font-medium uppercase tracking-wide">Last week</span>
								{#if prev.actualWeight !== undefined}
									<span>{prev.actualWeight} kg</span>
								{/if}
								{#if prev.actualReps}
									<span>× {formatPreviousReps(prev.actualReps)}</span>
								{/if}
							</div>
						{/if}

						<div class="mt-2 flex flex-wrap items-end gap-3">
							{#if exercise.targetWeight !== undefined}
								<label class="block">
									<span class="text-xs text-base-content/60">Weight (kg)</span>
									<input
										type="number"
										step="0.5"
										value={exercise.targetWeight}
										oninput={(e) => updateExercise(sIdx, eIdx, 'targetWeight', Number(e.currentTarget.value))}
										class="input input-bordered input-sm mt-1 w-20"
									/>
								</label>
							{/if}

							<div>
								<span class="text-xs text-base-content/60">Reps per set</span>
								<div class="mt-1 flex items-center gap-1">
									{#each exercise.targetReps as rep, rIdx (rIdx)}
										<input
											type="number"
											value={rep}
											oninput={(e) => updateRep(sIdx, eIdx, rIdx, Number(e.currentTarget.value))}
											class="input input-bordered input-sm w-12 text-center"
										/>
									{/each}
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => addSet(sIdx, eIdx)}
										title="Add set"
									>+</button>
									{#if exercise.targetReps.length > 1}
										<button
											class="btn btn-ghost btn-sm"
											onclick={() => removeSet(sIdx, eIdx)}
											title="Remove set"
										>−</button>
									{/if}
								</div>
							</div>
						</div>

						{#if exercise.notes}
							<div class="mt-2">
								<input
									type="text"
									value={exercise.notes}
									oninput={(e) => updateExercise(sIdx, eIdx, 'notes', e.currentTarget.value)}
									class="input input-bordered input-sm w-full text-xs italic text-info"
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/each}
	</div>

	<div class="flex gap-3 pb-4">
		<button
			class="btn btn-success flex-1"
			onclick={() => onSave(editPlan)}
		>
			Save Plan
		</button>
		<button
			class="btn btn-error btn-outline"
			onclick={confirmDiscard}
		>
			Discard
		</button>
	</div>
</div>
