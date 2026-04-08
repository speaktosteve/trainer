<script lang="ts">
  import { onMount } from "svelte";
  import { Chart, registerables } from "chart.js";
  import type { GoalProgressPoint } from "$lib/types";

  let {
    points,
    valueLabel,
  }: {
    points: GoalProgressPoint[];
    valueLabel: string;
  } = $props();

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let chart: Chart | null = null;

  Chart.register(...registerables);

  function renderChart() {
    if (chart) chart.destroy();
    if (!canvas || points.length === 0) return;

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: points.map((point) => point.date),
        datasets: [
          {
            label: valueLabel,
            data: points.map((point) => point.value),
            borderColor: "#14b8a6",
            backgroundColor: "rgba(20, 184, 166, 0.15)",
            fill: true,
            tension: 0.28,
            pointRadius: 4,
            pointBackgroundColor: "#14b8a6",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { font: { size: 10 } },
          },
        },
        plugins: {
          legend: { display: false },
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

<div class="h-40 w-full">
  {#if points.length === 0}
    <div class="flex h-full items-center justify-center text-sm text-base-content/40">No progress yet</div>
  {:else}
    <canvas bind:this={canvas}></canvas>
  {/if}
</div>
