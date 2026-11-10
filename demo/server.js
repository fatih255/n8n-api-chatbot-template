// Demo page: a form that posts a question to the n8n webhook and shows the
// JSON it returns. The server proxies the call so the browser doesn't need CORS.
const fs = require('node:fs');
const path = require('node:path');
const { send, readJson, serve } = require('../mocks/http');

const PORT = Number(process.env.PORT || 15670);
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:15678/webhook/library-chat';
const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

serve('demo', PORT, async (req, res, url) => {
  if (req.method === 'GET' && url.pathname === '/') {
    return send(res, 200, page, 'text/html');
  }
  if (req.method === 'POST' && url.pathname === '/api/ask') {
    const body = await readJson(req);
    const started = Date.now();
    const upstream = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: 'Webhook did not return JSON', body: text.slice(0, 500) };
    }
    return send(res, 200, { status: upstream.status, ms: Date.now() - started, webhook: new URL(WEBHOOK_URL).pathname, response: json });
  }
  send(res, 404, { error: 'not found' });
});
