# TypeScript and Svelte Standards

## Enforcement

- Run `vp run check` before committing.
- `check` includes:
  - `svelte-kit sync`
  - `svelte-check --tsconfig ./tsconfig.json`
  - `eslint .`
- ESLint enforcement includes:
  - Cognitive complexity <= 50 (`sonarjs/cognitive-complexity`)
  - Arrow callbacks where appropriate (`prefer-arrow-callback`)
  - Type import consistency (`@typescript-eslint/consistent-type-imports`)
  - Svelte keyed each-blocks (`svelte/require-each-key`)
  - No `createEventDispatcher` import (use callback props)

## TypeScript Best Practices

- Keep code readable and modular; prefer small functions over large mixed-responsibility functions.
- Keep cognitive complexity at 50 or below for every function.
- Use arrow callbacks where appropriate.
- Conform to ESLint rules in `eslint.config.js`.
- Put business logic in `src/lib/services` or `src/lib/utils`.
- Keep unit tests close to business logic behavior and aim for maximal practical coverage.

## Svelte Best Practices (Svelte 5)

- Snippets over slots:
  - Prefer `{#snippet ...}` and `{@render ...}` for reusable UI chunks.
- Callback props over dispatchers:
  - Pass functions as props (for example `onsave={handleSave}`), avoid `createEventDispatcher`.
- Classes and context for global state:
  - Prefer classes using `$state` fields, provide instances via `setContext`/`getContext`.
- Keyed each-blocks:
  - Always provide a stable unique key in `{#each}` blocks.
- CSS variables for styling:
  - Use CSS custom properties passed as component props for style customization.
- Modern directives:
  - Use array-based class toggling where useful, for example `class={[isActive && 'active']}`.
- Runes in external logic:
  - Use `.svelte.ts` and `.svelte.js` when external files need runes like `$state` or `$derived`.

## Architecture and Tests

- Keep route handlers thin and delegate business logic to services/utils.
- Add or update tests when modifying service or utility behavior.
- Prefer deterministic tests and explicit mocks for external systems.
