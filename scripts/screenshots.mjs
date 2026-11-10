// Takes the README screenshots from the running stack.
//   docker compose up -d   (or npm run up)
//   npm run screenshots
// Logs in to the local n8n editor with the test owner from .env / .env.example.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const N8N = 'http://localhost:15678';
const DEMO = 'http://localhost:15670';
const WORKFLOW_ID = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', 'library-chat.json'), 'utf8')).id;

function readEnv() {
  const file = fs.existsSync(path.join(ROOT, '.env')) ? '.env' : '.env.example';
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function ask(library, question) {
  const res = await fetch(`${N8N}/webhook/library-chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ library, question }),
  });
  if (!res.ok) throw new Error(`Webhook returned ${res.status}. Is the stack running? (npm run up)`);
  return res.json();
}

async function dismissPopups(page) {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}

async function main() {
  const env = readEnv();
  fs.mkdirSync(OUT, { recursive: true });

  // Create executions to look at. The last one (summit) has the token login branch.
  await ask('harbor', 'Do you have books about urban gardening?');
  await ask('meadow', 'Books on the history of rivers');
  await ask('summit', 'Anything on distributed systems reliability?');

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
  const page = await context.newPage();

  // 1. Workflow in the editor.
  await page.goto(`${N8N}/signin`);
  await page.locator('input[type="email"], input[name="emailOrLdapLoginId"], input[name="email"]').first().fill(env.N8N_OWNER_EMAIL);
  await page.locator('input[type="password"]').first().fill(env.N8N_OWNER_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => !url.pathname.startsWith('/signin'), { timeout: 30_000 });

  await page.goto(`${N8N}/workflow/${WORKFLOW_ID}`);
  await page.locator('[data-test-id="canvas-node"]').first().waitFor({ timeout: 30_000 });
  await dismissPopups(page);
  await page.locator('[data-test-id="canvas-wrapper"], .vue-flow').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Shift+1'); // zoom to fit
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'workflow-editor.png') });

  // 2. The latest execution (the summit request).
  await page.goto(`${N8N}/workflow/${WORKFLOW_ID}/executions`);
  await page.locator('[data-test-id="execution-details"], [data-test-id="canvas-node"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await dismissPopups(page);
  await page.screenshot({ path: path.join(OUT, 'execution.png') });

  // 3. Demo page showing the webhook's JSON reply.
  await page.goto(`${DEMO}/?library=meadow&q=${encodeURIComponent('Books on the history of rivers')}`);
  await page.locator('.answer').waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(OUT, 'webhook-response.png'), fullPage: true });

  await browser.close();
  console.log(`Saved screenshots to ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
