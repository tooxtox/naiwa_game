import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',
  timeout:45000,
  workers:1,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:8080',headless:true,viewport:{width:1280,height:720},screenshot:'only-on-failure',launchOptions:{args:['--no-sandbox']}},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:8080',reuseExistingServer:!process.env.CI},
});
