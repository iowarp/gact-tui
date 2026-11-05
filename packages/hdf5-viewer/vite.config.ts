import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served by the web app under /hdf5-viewer/ (see web/vite-plugin-hdf5-viewer.ts),
// so asset URLs are relative.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
