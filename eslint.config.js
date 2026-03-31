import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import svelteParser from "svelte-eslint-parser";
import sveltePlugin from "eslint-plugin-svelte";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";

export default [
  {
    ignores: [
      "build/**",
      ".svelte-kit/**",
      "node_modules/**",
      "static/**",
      ".azurite/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts}", "**/*.svelte"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      sonarjs,
      svelte: sveltePlugin,
    },
    rules: {
      "sonarjs/cognitive-complexity": ["error", 50],
      "prefer-arrow-callback": "error",
      "arrow-body-style": ["error", "as-needed"],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "svelte",
              importNames: ["createEventDispatcher"],
              message:
                "Use callback props (for example, onsave={handleSave}) instead of createEventDispatcher in Svelte 5.",
            },
          ],
        },
      ],
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
    },
  },
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      "svelte/require-each-key": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.svelte"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "sonarjs/cognitive-complexity": "off",
    },
  },
];
