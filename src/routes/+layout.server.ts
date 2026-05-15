import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	// Read package.json at build/server startup
	// @ts-expect-error - fs available in Node.js runtime
	const { readFileSync } = await import('fs');
	// @ts-expect-error - path available in Node.js runtime
	const { join } = await import('path');

	// @ts-expect-error - process available in Node.js runtime
	const packageJsonPath = join(process.cwd(), 'package.json');
	const packageJson: { version: string } = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

	return {
		version: packageJson.version
	};
};
