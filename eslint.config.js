import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs["flat/recommended"],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	{
		files: ["**/*.svelte"],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
		rules: {
			// No base path is configured in svelte.config.js, so plain hrefs are fine
			"svelte/no-navigation-without-resolve": "off",
			// Set/Map inside $derived callbacks and regular functions are local variables,
			// not reactive state — SvelteSet/SvelteMap would add overhead with no benefit
			"svelte/prefer-svelte-reactivity": "off",
		},
	},
	{
		rules: {
			// Allow _ prefix for intentionally unused variables and arguments
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
		},
	},
	{
		// Test files use mock casting patterns that require 'any' workarounds
		files: ["tests/**/*.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		ignores: [".svelte-kit/**", "build/**", "dist/**"],
	}
);
