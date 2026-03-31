<script lang="ts">
	import type { PlannedSession, ExerciseEntry, ExerciseLog } from '$lib/types';
	import ExerciseCard from './ExerciseCard.svelte';

	let {
		session,
		weekStart,
		completedExercises = [],
		onExerciseComplete,
		onExerciseUndo
	}: {
		session: PlannedSession;
		weekStart: string;
		completedExercises?: string[];
		onExerciseComplete?: (log: ExerciseLog) => void;
		onExerciseUndo?: (day: string, exerciseName: string) => void;
	} = $props();

	let expanded = $state(false);

	const dayLabels: Record<string, string> = {
		monday: 'Monday',
		tuesday: 'Tuesday',
		wednesday: 'Wednesday',
		friday: 'Friday'
	};

	const completedCount = $derived(
		session.exercises.filter((ex) => completedExercises.includes(ex.name)).length
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
</script>

<div class="card card-border bg-base-100 shadow-sm">
	<button
		class="flex w-full items-center justify-between p-4 text-left"
		style="min-height: 44px;"
		onclick={() => (expanded = !expanded)}
	>
		<div>
			<h3 class="text-sm font-bold text-base-content">
				{dayLabels[session.day]} — {session.label}
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
			{#each session.exercises as exercise}
				<ExerciseCard
					{exercise}
					completed={completedExercises.includes(exercise.name)}
					onComplete={(actual) => handleExerciseComplete(exercise, actual)}
					onUndo={onExerciseUndo ? () => onExerciseUndo(session.day, exercise.name) : undefined}
				/>
			{/each}
		</div>
	{/if}
</div>
