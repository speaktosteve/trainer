<script lang="ts">
	import { onMount } from 'svelte';
	import type { ExerciseLog, BodyweightEntry } from '$lib/types';
	import WeightChart from '$lib/components/WeightChart.svelte';

	type Tab = 'exercises' | 'weight';
	let activeTab = $state<Tab>('exercises');
	let exerciseLogs = $state<ExerciseLog[]>([]);
	let weightEntries = $state<BodyweightEntry[]>([]);
	let loading = $state(true);

	// Weight entry form
	let newWeightDate = $state(new Date().toISOString().slice(0, 10));
	let newWeight = $state<number | undefined>(undefined);
	let saving = $state(false);

	onMount(async () => {
		const [exRes, wtRes] = await Promise.all([
			fetch('/data/exercises?limit=50'),
			fetch('/data/weight')
		]);

		if (exRes.ok) exerciseLogs = await exRes.json();
		if (wtRes.ok) weightEntries = await wtRes.json();
		loading = false;
	});

	async function handleLogWeight() {
		if (!newWeight || !newWeightDate) return;
		saving = true;

		const entry: BodyweightEntry = { date: newWeightDate, weight: newWeight };
		const res = await fetch('/data/weight', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(entry)
		});

		if (res.ok) {
			// Insert in sorted position
			const idx = weightEntries.findIndex((e) => e.date > entry.date);
			if (idx === -1) {
				weightEntries = [...weightEntries, entry];
			} else {
				weightEntries = [
					...weightEntries.slice(0, idx),
					entry,
					...weightEntries.slice(idx)
				];
			}
			newWeight = undefined;
		}
		saving = false;
	}

	function formatReps(reps: number[]): string {
		return reps.join(', ');
	}

	// Group exercise logs by completedDate
	const groupedLogs = $derived(() => {
		const groups = new Map<string, ExerciseLog[]>();
		for (const log of exerciseLogs) {
			const key = log.completedDate;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(log);
		}
		return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
	});
</script>

<svelte:head>
	<title>History — Gym Tracker</title>
</svelte:head>

<h1 class="mb-4 text-xl font-bold text-gray-900">History</h1>

<!-- Tab Toggle -->
<div class="mb-4 flex rounded-lg bg-gray-200 p-1">
	<button
		class="flex-1 rounded-md py-2 text-sm font-medium transition-colors {activeTab === 'exercises'
			? 'bg-white text-gray-900 shadow-sm'
			: 'text-gray-500'}"
		style="min-height: 44px;"
		onclick={() => (activeTab = 'exercises')}
	>
		Exercise History
	</button>
	<button
		class="flex-1 rounded-md py-2 text-sm font-medium transition-colors {activeTab === 'weight'
			? 'bg-white text-gray-900 shadow-sm'
			: 'text-gray-500'}"
		style="min-height: 44px;"
		onclick={() => (activeTab = 'weight')}
	>
		Weight Chart
	</button>
</div>

{#if loading}
	<div class="space-y-3">
		{#each Array(3) as _}
			<div class="h-24 animate-pulse rounded-xl bg-gray-200"></div>
		{/each}
	</div>
{:else if activeTab === 'exercises'}
	{#if groupedLogs().length === 0}
		<div class="rounded-xl bg-white p-8 text-center text-gray-500">
			<p>No exercise history yet</p>
			<p class="mt-1 text-sm">Complete exercises from the Plan screen to see them here</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each groupedLogs() as [date, logs]}
				<div>
					<h3 class="mb-2 text-sm font-semibold text-gray-600">{date}</h3>
					<div class="space-y-2">
						{#each logs as log}
							<div class="rounded-lg border border-gray-200 bg-white p-3">
								<h4 class="text-sm font-bold text-gray-900">
									{log.label} ({log.day})
								</h4>
								{#each log.exercises as ex}
									<div class="mt-1 text-xs text-gray-600">
										<span class="font-medium">{ex.name}</span>:
										{formatReps(ex.actualReps ?? ex.targetReps)}
										{#if ex.actualWeight !== undefined}
											@ {ex.actualWeight} kg
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
{:else}
	<!-- Weight Chart + Entry Form -->
	<div class="rounded-xl border border-gray-200 bg-white p-4">
		<h3 class="mb-3 text-sm font-semibold text-gray-700">Bodyweight Trend</h3>
		<WeightChart entries={weightEntries} />
	</div>

	<div class="mt-4 rounded-xl border border-gray-200 bg-white p-4">
		<h3 class="mb-3 text-sm font-semibold text-gray-700">Log Bodyweight</h3>
		<form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); handleLogWeight(); }}>
			<input
				type="date"
				bind:value={newWeightDate}
				class="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
			/>
			<input
				type="number"
				step="0.1"
				placeholder="kg"
				bind:value={newWeight}
				class="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
			/>
			<button
				type="submit"
				disabled={saving || !newWeight}
				class="min-h-[44px] rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 active:bg-blue-600"
			>
				{saving ? '...' : 'Log'}
			</button>
		</form>
	</div>

	{#if weightEntries.length > 0}
		<div class="mt-4 rounded-xl border border-gray-200 bg-white p-4">
			<h3 class="mb-2 text-sm font-semibold text-gray-700">All Entries</h3>
			<div class="space-y-1">
				{#each [...weightEntries].reverse() as entry}
					<div class="flex justify-between text-sm text-gray-600">
						<span>{entry.date}</span>
						<span class="font-medium">{entry.weight} kg</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/if}
