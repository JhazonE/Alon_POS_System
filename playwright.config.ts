import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para sa Alon POS System (Next.js web app).
 *
 * Isolation: ang tests modagan batok sa usa ka dedicated nga dev server sa port
 * 3100 nga naka-point sa `alon_pos_test` database (DILI sa dev `alon_pos` sa 3000).
 * Mao nga luwas modagan bisan naa'y dev server nga gigamit sa port 3000.
 *
 * Global setup (tests/e2e/setup/global-setup.ts) mo-recreate + mo-seed sa
 * alon_pos_test kada run para deterministic.
 */
const TEST_PORT = 3100;
const BASE_URL = `http://localhost:${TEST_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/setup/global-setup.ts',
  // Pugngan ang dungan-dungan nga write sa parehas nga test DB.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],

  // Ang Next.js dev mode mahal mo-compile ug routes sa unang hit (especially /pos),
  // mao nga ginhawaan nato ang assertion timeout.
  expect: { timeout: 15_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `next dev -p ${TEST_PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // I-point ang app under test sa isolated nga test database, ug i-align ang
    // client API base sa test server (3100) aron dili mag-"Failed to fetch" ang
    // logActivity (nga naka-hardcode sa 3000 gikan sa .env).
    env: {
      ...process.env,
      DB_NAME: 'alon_pos_test',
      NEXT_PUBLIC_API_BASE_URL: `${BASE_URL}/api`,
      // Separate dist dir aron makasabay sa usa ka running nga dev server (3000)
      // nga adunay kaugalingong Next dev singleton lock sa `.next`.
      NEXT_DIST_DIR: '.next-test',
    },
  },
});
