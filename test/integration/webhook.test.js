// Integration test: starts the compose stack, waits for the n8n webhook and
// asks each library a question through the real workflow.
//
//   npm run test:integration                  start the stack, test, tear it down
//   KEEP_STACK=1 npm run test:integration      leave the stack running afterwards
//   SKIP_COMPOSE=1 npm run test:integration    use a stack that's already running
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const WEBHOOK = process.env.WEBHOOK_URL || 'http://localhost:15678/webhook/library-chat';
const DEMO = 'http://localhost:15670';
const manageStack = !process.env.SKIP_COMPOSE;

function compose(...args) {
  execFileSync('docker', ['compose', ...args], { cwd: ROOT, stdio: 'inherit' });
}

async function ask(body) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave json null; the assertion below shows the text
  }
  return { status: res.status, json, text };
}

async function waitForWebhook(timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response yet';
  while (Date.now() < deadline) {
    try {
      const res = await ask({ library: 'harbor', question: 'warm-up maps' });
      if (res.status === 200) return;
      last = `HTTP ${res.status}: ${res.text.slice(0, 200)}`;
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Webhook did not come up in time. Last: ${last}`);
}

test.before(async () => {
  if (manageStack) compose('up', '-d', '--quiet-pull');
  await waitForWebhook();
});

test.after(() => {
  if (manageStack && !process.env.KEEP_STACK) compose('down', '-v');
});

const cases = [
  {
    library: 'harbor',
    question: 'Do you have books about urban gardening?',
    libraryName: 'Harbor Library',
    ids: ['HB-b01', 'HB-b02'],
    available: [true, false],
  },
  {
    // Goes through POST /auth first, then the Bearer query with different field names.
    library: 'summit',
    question: 'Anything on distributed systems reliability?',
    libraryName: 'Summit Library',
    ids: ['SUM:b05'],
    available: [true],
    authors: [['Dana Whitlock']],
  },
  {
    // API key in the query string and an XML response.
    library: 'meadow',
    question: 'Books on the history of rivers',
    libraryName: 'Meadow Library',
    ids: ['MW-b09', 'MW-b07'],
    available: [true, true],
    authors: [['Jonas Ekström', 'Priya Raman'], ['Pieter Voss']],
  },
];

for (const c of cases) {
  test(`${c.library}: answers with the catalog records as numbered sources`, async () => {
    const { status, json, text } = await ask({ library: c.library, question: c.question });
    assert.equal(status, 200, text);
    assert.equal(json.library, c.library);
    assert.equal(json.libraryName, c.libraryName);
    assert.equal(json.question, c.question);
    assert.equal(json.model, 'mock-catalog-llm');
    assert.deepEqual(json.sources.map((s) => s.id), c.ids);
    assert.deepEqual(json.sources.map((s) => s.ref), c.ids.map((_, i) => i + 1));
    assert.deepEqual(json.sources.map((s) => s.available), c.available);
    if (c.authors) assert.deepEqual(json.sources.map((s) => s.authors), c.authors);
    for (const s of json.sources) {
      assert.ok(json.answer.includes(`"${s.title}"`), `answer mentions "${s.title}"`);
      assert.ok(json.answer.includes(`[${s.ref}]`), `answer cites [${s.ref}]`);
      assert.equal(typeof s.year, 'number');
    }
    const record = await fetch(json.sources[0].url);
    assert.equal(record.status, 200, `source link ${json.sources[0].url} resolves`);
  });
}

test('the mock catalogs reject calls without their own kind of credentials', async () => {
  const harbor = await fetch('http://localhost:15671/api/v1/search?q=maps');
  assert.equal(harbor.status, 401);
  const summit = await fetch('http://localhost:15672/catalog/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer made-up' },
    body: JSON.stringify({ query: { text: 'maps' } }),
  });
  assert.equal(summit.status, 401);
  const meadow = await fetch('http://localhost:15673/opac/find?term=maps&apikey=wrong');
  assert.equal(meadow.status, 403);
});

test('a question with no matches still answers, with an empty source list', async () => {
  const { status, json } = await ask({ library: 'harbor', question: 'quantum knitting' });
  assert.equal(status, 200);
  assert.deepEqual(json.sources, []);
  assert.match(json.answer, /couldn't find anything in the Harbor Library catalog/);
});

test('an unknown library gets a 404 from the Switch fallback', async () => {
  const { status, json } = await ask({ library: 'elsewhere', question: 'maps please' });
  assert.equal(status, 404);
  assert.deepEqual(json, { error: 'Unknown library: elsewhere' });
});

test('an invalid request gets a 400 with the reason', async () => {
  const { status, json } = await ask({ library: 'harbor', question: '?' });
  assert.equal(status, 400);
  assert.match(json.error, /question must be at least 3 characters/);
});

test('the demo page proxies to the webhook', async () => {
  const page = await fetch(DEMO).then((r) => r.text());
  assert.match(page, /Demo page/);
  const res = await fetch(`${DEMO}/api/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ library: 'summit', question: 'telescopes for beginners' }),
  }).then((r) => r.json());
  assert.equal(res.status, 200);
  assert.equal(res.response.sources[0].title, 'Telescopes for Beginners');
  assert.equal(res.response.sources[0].available, false);
});
