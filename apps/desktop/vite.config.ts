import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tauri drives Vite; only VITE_-prefixed envs are exposed to the webview bundle.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_'],
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
