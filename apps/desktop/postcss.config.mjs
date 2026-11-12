import { fileURLToPath } from 'node:url';

// Resolve the Tailwind config relative to this file, not the process CWD, so the
// build works whether it's launched from apps/desktop (pnpm dev) or the repo root.
const tailwindConfig = fileURLToPath(new URL('./tailwind.config.ts', import.meta.url));

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    tailwindcss: { config: tailwindConfig },
    autoprefixer: {},
  },
};
