<script lang="ts">
	import '../app.css';
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-50 pb-20">
	<div class="mx-auto max-w-md px-4 py-4">
		{@render children()}
	</div>
	<BottomNav />
</div>
