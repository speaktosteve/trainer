<script lang="ts">
	import type { WeeklySummary } from '$lib/types';

	let {
		summary,
		showNarrativeSentence = false
	}: {
		summary: WeeklySummary | null;
		showNarrativeSentence?: boolean;
	} = $props();
	let open = $state(false);

	function buildNarrativeSentence(summary: WeeklySummary): string {
		const providedText = summary.text?.trim();
		if (providedText) return providedText;

		if (summary.lines.length === 0) return summary.text;
		const details = summary.lines
			.map((line) => line.detail.trim())
			.filter((detail) => detail.length > 0)
			.map((detail) => detail.replace(/[.!?]+$/g, ''));

		if (details.length === 0) return summary.text;
		if (details.length === 1) return `Overall, ${details[0].toLowerCase()}.`;

		const leading = details.slice(0, -1).map((detail) => detail.toLowerCase()).join(', ');
		const ending = details.at(-1)?.toLowerCase() ?? '';
		return `Overall, ${leading}, and ${ending}.`;
	}
</script>

{#if summary}
	<button
		type="button"
		class="mb-4 w-full rounded-xl bg-primary p-4 text-left text-primary-content shadow-md transition-all"
		onclick={() => (open = !open)}
	>
		<div class="flex items-center justify-between">
			<p class="text-sm font-semibold">{summary.headline}</p>
			<span class="text-xs transition-transform {open ? 'rotate-180' : ''}">▼</span>
		</div>
		{#if showNarrativeSentence}
			<p class="mt-2 text-xs leading-snug text-primary-content/85">{buildNarrativeSentence(summary)}</p>
		{/if}
		{#if open && summary.lines.length > 0}
			<div class="mt-2 space-y-1">
				{#each summary.lines as line (`${line.label}-${line.detail}`)}
					<div class="flex items-start gap-2 text-xs leading-snug text-primary-content/80">
						<span class="shrink-0">{line.icon}</span>
						<span><span class="font-medium text-primary-content">{line.label}</span> {line.detail}</span>
					</div>
				{/each}
			</div>
		{/if}
	</button>
{:else}
	<div class="mb-4 rounded-xl bg-base-300 p-3 text-base-content/50 shadow-sm">
		<p class="text-sm italic">No generated summary available</p>
	</div>
{/if}
