import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false, // Run sequentially since they form a linear user story path
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173', // Point to our local Vite server
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Automatically spin up the backend and frontend servers before testing!
  webServer: [
    {
      command: 'npm run start',
      port: 8080,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        TWILIO_ACCOUNT_SID: 'ACXX_mock_sid',
        TWILIO_AUTH_TOKEN: 'mock_auth_token'
      }
    },
    {
      command: 'npm run dev',
      cwd: './frontend',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    }
  ]
});
