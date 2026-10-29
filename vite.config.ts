import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps the build working both locally and under a GitHub Pages
// project path (https://<user>.github.io/<repo>/) without extra configuration.
export default defineConfig({
  plugins: [react()],
  base: './',
});
