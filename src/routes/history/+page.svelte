<script lang="ts">
	import { onMount } from 'svelte';
	import type { ExerciseLog, BodyweightEntry, ExerciseEntry } from '$lib/types';
	import WeightChart from '$lib/components/WeightChart.svelte';
	import ExerciseProgressChart from '$lib/components/ExerciseProgressChart.svelte';

	type Tab = 'exercises' | 'weight';
	let activeTab = $state<Tab>('exercises');
	let exerciseLogs = $state<ExerciseLog[]>([]);
	let weightEntries = $state<BodyweightEntry[]>([]);
	let loading = $state(true);

	// Weight entry form
	let newWeightDate = $state(new Date().toISOString().slice(0, 10));
	let newWeight = $state<number | undefined>(undefined);
	let saving = $state(false);
	let expandedExercise = $state<string | null>(null);

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

	// Build a table: exercises (rows) × weeks (columns)
	interface CellData {
		weight?: number;
		reps: number[];
	}

	const weeks = $derived(() => {
		const set = new Set<string>();
		for (const log of exerciseLogs) set.add(log.weekStart);
		return Array.from(set).sort();
	});

	const exerciseNames = $derived(() => {
		const seen = new Set<string>();
		const names: string[] = [];
		// Preserve order from most recent logs first
		for (const log of exerciseLogs) {
			for (const ex of log.exercises) {
				if (!seen.has(ex.name)) {
					seen.add(ex.name);
					names.push(ex.name);
				}
			}
		}
		return names;
	});

	// Map: "exerciseName|weekStart" → CellData (best effort per exercise per week)
	const cellMap = $derived(() => {
		const map = new Map<string, CellData>();
		for (const log of exerciseLogs) {
			for (const ex of log.exercises) {
				const key = `${ex.name}|${log.weekStart}`;
				const existing = map.get(key);
				const reps = ex.actualReps ?? ex.targetReps;
				const weight = ex.actualWeight ?? ex.targetWeight;
				// Keep the entry with highest weight, or first seen
				if (!existing || (weight && (!existing.weight || weight > existing.weight))) {
					map.set(key, { weight, reps });
				}
			}
		}
		return map;
	});

	function formatCell(cell: CellData | undefined): string {
		if (!cell) return '—';
		const repsStr = cell.reps.join('·');
		return cell.weight ? `${cell.weight}kg × ${repsStr}` : repsStr;
	}

	function formatWeekLabel(weekStart: string): string {
		const d = new Date(weekStart + 'T00:00:00');
		const day = d.getDate();
		const month = d.toLocaleDateString('en-GB', { month: 'short' });
		return `${day} ${month}`;
	}

	function exportMarkdown() {
		const lines: string[] = [];
		lines.push('# Training History');
		lines.push('');
		lines.push(`Exported: ${new Date().toISOString().slice(0, 10)}`);
		lines.push('');

		// Exercise history
		if (exerciseLogs.length > 0) {
			lines.push('## Exercise History');
			lines.push('');

			// Group by week
			const byWeek = new Map<string, typeof exerciseLogs>();
			for (const log of exerciseLogs) {
				const arr = byWeek.get(log.weekStart) ?? [];
				arr.push(log);
				byWeek.set(log.weekStart, arr);
			}

			for (const [week, logs] of [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
				lines.push(`### Week of ${week}`);
				lines.push('');
				for (const log of logs) {
					lines.push(`**${log.day} — ${log.label}** (${log.completedDate})`);
					lines.push('');
					lines.push('| Exercise | Weight (kg) | Reps |');
					lines.push('|----------|-------------|------|');
					for (const ex of log.exercises) {
						const w = ex.actualWeight ?? ex.targetWeight;
						const r = (ex.actualReps ?? ex.targetReps).join(', ');
						lines.push(`| ${ex.name} | ${w ?? 'bodyweight'} | ${r} |`);
					}
					lines.push('');
				}
			}
		}

		// Bodyweight
		if (weightEntries.length > 0) {
			lines.push('## Bodyweight Log');
			lines.push('');
			lines.push('| Date | Weight (kg) |');
			lines.push('|------|-------------|');
			for (const e of weightEntries) {
				lines.push(`| ${e.date} | ${e.weight} |`);
			}
			lines.push('');
		}

		const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `training-history-${new Date().toISOString().slice(0, 10)}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>History — Trainer</title>
</svelte:head>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-xl font-bold text-base-content md:text-2xl">History</h1>
	{#if !loading && (exerciseLogs.length > 0 || weightEntries.length > 0)}
		<button class="btn btn-ghost btn-sm" onclick={exportMarkdown} title="Export as Markdown">
			⬇ Export
		</button>
	{/if}
</div>

<!-- Tab Toggle -->
<div role="tablist" class="tabs tabs-box mb-4">
	<button
		role="tab"
		class="tab {activeTab === 'exercises' ? 'tab-active' : ''}"
		onclick={() => (activeTab = 'exercises')}
	>
		Exercise History
	</button>
	<button
		role="tab"
		class="tab {activeTab === 'weight' ? 'tab-active' : ''}"
		onclick={() => (activeTab = 'weight')}
	>
		Weight Chart
	</button>
</div>

{#if loading}
	<div class="space-y-3">
		{#each Array(3) as _}
			<div class="h-24 animate-pulse rounded-xl bg-base-300"></div>
		{/each}
	</div>
{:else if activeTab === 'exercises'}
	{#if exerciseLogs.length === 0}
		<div class="card bg-base-100 p-8 text-center text-base-content/60">
			<p>No exercise history yet</p>
			<p class="mt-1 text-sm">Complete exercises from the Plan screen to see them here</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-xl border border-base-300 bg-base-100 shadow-sm">
			<table class="table table-md">
				<thead>
					<tr>
						<th class="sticky left-0 z-10 bg-base-200">Exercise</th>
						{#each weeks() as week}
							<th class="whitespace-nowrap text-center">{formatWeekLabel(week)}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each exerciseNames() as name, i}
						<tr
							class="hover cursor-pointer"
							onclick={() => expandedExercise = expandedExercise === name ? null : name}
						>
							<td class="sticky left-0 z-10 whitespace-nowrap font-medium bg-base-100">
								<span class="mr-1 inline-block transition-transform {expandedExercise === name ? 'rotate-90' : ''}">▶</span>
								{name}
							</td>
							{#each weeks() as week}
								{@const cell = cellMap().get(`${name}|${week}`)}
								<td class="whitespace-nowrap text-center {cell ? '' : 'text-base-content/30'}">
									{formatCell(cell)}
								</td>
							{/each}
						</tr>
						{#if expandedExercise === name}
							<tr>
								<td colspan={weeks().length + 1} class="bg-base-200 px-4 py-3">
									<ExerciseProgressChart points={weeks().map(w => {
										const cell = cellMap().get(`${name}|${w}`);
										return {
											label: formatWeekLabel(w),
											weight: cell?.weight,
											reps: cell?.reps ?? []
										};
									}).filter(p => p.reps.length > 0)} />
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{:else}
	<!-- Weight Chart + Entry Form -->
	<div class="md:grid md:grid-cols-2 md:gap-4">
	<div class="card card-border bg-base-100 p-4">
		<h3 class="mb-3 text-sm font-semibold text-base-content">Bodyweight Trend</h3>
		<WeightChart entries={weightEntries} />
	</div>

	<div class="mt-4 md:mt-0 card card-border bg-base-100 p-4">
		<h3 class="mb-3 text-sm font-semibold text-base-content">Log Bodyweight</h3>
		<form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); handleLogWeight(); }}>
			<input
				type="date"
				bind:value={newWeightDate}
				class="input input-bordered input-sm flex-1"
			/>
			<input
				type="number"
				step="0.1"
				placeholder="kg"
				bind:value={newWeight}
				class="input input-bordered input-sm w-20"
			/>
			<button
				type="submit"
				disabled={saving || !newWeight}
				class="btn btn-primary btn-sm"
			>
				{saving ? '...' : 'Log'}
			</button>
		</form>
	</div>
	</div>

	{#if weightEntries.length > 0}
		<div class="mt-4 card card-border bg-base-100 p-4">
			<h3 class="mb-2 text-sm font-semibold text-base-content">All Entries</h3>
			<div class="space-y-1">
				{#each [...weightEntries].reverse() as entry}
					<div class="flex justify-between text-sm text-base-content/70">
						<span>{entry.date}</span>
						<span class="font-medium">{entry.weight} kg</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
{/if}
