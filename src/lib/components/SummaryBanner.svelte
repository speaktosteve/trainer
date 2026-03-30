<script lang="ts">
	import type { WeeklySummary } from '$lib/types';

	let { summary }: { summary: WeeklySummary | null } = $props();
</script>

{#if summary}
	<div class="mb-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-white shadow-md">
		<p class="text-sm leading-relaxed">{summary.text}</p>
	</div>
{:else}
	<div class="mb-4 rounded-xl bg-gray-200 p-4 text-gray-500 shadow-sm">
		<p class="text-sm">Loading weekly summary...</p>
	</div>
{/if}
