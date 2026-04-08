<script lang="ts">
  import { onMount } from "svelte";
  import { Chart, registerables } from "chart.js";
  import type { GoalProgressPoint } from "$lib/types";

  let {
    points,
    valueLabel,
    startDate,
    targetDate,
  }: {
    points: GoalProgressPoint[];
    valueLabel: string;
    startDate?: string;
    targetDate?: string;
  } = $props();

  let canvas = $state<HTMLCanvasElement | undefined>(undefined);
  let chart: Chart | null = null;

  Chart.register(...registerables);

  function buildChartData() {
    const pointMap = new Map(points.map((p) => [p.date, p.value]));
    const dates = new Set<string>(pointMap.keys());
    if (startDate) dates.add(startDate);
    if (targetDate) dates.add(targetDate);
    const labels = [...dates].sort();
    const data = labels.map((d) => {
      if (pointMap.has(d)) return pointMap.get(d)!;
      if (d === startDate) return 0;
      return null;
    });
    return { labels, data };
  }

  function renderChart() {
    if (chart) chart.destroy();
    if (!canvas) return;
    if (points.length === 0 && !targetDate && !startDate) return;

    const { labels, data } = buildChartData();

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: valueLabel,
            data,
            spanGaps: true,
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
  {#if points.length === 0 && !startDate && !targetDate}
    <div class="flex h-full items-center justify-center text-sm text-base-content/40">No progress yet</div>
  {:else}
    <canvas bind:this={canvas}></canvas>
  {/if}
</div>
