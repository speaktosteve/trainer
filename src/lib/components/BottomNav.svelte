<script lang="ts">
	import { page } from '$app/state';

	const tabs = [
		{ href: '/', label: 'Plan', icon: '📋' },
		{ href: '/goals', label: 'Goals', icon: '🎯' },
		{ href: '/history', label: 'History', icon: '📊' }
	] as const;
</script>

<nav class="fixed bottom-0 left-0 right-0 z-50 border-t border-base-300 bg-base-100">
	<div class="mx-auto flex max-w-md md:max-w-2xl lg:max-w-4xl">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="flex flex-1 flex-col items-center justify-center py-3 text-xs transition-colors {page.url
					.pathname === tab.href
					? 'text-primary font-semibold'
					: 'text-base-content/50'}"
				style="min-height: 44px;"
			>
				<span class="text-lg">{tab.icon}</span>
				<span class="mt-0.5">{tab.label}</span>
			</a>
		{/each}
	</div>
</nav>
