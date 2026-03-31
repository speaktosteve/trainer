import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "jsdom",
		globals: true,
		alias: {
			$lib: new URL("./src/lib", import.meta.url).pathname,
			"$env/static/private": new URL("./tests/__mocks__/env.ts", import.meta.url).pathname,
			"$env/dynamic/private": new URL("./tests/__mocks__/env.ts", import.meta.url).pathname,
		},
	},
});
