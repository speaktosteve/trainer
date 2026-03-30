<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeeklyPlan, WeeklySummary, ExerciseLog } from '$lib/types';
	import SummaryBanner from '$lib/components/SummaryBanner.svelte';
	import DayPlan from '$lib/components/DayPlan.svelte';
	import PlanEditor from '$lib/components/PlanEditor.svelte';

	let plan = $state<WeeklyPlan | null>(null);
	let summary = $state<WeeklySummary | null>(null);
	let completedExercises = $state<Record<string, string[]>>({});
	let loading = $state(true);

	// Next-plan flow
	let nextPlan = $state<WeeklyPlan | null>(null);
	let showEditor = $state(false);
	let generating = $state(false);
	let saving = $state(false);
	let generateError = $state<string | null>(null);

	onMount(async () => {
		const planRes = await fetch('/data/plans');

		if (planRes.ok) {
			plan = await planRes.json();
			summary = plan?.summary ?? null;
		}

		// Load completed exercises for this week
		if (plan) {
			const logsRes = await fetch(`/data/exercises?from=${plan.weekStart}`);
			if (logsRes.ok) {
				const logs: ExerciseLog[] = await logsRes.json();
				for (const log of logs) {
					const key = log.day;
					if (!completedExercises[key]) completedExercises[key] = [];
					for (const ex of log.exercises) {
						if (!completedExercises[key].includes(ex.name)) {
							completedExercises[key].push(ex.name);
						}
					}
				}
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
			const key = log.day;
			if (!completedExercises[key]) completedExercises[key] = [];
			for (const ex of log.exercises) {
				if (!completedExercises[key].includes(ex.name)) {
					completedExercises[key].push(ex.name);
				}
			}
		}
	}

	async function handleExerciseUndo(day: string, exerciseName: string) {
		if (!plan) return;
		const params = new URLSearchParams({ weekStart: plan.weekStart, day, name: exerciseName });
		const res = await fetch(`/data/exercises?${params}`, { method: 'DELETE' });

		if (res.ok) {
			completedExercises[day] = (completedExercises[day] ?? []).filter((n) => n !== exerciseName);
		}
	}

	const totalExercises = $derived(
		plan ? plan.sessions.reduce((sum, s) => sum + s.exercises.length, 0) : 0
	);
	const totalCompleted = $derived(
		Object.values(completedExercises).reduce((sum, names) => sum + names.length, 0)
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
		saving = true;
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
			completedExercises = {};
		}
		saving = false;
	}
</script>

<svelte:head>
	<title>This Week's Plan — Trainer</title>
</svelte:head>

{#if showEditor && nextPlan}
	<PlanEditor
		plan={nextPlan}
		onSave={saveNextPlan}
		onCancel={() => { showEditor = false; nextPlan = null; }}
	/>
{:else}
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-xl font-bold text-gray-900 md:text-2xl">This Week's Plan</h1>
		{#if plan}
			<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
				w/c {plan.weekStart}
			</span>
		{/if}
	</div>

	<SummaryBanner {summary} />

	{#if loading}
		<div class="space-y-3">
			{#each Array(4) as _}
				<div class="h-20 animate-pulse rounded-xl bg-gray-200"></div>
			{/each}
		</div>
	{:else if plan}
		<div class="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
			{#each plan.sessions as session}
				<DayPlan
					{session}
					weekStart={plan.weekStart}
					completedExercises={completedExercises[session.day] ?? []}
					onExerciseComplete={handleExerciseComplete}
					onExerciseUndo={handleExerciseUndo}
				/>
			{/each}
		</div>

		<!-- Next week plan button -->
		<div class="mt-6">
			{#if generateError}
				<div class="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
					<p class="font-medium">Plan generation failed</p>
					<p class="mt-1 text-xs text-red-600">{generateError}</p>
					<button
						class="mt-2 text-xs font-medium text-red-500 underline"
						onclick={() => (generateError = null)}
					>Dismiss</button>
				</div>
			{/if}
			<button
				class="cursor-pointer min-h-[44px] w-full rounded-lg bg-indigo-500 py-3 text-sm font-semibold text-white active:bg-indigo-600 disabled:opacity-50"
				disabled={generating}
				onclick={generateNextPlan}
			>
				{#if generating}
					Generating…
				{:else}
					Plan Next Week ({totalCompleted}/{totalExercises} done)
				{/if}
			</button>
			<p class="mt-1 text-center text-xs text-gray-400">
				Copies this week's plan with smart weight progression
			</p>
		</div>
	{:else}
		<div class="rounded-xl bg-white p-8 text-center text-gray-500 shadow-sm">
			<p class="text-lg">No plan for this week</p>
			<p class="mt-1 text-sm">Plans can be created via the API</p>
		</div>
	{/if}
{/if}
