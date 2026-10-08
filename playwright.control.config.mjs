import {defineConfig} from '@playwright/test';

export default defineConfig({
 testDir:'./e2e',outputDir:'./artifacts/e2e/control',testMatch:'control-panel.spec.mjs',timeout:30000,retries:0,workers:1,
 use:{baseURL:'http://127.0.0.1:4331',browserName:'chromium',viewport:{width:1440,height:1080},trace:'retain-on-failure'},
 webServer:{command:'node test/fixtures/control-e2e-server.mjs',url:'http://127.0.0.1:4331',reuseExistingServer:false,timeout:60000},
 reporter:[['list']]
});
