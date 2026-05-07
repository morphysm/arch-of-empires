import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['./vitest.setup.js'],
  },
});
