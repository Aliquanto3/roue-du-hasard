import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** CSP injectée au build seulement : le serveur de dev a besoin de HMR (websocket). */
function cspPlugin(): Plugin {
  return {
    name: 'roue-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  plugins: [viteSingleFile(), cspPlugin()],
  build: { rollupOptions: { input: 'roue.html' }, target: 'es2022', modulePreload: false },
});
