<script lang="ts">
	import type { WeeklyPlan, PlannedSession, ExerciseEntry } from '$lib/types';
	import SummaryBanner from '$lib/components/SummaryBanner.svelte';

	let {
		plan,
		onSave,
		onCancel
	}: {
		plan: WeeklyPlan;
		onSave: (plan: WeeklyPlan) => void;
		onCancel: () => void;
	} = $props();

	function clonePlan(): WeeklyPlan {
		return structuredClone($state.snapshot(plan));
	}

	// Deep-clone the plan so edits don't mutate the original
	let editPlan = $state<WeeklyPlan>(clonePlan());

	function resetFromPlan() {
		editPlan = clonePlan();
	}

	const dayLabels: Record<string, string> = {
		monday: 'Monday',
		tuesday: 'Tuesday',
		wednesday: 'Wednesday',
		friday: 'Friday'
	};

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
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-bold text-gray-900 md:text-xl">Review Next Week's Plan</h2>
		<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
			w/c {editPlan.weekStart}
		</span>
	</div>

	<SummaryBanner summary={editPlan.summary ?? null} />

	<p class="text-sm text-gray-500">
		Adjust weights, reps, and notes before saving.
	</p>

	<div class="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
	{#each editPlan.sessions as session, sIdx}
		<div class="rounded-xl border border-gray-200 bg-white shadow-sm">
			<div class="border-b border-gray-100 p-3">
				<h3 class="text-sm font-bold text-gray-900">
					{dayLabels[session.day]} — {session.label}
				</h3>
			</div>

			<div class="space-y-3 p-3">
				{#each session.exercises as exercise, eIdx}
					<div class="rounded-lg border border-gray-100 bg-gray-50 p-3">
						<h4 class="text-sm font-semibold text-gray-900">{exercise.name}</h4>

						<div class="mt-2 flex flex-wrap items-end gap-3">
							{#if exercise.targetWeight !== undefined}
								<label class="block">
									<span class="text-xs text-gray-600">Weight (kg)</span>
									<input
										type="number"
										step="0.5"
										value={exercise.targetWeight}
										oninput={(e) => updateExercise(sIdx, eIdx, 'targetWeight', Number(e.currentTarget.value))}
										class="mt-1 block w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
									/>
								</label>
							{/if}

							<div>
								<span class="text-xs text-gray-600">Reps per set</span>
								<div class="mt-1 flex items-center gap-1">
									{#each exercise.targetReps as rep, rIdx}
										<input
											type="number"
											value={rep}
											oninput={(e) => updateRep(sIdx, eIdx, rIdx, Number(e.currentTarget.value))}
											class="w-12 rounded-md border border-gray-300 px-1 py-1.5 text-center text-sm"
										/>
									{/each}
									<button
										class="min-h-[34px] min-w-[34px] rounded-md border border-gray-300 text-xs text-gray-500 active:bg-gray-100"
										onclick={() => addSet(sIdx, eIdx)}
										title="Add set"
									>+</button>
									{#if exercise.targetReps.length > 1}
										<button
											class="min-h-[34px] min-w-[34px] rounded-md border border-gray-300 text-xs text-gray-500 active:bg-gray-100"
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
									class="w-full rounded-md border border-gray-200 px-2 py-1 text-xs italic text-blue-600"
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
			class="min-h-[44px] flex-1 rounded-lg bg-green-500 py-2.5 text-sm font-semibold text-white active:bg-green-600"
			onclick={() => onSave(editPlan)}
		>
			Save Plan
		</button>
		<button
			class="min-h-[44px] rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 active:bg-gray-50"
			onclick={onCancel}
		>
			Cancel
		</button>
	</div>
</div>
