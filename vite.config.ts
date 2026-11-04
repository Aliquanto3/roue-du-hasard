import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { CSP_ROUE, cspPlugin } from './vite.csp';

export default defineConfig({
  plugins: [viteSingleFile(), cspPlugin(CSP_ROUE)],
  build: { rollupOptions: { input: 'roue.html' }, target: 'es2022', modulePreload: false },
});
