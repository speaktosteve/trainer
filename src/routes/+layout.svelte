<script lang="ts">
	import '../app.css';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { env } from '$env/dynamic/public';

	let { children, data } = $props();

	const appVersion = $derived(data.version);
	const deployedAt = $derived(env.PUBLIC_DEPLOYED_AT ?? 'Local development');
</script>

<div class="min-h-screen bg-base-200 pb-20">
	<div class="mx-auto max-w-md px-4 py-4 md:max-w-2xl lg:max-w-4xl">
		{@render children()}
	</div>
	<footer class="px-4 pb-3 text-center text-[0.65rem] leading-4 text-base-content/40">
		v{appVersion} · Deployed {deployedAt}
	</footer>
	<BottomNav />
</div>
