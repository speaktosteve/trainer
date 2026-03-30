<script lang="ts">
	import type { WeeklySummary } from '$lib/types';

	let { summary }: { summary: WeeklySummary | null } = $props();
	let open = $state(false);
</script>

{#if summary}
	<button
		type="button"
		class="mb-4 w-full rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-left text-white shadow-md transition-all"
		onclick={() => (open = !open)}
	>
		<div class="flex items-center justify-between">
			<p class="text-sm font-semibold">{summary.headline}</p>
			<span class="text-xs transition-transform {open ? 'rotate-180' : ''}">▼</span>
		</div>
		{#if open && summary.lines.length > 0}
			<div class="mt-2 space-y-1">
				{#each summary.lines as line}
					<div class="flex items-start gap-2 text-xs leading-snug text-white/90">
						<span class="shrink-0">{line.icon}</span>
						<span><span class="font-medium text-white">{line.label}</span> {line.detail}</span>
					</div>
				{/each}
			</div>
		{/if}
	</button>
{:else}
	<div class="mb-4 rounded-xl bg-gray-200 p-4 text-gray-500 shadow-sm">
		<p class="text-sm">Loading weekly summary...</p>
	</div>
{/if}
