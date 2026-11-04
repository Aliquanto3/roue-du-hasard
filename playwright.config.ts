import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: process.env['CI'] ? 'github' : 'list',
  // Édition chat : servie par `npm run chat` (dist/roue-chat.html, construit avant les tests).
  webServer: {
    command: 'node scripts/serveur-chat.mjs',
    url: 'http://127.0.0.1:5200/',
    reuseExistingServer: !process.env['CI'],
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
