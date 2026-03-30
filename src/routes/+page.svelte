<script lang="ts">
	import { onMount } from 'svelte';
	import type { WeeklyPlan, WeeklySummary, ExerciseLog } from '$lib/types';
	import SummaryBanner from '$lib/components/SummaryBanner.svelte';
	import DayPlan from '$lib/components/DayPlan.svelte';

	let plan = $state<WeeklyPlan | null>(null);
	let summary = $state<WeeklySummary | null>(null);
	let completedExercises = $state<Record<string, string[]>>({});
	let loading = $state(true);

	onMount(async () => {
		const [planRes, summaryRes] = await Promise.all([
			fetch('/data/plans'),
			fetch('/data/summary')
		]);

		if (planRes.ok) {
			plan = await planRes.json();
		}
		if (summaryRes.ok) {
			summary = await summaryRes.json();
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
</script>

<svelte:head>
	<title>This Week's Plan — Trainer</title>
</svelte:head>

<h1 class="mb-4 text-xl font-bold text-gray-900">This Week's Plan</h1>

<SummaryBanner {summary} />

{#if loading}
	<div class="space-y-3">
		{#each Array(4) as _}
			<div class="h-20 animate-pulse rounded-xl bg-gray-200"></div>
		{/each}
	</div>
{:else if plan}
	<div class="space-y-3">
		{#each plan.sessions as session}
			<DayPlan
				{session}
				weekStart={plan.weekStart}
				completedExercises={completedExercises[session.day] ?? []}
				onExerciseComplete={handleExerciseComplete}
			/>
		{/each}
	</div>
{:else}
	<div class="rounded-xl bg-white p-8 text-center text-gray-500 shadow-sm">
		<p class="text-lg">No plan for this week</p>
		<p class="mt-1 text-sm">Plans can be created via the API</p>
	</div>
{/if}
