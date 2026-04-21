<script lang="ts">
	import { onMount } from 'svelte';
	import type { PlannedSession, ExerciseEntry, ExerciseLog } from '$lib/types';
	import ExerciseCard from './ExerciseCard.svelte';

	let {
		session,
		weekStart,
		completedExercises = {},
		onExerciseComplete,
		onExerciseUndo,
		onAddNew
	}: {
		session: PlannedSession;
		weekStart: string;
		completedExercises?: Record<string, ExerciseEntry>;
		onExerciseComplete?: (log: ExerciseLog) => void;
		onExerciseUndo?: (day: string, exerciseName: string) => void;
		onAddNew?: (day: string, exercise: ExerciseEntry) => Promise<string | null>;
	} = $props();

	let expanded = $state(false);
	let showAddForm = $state(false);
	let catalogNames = $state<string[]>([]);
	let catalogLoading = $state(false);
	let catalogError = $state<string | null>(null);
	let addMode = $state<'existing' | 'new'>('existing');
	let selectedCatalogName = $state('');
	let addCustomName = $state('');
	let addWeight = $state('');
	let addReps = $state('8,8,8');
	let addNotes = $state('');
	let addError = $state<string | null>(null);
	let addSaving = $state(false);

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

	const completedCount = $derived(
		session.exercises.filter((ex) => ex.name in completedExercises).length
	);
	const allDone = $derived(completedCount === session.exercises.length);

	function handleExerciseComplete(exercise: ExerciseEntry, actual: ExerciseEntry) {
		if (onExerciseComplete) {
			onExerciseComplete({
				day: session.day,
				label: session.label,
				completedDate: new Date().toISOString().slice(0, 10),
				weekStart,
				exercises: [actual],
				sessionNotes: session.sessionNotes
			});
		}
	}

	function parseReps(value: string): number[] {
		return value
			.split(',')
			.map((part) => Number.parseInt(part.trim(), 10))
			.filter((n) => Number.isFinite(n) && n > 0);
	}

	function resetAddForm() {
		addMode = 'existing';
		selectedCatalogName = catalogNames[0] ?? '';
		addCustomName = '';
		addWeight = '';
		addReps = '8,8,8';
		addNotes = '';
		addError = null;
		addSaving = false;
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
			if (!selectedCatalogName || !catalogNames.includes(selectedCatalogName)) {
				selectedCatalogName = catalogNames[0] ?? '';
			}
		} finally {
			catalogLoading = false;
		}
	}

	function openAddForm() {
		showAddForm = true;
		resetAddForm();
		void loadExerciseCatalog();
	}

	async function submitAddExercise() {
		if (!onAddNew) return;

		const name = addMode === 'new' ? addCustomName.trim() : selectedCatalogName.trim();
		if (!name) {
			addError = 'Exercise name is required';
			return;
		}

		const exists = session.exercises.some((ex) => ex.name.toLowerCase() === name.toLowerCase());
		if (exists) {
			addError = 'That exercise already exists for this day';
			return;
		}

		const targetReps = parseReps(addReps);
		if (targetReps.length === 0) {
			addError = 'Enter reps as comma-separated positive numbers, e.g. 8,8,8';
			return;
		}

		const weightText = addWeight.trim();
		let targetWeight: number | undefined;
		if (weightText) {
			const parsed = Number(weightText);
			if (!Number.isFinite(parsed) || parsed < 0) {
				addError = 'Weight must be a valid non-negative number';
				return;
			}
			targetWeight = parsed;
		}

		addError = null;
		addSaving = true;
		const error = await onAddNew(session.day, {
			name,
			targetReps,
			targetWeight,
			notes: addNotes.trim() || undefined
		});
		addSaving = false;

		if (error) {
			addError = error;
			return;
		}

		if (addMode === 'new' && !catalogNames.includes(name)) {
			catalogNames = [...catalogNames, name].sort((a, b) => a.localeCompare(b));
		}

		showAddForm = false;
		resetAddForm();
	}

	onMount(() => {
		resetAddForm();
	});
</script>

<div class="card card-border bg-base-100 shadow-sm">
	<button
		class="flex w-full items-center justify-between p-4 text-left"
		style="min-height: 44px;"
		onclick={() => (expanded = !expanded)}
	>
		<div>
			<h3 class="text-sm font-bold text-base-content">
				{getDayLabel(session.day)} — {session.label}
			</h3>
			<p class="mt-0.5 text-xs text-base-content/60">
				{session.exercises.length} exercises · {completedCount}/{session.exercises.length} done
			</p>
			{#if session.sessionNotes}
				<p class="mt-1 text-xs italic text-warning">⚠️ {session.sessionNotes}</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			{#if allDone}
				<span class="badge badge-success badge-sm">✓</span>
			{/if}
			<span class="text-base-content/40 transition-transform {expanded ? 'rotate-180' : ''}"
				>▾</span
			>
		</div>
	</button>

	{#if expanded}
		<div class="space-y-2 border-t border-base-300 p-4 pt-3">
			{#each session.exercises as exercise (exercise.name)}
				{@const actualData = completedExercises[exercise.name]}
				<ExerciseCard
					exercise={actualData ? { ...exercise, actualWeight: actualData.actualWeight, actualReps: actualData.actualReps } : exercise}
					completed={exercise.name in completedExercises}
					onComplete={(actual) => handleExerciseComplete(exercise, actual)}
					onUndo={onExerciseUndo ? () => onExerciseUndo(session.day, exercise.name) : undefined}
				/>
			{/each}

			{#if onAddNew}
				<div class="pt-1">
					{#if showAddForm}
						<div class="rounded-lg border border-base-300 bg-base-200/50 p-3">
							{#if catalogError}
								<p class="mb-2 text-xs text-error">{catalogError}</p>
							{/if}
							<div class="mb-2 flex flex-wrap gap-2 text-xs">
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
							<div class="grid gap-2 md:grid-cols-2">
								{#if addMode === 'existing'}
									<label class="form-control">
										<span class="label-text text-xs">Exercise name</span>
										<select
											class="select select-bordered select-sm"
											disabled={catalogLoading || catalogNames.length === 0}
											bind:value={selectedCatalogName}
										>
											{#if catalogNames.length === 0}
												<option value="">No exercises yet</option>
											{:else}
												{#each catalogNames as catalogName (catalogName)}
													<option value={catalogName}>{catalogName}</option>
												{/each}
											{/if}
										</select>
									</label>
								{:else}
									<label class="form-control">
										<span class="label-text text-xs">New exercise name</span>
										<input
											class="input input-bordered input-sm"
											bind:value={addCustomName}
											placeholder="e.g. Incline DB Press"
										/>
									</label>
								{/if}
								<label class="form-control">
									<span class="label-text text-xs">Target weight (kg)</span>
									<input
										class="input input-bordered input-sm"
										bind:value={addWeight}
										placeholder="optional"
										type="number"
										step="0.5"
										min="0"
									/>
								</label>
								<label class="form-control">
									<span class="label-text text-xs">Target reps</span>
									<input
										class="input input-bordered input-sm"
										bind:value={addReps}
										placeholder="8,8,8"
									/>
								</label>
								<label class="form-control md:col-span-2">
									<span class="label-text text-xs">Notes</span>
									<input
										class="input input-bordered input-sm"
										bind:value={addNotes}
										placeholder="optional"
									/>
								</label>
							</div>

							{#if addError}
								<p class="mt-2 text-xs text-error">{addError}</p>
							{/if}

							<div class="mt-3 flex items-center gap-2">
								<button class="btn btn-primary btn-sm" disabled={addSaving} onclick={submitAddExercise}>
									{#if addSaving}
										<span class="loading loading-spinner loading-xs"></span>
										Saving...
									{:else}
										Add Exercise
									{/if}
								</button>
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => {
										showAddForm = false;
										resetAddForm();
									}}
								>Cancel</button>
							</div>
						</div>
					{:else}
						<button class="btn btn-outline btn-sm" onclick={openAddForm}>Add New</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
