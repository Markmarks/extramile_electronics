import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app's own version (package.json, kept equal to tauri.conf.json / Cargo.toml), baked
// into the bundle so the admins' device list shows which build each PC runs.
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

// Tauri drives Vite; only VITE_-prefixed envs are exposed to the webview bundle.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_'],
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
  // Don't watch the Rust side: `cargo build/test` rewrites src-tauri/target while the dev
  // server runs, and on Windows a locked .exe there crashes the watcher (EBUSY).
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
