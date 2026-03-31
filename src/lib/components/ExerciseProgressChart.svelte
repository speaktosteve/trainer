<script lang="ts">
	import { onMount } from "svelte";
	import { Chart, registerables } from "chart.js";

	interface DataPoint {
		label: string;
		weight?: number;
		reps: number[];
	}

	let { points }: { points: DataPoint[] } = $props();

	let canvas = $state<HTMLCanvasElement | undefined>(undefined);
	let chart: Chart | null = null;

	Chart.register(...registerables);

	const useWeight = $derived(points.some((p) => p.weight != null && p.weight > 0));

	function renderChart() {
		if (chart) chart.destroy();
		if (!canvas || points.length === 0) return;

		const values = points.map((p) =>
			useWeight ? (p.weight ?? 0) : p.reps.reduce((a, b) => a + b, 0)
		);
		const yLabel = useWeight ? "Weight (kg)" : "Total Reps";

		chart = new Chart(canvas, {
			type: "line",
			data: {
				labels: points.map((p) => p.label),
				datasets: [
					{
						label: yLabel,
						data: values,
						borderColor: "#3b82f6",
						backgroundColor: "rgba(59, 130, 246, 0.1)",
						fill: true,
						tension: 0.3,
						pointRadius: 5,
						pointBackgroundColor: "#3b82f6",
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						suggestedMin: Math.min(...values) * 0.9,
						suggestedMax: Math.max(...values) * 1.05,
						ticks: {
							callback: (v) => (useWeight ? `${v} kg` : `${v}`),
						},
					},
					x: {
						ticks: { font: { size: 11 } },
					},
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: (ctx) => {
								const p = points[ctx.dataIndex];
								const repsStr = p.reps.join("·");
								if (useWeight) return `${p.weight}kg × ${repsStr}`;
								return `${repsStr} reps`;
							},
						},
					},
				},
			},
		});
	}

	onMount(() => {
		renderChart();
		return () => chart?.destroy();
	});

	$effect(() => {
		if (points && canvas) renderChart();
	});
</script>

<div class="h-44 w-full">
	{#if points.length === 0}
		<div class="flex h-full items-center justify-center text-sm text-base-content/40">No data</div>
	{:else}
		<canvas bind:this={canvas}></canvas>
	{/if}
</div>
