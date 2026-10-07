import {defineConfig} from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
export default defineConfig({testDir:'./e2e',testIgnore:'observatory.spec.mjs',timeout:30000,retries:0,workers:1,use:{baseURL:'http://127.0.0.1:4317',browserName:'chromium',viewport:{width:1440,height:1080},trace:'retain-on-failure'},webServer:{command:'node bin/bbrainx.mjs demo && node bin/bbrainx.mjs serve',url:'http://127.0.0.1:4317',env:{BBRAINX_HOME:path.join(os.tmpdir(),'bbrainx-e2e-'+process.pid)},reuseExistingServer:false,timeout:30000}});
