<script lang="ts">
	import "../app.css";
	import BottomNav from "$lib/components/BottomNav.svelte";

	let { children } = $props();
</script>

<div class="min-h-screen bg-base-200 pb-20">
	<div class="mx-auto max-w-md px-4 py-4 md:max-w-2xl lg:max-w-4xl">
		{@render children()}
	</div>
	<BottomNav />
</div>
