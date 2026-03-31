<script lang="ts">
	import { onMount } from 'svelte';
	import type { BodyweightEntry } from '$lib/types';
	import { Chart, registerables } from 'chart.js';

	let { entries }: { entries: BodyweightEntry[] } = $props();

	let canvas: HTMLCanvasElement;
	let chart: Chart | null = null;

	Chart.register(...registerables);

	function renderChart() {
		if (chart) chart.destroy();
		if (!canvas || entries.length === 0) return;

		chart = new Chart(canvas, {
			type: 'line',
			data: {
				labels: entries.map((e) => e.date),
				datasets: [
					{
						label: 'Weight (kg)',
						data: entries.map((e) => e.weight),
						borderColor: '#3b82f6',
						backgroundColor: 'rgba(59, 130, 246, 0.1)',
						fill: true,
						tension: 0.3,
						pointRadius: 4,
						pointBackgroundColor: '#3b82f6'
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						suggestedMin: Math.min(...entries.map((e) => e.weight)) - 1,
						suggestedMax: Math.max(...entries.map((e) => e.weight)) + 1,
						ticks: { callback: (v) => `${v} kg` }
					},
					x: {
						ticks: {
							maxRotation: 45,
							font: { size: 10 }
						}
					}
				},
				plugins: {
					legend: { display: false }
				}
			}
		});
	}

	onMount(() => {
		renderChart();
		return () => chart?.destroy();
	});

	$effect(() => {
		// Re-render when entries change
		if (entries && canvas) renderChart();
	});
</script>

<div class="h-48 w-full">
	{#if entries.length === 0}
		<div class="flex h-full items-center justify-center text-sm text-base-content/40">
			No weight entries yet
		</div>
	{:else}
		<canvas bind:this={canvas}></canvas>
	{/if}
</div>
