import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-paulodias-vicio-sppn/6f5840a7-f802-44c9-a056-6547ac9a227b/scratchpad';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Bem-vindo ao', { timeout: 20000 });
await page.fill('input[placeholder="Como te chamam?"]', 'Paulo');
await page.click('text=Entrar no escritório');
await page.waitForSelector('canvas', { timeout: 30000 });
await sleep(4000);

const header = (await page.textContent('header'))?.replace(/\s+/g, ' ');
console.log('header:', header);
console.log('erros:', errors.length ? errors.join(' | ') : 'nenhum');
await page.screenshot({ path: `${OUT}/final.png` });
await browser.close();
