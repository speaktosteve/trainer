<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeeklyPlan, ExerciseEntry } from '$lib/types';
	import SummaryBanner from '$lib/components/SummaryBanner.svelte';

	let {
		plan,
		onSave,
		onDiscard,
		previousResults = {},
		title = "Review Next Week's Plan",
		description = 'Adjust weights, reps, and notes before saving.',
		saveLabel = 'Save Plan',
		discardLabel = 'Discard'
	}: {
		plan: WeeklyPlan;
		onSave: (plan: WeeklyPlan) => void;
		onDiscard: () => void;
		/** Completed exercises from the previous week, keyed by day then exercise name. */
		previousResults?: Record<string, Record<string, ExerciseEntry>>;
		title?: string;
		description?: string;
		saveLabel?: string;
		discardLabel?: string;
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
	let catalogNames = $state<string[]>([]);
	let catalogLoading = $state(false);
	let catalogError = $state<string | null>(null);
	let addingSessionIdx = $state<number | null>(null);
	let addMode = $state<'existing' | 'new'>('existing');
	let selectedCatalogName = $state('');
	let newExerciseName = $state('');
	let addSetCount = $state(3);
	let addRepsPerSet = $state(8);
	let addWeightEnabled = $state(true);
	let addTargetWeight = $state<number | undefined>(undefined);
	let addNotes = $state('');
	let addSaving = $state(false);
	let addError = $state<string | null>(null);

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

	function removeExercise(sessionIdx: number, exIdx: number) {
		editPlan.sessions[sessionIdx].exercises.splice(exIdx, 1);
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
		if (window.confirm('Discard unsaved plan changes? This cannot be undone.')) {
			onDiscard();
		}
	}

	function resetAddExerciseForm() {
		addMode = 'existing';
		selectedCatalogName = catalogNames[0] ?? '';
		newExerciseName = '';
		addSetCount = 3;
		addRepsPerSet = 8;
		addWeightEnabled = true;
		addTargetWeight = undefined;
		addNotes = '';
		addError = null;
	}

	function openAddExercise(sessionIdx: number) {
		addingSessionIdx = sessionIdx;
		resetAddExerciseForm();
	}

	function cancelAddExercise() {
		addingSessionIdx = null;
		addSaving = false;
		addError = null;
	}

	async function loadExerciseCatalog() {
		catalogLoading = true;
		catalogError = null;
		try {
			const res = await fetch('/data/exercises/catalog');
			if (!res.ok) {
				catalogError = 'Unable to load exercise list';
				return;
			}
			const items = (await res.json()) as Array<{ name: string }>;
			catalogNames = items.map((item) => item.name);
			if (!selectedCatalogName && catalogNames.length > 0) {
				selectedCatalogName = catalogNames[0];
			}
		} finally {
			catalogLoading = false;
		}
	}

	function buildTargetReps(setCount: number, repsPerSet: number): number[] {
		const safeSetCount = Math.max(1, Math.floor(setCount));
		const safeReps = Math.max(1, Math.floor(repsPerSet));
		return Array.from({ length: safeSetCount }, () => safeReps);
	}

	async function saveAddedExercise(sessionIdx: number) {
		addError = null;
		const existingName = selectedCatalogName.trim();
		const createdName = newExerciseName.trim();
		const name = addMode === 'existing' ? existingName : createdName;

		if (!name) {
			addError = 'Exercise name is required';
			return;
		}

		const alreadyExists = editPlan.sessions[sessionIdx].exercises.some(
			(exercise) => exercise.name.toLowerCase() === name.toLowerCase()
		);
		if (alreadyExists) {
			addError = 'This exercise already exists in the session';
			return;
		}

		addSaving = true;
		if (addMode === 'new') {
			const res = await fetch('/data/exercises/catalog', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name })
			});
			if (!res.ok) {
				addError = 'Unable to save new exercise';
				addSaving = false;
				return;
			}
			if (!catalogNames.includes(name)) {
				catalogNames = [...catalogNames, name].sort((a, b) => a.localeCompare(b));
			}
		}

		const exercise: ExerciseEntry = {
			name,
			targetReps: buildTargetReps(addSetCount, addRepsPerSet),
			targetWeight: addWeightEnabled && addTargetWeight !== undefined ? addTargetWeight : undefined,
			notes: addNotes.trim() || undefined
		};

		editPlan.sessions[sessionIdx].exercises.push(exercise);
		editPlan = { ...editPlan };
		addSaving = false;
		cancelAddExercise();
	}

	onMount(async () => {
		await loadExerciseCatalog();
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-lg font-bold text-base-content md:text-xl">{title}</h2>
		<span class="badge badge-primary">
			w/c {editPlan.weekStart}
		</span>
	</div>

	<SummaryBanner summary={editPlan.summary ?? null} />

	<p class="text-sm text-base-content/60">{description}</p>
	{#if catalogError}
		<p class="text-xs text-error">{catalogError}</p>
	{/if}

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
						<div class="flex items-start justify-between gap-2">
							<h4 class="text-sm font-semibold text-base-content">{exercise.name}</h4>
							<button
								type="button"
								class="btn btn-ghost btn-xs text-error"
								onclick={() => removeExercise(sIdx, eIdx)}
							>
								Remove
							</button>
						</div>

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

				<div class="rounded-lg border border-dashed border-base-300 bg-base-100 p-3">
					{#if addingSessionIdx === sIdx}
						<div class="space-y-3">
							<div class="flex items-center justify-between gap-2">
								<h4 class="text-sm font-semibold text-base-content">Add exercise</h4>
								<button class="btn btn-ghost btn-xs" type="button" onclick={cancelAddExercise}>Cancel</button>
							</div>

							<div class="flex flex-wrap gap-2 text-xs">
								<button
									type="button"
									class={`btn btn-xs ${addMode === 'existing' ? 'btn-primary' : 'btn-ghost'}`}
									onclick={() => (addMode = 'existing')}
								>
									Choose existing
								</button>
								<button
									type="button"
									class={`btn btn-xs ${addMode === 'new' ? 'btn-primary' : 'btn-ghost'}`}
									onclick={() => (addMode = 'new')}
								>
									Add new
								</button>
							</div>

							{#if addMode === 'existing'}
								<label class="block">
									<span class="text-xs text-base-content/60">Exercise</span>
									<select
										class="select select-bordered select-sm mt-1 w-full"
										disabled={catalogLoading || catalogNames.length === 0}
										bind:value={selectedCatalogName}
									>
										{#if catalogNames.length === 0}
											<option value="">No exercises yet</option>
										{:else}
											{#each catalogNames as name (name)}
												<option value={name}>{name}</option>
											{/each}
										{/if}
									</select>
								</label>
							{:else}
								<label class="block">
									<span class="text-xs text-base-content/60">New exercise name</span>
									<input class="input input-bordered input-sm mt-1 w-full" bind:value={newExerciseName} />
								</label>
							{/if}

							<div class="grid gap-2 md:grid-cols-2">
								<label class="block">
									<span class="text-xs text-base-content/60">Sets</span>
									<input class="input input-bordered input-sm mt-1 w-full" type="number" min="1" bind:value={addSetCount} />
								</label>
								<label class="block">
									<span class="text-xs text-base-content/60">Reps per set</span>
									<input class="input input-bordered input-sm mt-1 w-full" type="number" min="1" bind:value={addRepsPerSet} />
								</label>
							</div>

							<label class="label cursor-pointer justify-start gap-2 py-0">
								<input type="checkbox" class="checkbox checkbox-sm" bind:checked={addWeightEnabled} />
								<span class="label-text text-xs">Track target weight</span>
							</label>

							{#if addWeightEnabled}
								<label class="block">
									<span class="text-xs text-base-content/60">Target weight (kg)</span>
									<input class="input input-bordered input-sm mt-1 w-full" type="number" step="0.5" min="0" bind:value={addTargetWeight} />
								</label>
							{/if}

							<label class="block">
								<span class="text-xs text-base-content/60">Notes (optional)</span>
								<input class="input input-bordered input-sm mt-1 w-full" bind:value={addNotes} />
							</label>

							{#if addError}
								<p class="text-xs text-error">{addError}</p>
							{/if}

							<div class="flex justify-end">
								<button
									type="button"
									class="btn btn-primary btn-sm"
									disabled={addSaving || catalogLoading}
									onclick={() => saveAddedExercise(sIdx)}
								>
									{addSaving ? 'Adding…' : 'Add Exercise'}
								</button>
							</div>
						</div>
					{:else}
						<button class="btn btn-outline btn-sm w-full" type="button" onclick={() => openAddExercise(sIdx)}>
							+ Add exercise
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/each}
	</div>

	<div class="flex gap-3 pb-4">
		<button
			class="btn btn-success flex-1"
			onclick={() => onSave(editPlan)}
		>
			{saveLabel}
		</button>
		<button
			class="btn btn-error btn-outline"
			onclick={confirmDiscard}
		>
			{discardLabel}
		</button>
	</div>
</div>
