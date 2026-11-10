// Tiny helpers shared by the mock servers. No dependencies on purpose.
const http = require('node:http');

function send(res, status, body, contentType = 'application/json') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': `${contentType}; charset=utf-8` });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

// Starts a server with a handler(req, res, url). Logs one line per request.
function serve(name, port, handler) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.on('finish', () => console.log(`[${name}] ${req.method} ${url.pathname} -> ${res.statusCode}`));
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    try {
      await handler(req, res, url);
    } catch (err) {
      console.error(`[${name}]`, err);
      send(res, 500, { error: 'internal error' });
    }
  });
  server.listen(port, () => console.log(`[${name}] listening on ${port}`));
  return server;
}

module.exports = { send, readJson, serve };
