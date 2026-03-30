<script lang="ts">
	import { page } from '$app/state';

	const tabs = [
		{ href: '/', label: 'Plan', icon: '📋' },
		{ href: '/history', label: 'History', icon: '📊' }
	] as const;
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white safe-area-inset-bottom">
	<div class="mx-auto flex max-w-md">
		{#each tabs as tab}
			<a
				href={tab.href}
				class="flex flex-1 flex-col items-center justify-center py-3 text-xs transition-colors {page.url
					.pathname === tab.href
					? 'text-blue-600 font-semibold'
					: 'text-gray-500'}"
				style="min-height: 44px;"
			>
				<span class="text-lg">{tab.icon}</span>
				<span class="mt-0.5">{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>
