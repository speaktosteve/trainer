<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeeklyPlan, WeeklySummary, ExerciseLog, ExerciseEntry } from '$lib/types';
	import SummaryBanner from '$lib/components/SummaryBanner.svelte';
	import DayPlan from '$lib/components/DayPlan.svelte';
	import PlanEditor from '$lib/components/PlanEditor.svelte';

	let plan = $state<WeeklyPlan | null>(null);
	let summary = $state<WeeklySummary | null>(null);
	let completedExercises = $state<Record<string, Record<string, ExerciseEntry>>>({});
	let loading = $state(true);

	// Next-plan flow
	let nextPlan = $state<WeeklyPlan | null>(null);
	let showEditor = $state(false);
	let editingCurrentPlan = $state(false);
	let generating = $state(false);
	let generateError = $state<string | null>(null);

	function normalizeDayKey(day: string): string {
		return day.trim().toLowerCase();
	}

	onMount(async () => {
		const planRes = await fetch('/data/plans');

		if (planRes.ok) {
			plan = await planRes.json();
			summary = plan?.summary ?? null;
		}

		// Load completed exercises for this week
		if (plan) {
			const logsRes = await fetch(`/data/exercises?weekStart=${plan.weekStart}`);
			if (logsRes.ok) {
				const logs: ExerciseLog[] = await logsRes.json();
				for (const log of logs) {
					const key = normalizeDayKey(log.day);
					if (!completedExercises[key]) completedExercises[key] = {};
					for (const ex of log.exercises) {
						completedExercises[key][ex.name] = ex;
					}
				}
			}

			const pendingPlanRes = await fetch(`/data/plans/next?sourceWeek=${plan.weekStart}`);
			if (pendingPlanRes.ok) {
				nextPlan = await pendingPlanRes.json();
				showEditor = nextPlan !== null;
			}
		}

		loading = false;
	});

	async function handleExerciseComplete(log: ExerciseLog) {
		const res = await fetch('/data/exercises', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(log)
		});

		if (res.ok) {
			const key = normalizeDayKey(log.day);
			if (!completedExercises[key]) completedExercises[key] = {};
			for (const ex of log.exercises) {
				completedExercises[key][ex.name] = ex;
			}
		}
	}

	async function handleExerciseUndo(day: string, exerciseName: string) {
		if (!plan) return;
		const params = new URLSearchParams({ weekStart: plan.weekStart, day, name: exerciseName });
		const res = await fetch(`/data/exercises?${params}`, { method: 'DELETE' });

		if (res.ok) {
			const dayKey = normalizeDayKey(day);
			if (completedExercises[dayKey]) {
				delete completedExercises[dayKey][exerciseName];
			}
		}
	}

	const totalExercises = $derived(
		plan ? plan.sessions.reduce((sum, s) => sum + s.exercises.length, 0) : 0
	);
	const totalCompleted = $derived(
		Object.values(completedExercises).reduce((sum, map) => sum + Object.keys(map).length, 0)
	);

	async function generateNextPlan() {
		if (!plan) return;
		generating = true;
		generateError = null;
		const res = await fetch('/data/plans/next', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sourceWeek: plan.weekStart })
		});

		if (res.ok) {
			nextPlan = await res.json();
			showEditor = true;
		} else {
			const data = await res.json();
			if (res.status === 409 && data.plan) {
				nextPlan = data.plan;
				showEditor = true;
			} else {
				generateError = data.error ?? 'Failed to generate next plan';
			}
		}
		generating = false;
	}

	async function saveNextPlan(edited: WeeklyPlan) {
		const res = await fetch('/data/plans', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(edited)
		});

		if (res.ok) {
			showEditor = false;
			nextPlan = null;
			// Reload to show the new plan if we're now in its week
			plan = edited;
			summary = edited.summary ?? null;
			completedExercises = {};
		}
	}

	async function addExerciseToDay(day: string, exercise: ExerciseEntry): Promise<string | null> {
		if (!plan) return 'No active plan loaded';

		const updatedPlan: WeeklyPlan = {
			...plan,
			sessions: plan.sessions.map((session) =>
				session.day === day
					? { ...session, exercises: [...session.exercises, exercise] }
					: session
			)
		};

		const res = await fetch('/data/plans', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updatedPlan)
		});

		if (!res.ok) {
			let message = 'Failed to add exercise';
			try {
				const data = await res.json();
				message = data.error ?? message;
			} catch {
				// Keep fallback message if error response is not JSON
			}
			return message;
		}

		plan = updatedPlan;
		return null;
	}

	function cancelCurrentPlanEdit() {
		editingCurrentPlan = false;
	}

	async function saveCurrentPlan(edited: WeeklyPlan) {
		const res = await fetch('/data/plans', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(edited)
		});

		if (res.ok) {
			plan = edited;
			summary = edited.summary ?? null;
			editingCurrentPlan = false;
		}
	}

	async function discardNextPlan() {
		if (!plan) return;
		const params = new URLSearchParams({ sourceWeek: plan.weekStart });
		const res = await fetch(`/data/plans/next?${params}`, { method: 'DELETE' });

		if (res.ok) {
			showEditor = false;
			nextPlan = null;
		}
	}
</script>

<svelte:head>
	<title>This Week's Plan — Trainer</title>
</svelte:head>

{#if editingCurrentPlan && plan}
	<PlanEditor
		plan={plan}
		title="Edit This Week's Plan"
		description="Adjust or add exercises for the current week."
		saveLabel="Save This Week"
		discardLabel="Cancel"
		onSave={saveCurrentPlan}
		onDiscard={cancelCurrentPlanEdit}
	/>
{:else if showEditor && nextPlan}
	<PlanEditor
		plan={nextPlan}
		previousResults={completedExercises}
		onSave={saveNextPlan}
		onDiscard={discardNextPlan}
	/>
{:else}
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-xl font-bold text-base-content md:text-2xl">This Week's Plan</h1>
		{#if plan}
			<div>
				<span class="badge badge-primary">
					w/c {plan.weekStart}
				</span>
			</div>
		{/if}
	</div>

	<SummaryBanner {summary} />

	{#if loading}
		<div class="space-y-3">
			{#each Array(4) as _, i (i)}
				<div class="h-20 animate-pulse rounded-xl bg-base-300"></div>
			{/each}
		</div>
	{:else if plan}
		<div class="space-y-3 md:grid md:gap-4 md:space-y-0">
			{#each plan.sessions as session (session.day)}
				<DayPlan
					{session}
					weekStart={plan.weekStart}
					completedExercises={completedExercises[normalizeDayKey(session.day)] ?? {}}
					onExerciseComplete={handleExerciseComplete}
					onExerciseUndo={handleExerciseUndo}
					onAddNew={addExerciseToDay}
				/>
			{/each}
		</div>

		<!-- Next week plan button -->
		<div class="mt-6">
			{#if generateError}
				<div class="alert alert-error mb-3">
					<div>
						<p class="font-medium">Plan generation failed</p>
						<p class="mt-1 text-xs">{generateError}</p>
						<button
							class="mt-2 text-xs font-medium underline"
							onclick={() => (generateError = null)}
						>Dismiss</button>
					</div>
				</div>
			{/if}
			<button
				class="btn btn-primary btn-block"
				disabled={generating}
				onclick={generateNextPlan}
			>
				{#if generating}
					<span class="loading loading-spinner loading-sm"></span>
					Generating…
				{:else}
					Plan Next Week ({totalCompleted}/{totalExercises} done)
				{/if}
			</button>
			<p class="mt-1 text-center text-xs text-base-content/40">
				Builds next week's plan from this week's results
			</p>
		</div>
	{:else}
		<div class="card bg-base-100 p-8 text-center text-base-content/60 shadow-sm">
			<p class="text-lg">No plan for this week</p>
			<p class="mt-1 text-sm">Plans can be created via the API</p>
		</div>
	{/if}
{/if}
