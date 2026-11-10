// Summit Library (fictional): token login, then Bearer auth, JSON with its own field names.
//   POST /auth            {"clientId": "...", "clientSecret": "..."} -> {"access_token": "...", "expires_in": 300}
//   POST /catalog/query   Authorization: Bearer <token>
//                         {"query": {"text": "...", "max": 5}}
const crypto = require('node:crypto');
const { send, readJson, serve } = require('./http');
const { search, byRecordId } = require('./books');

const CLIENT_ID = process.env.SUMMIT_CLIENT_ID || 'summit-demo-client';
const CLIENT_SECRET = process.env.SUMMIT_CLIENT_SECRET || 'summit-demo-secret';
const PORT = Number(process.env.PORT || 15672);
const TOKEN_TTL_SECONDS = 300;

const tokens = new Map(); // token -> expiry (ms)

function authorized(req) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!match) return false;
  const expiry = tokens.get(match[1]);
  return expiry !== undefined && expiry > Date.now();
}

serve('summit', PORT, async (req, res, url) => {
  // Public record page, so the source links in answers resolve.
  if (req.method === 'GET' && url.pathname.startsWith('/items/')) {
    const book = byRecordId('summit', decodeURIComponent(url.pathname.slice(7)), 'SUM:');
    return book ? send(res, 200, { name: book.title, year: book.year }) : send(res, 404, { error: 'not found' });
  }

  if (req.method === 'POST' && url.pathname === '/auth') {
    const body = await readJson(req);
    if (!body || body.clientId !== CLIENT_ID || body.clientSecret !== CLIENT_SECRET) {
      return send(res, 401, { error: 'invalid_client' });
    }
    const token = crypto.randomBytes(16).toString('hex');
    tokens.set(token, Date.now() + TOKEN_TTL_SECONDS * 1000);
    return send(res, 200, { access_token: token, token_type: 'Bearer', expires_in: TOKEN_TTL_SECONDS });
  }

  if (req.method === 'POST' && url.pathname === '/catalog/query') {
    if (!authorized(req)) return send(res, 401, { error: 'invalid_token' });
    const body = await readJson(req);
    const text = body && body.query && body.query.text;
    if (!text) return send(res, 400, { error: 'query.text is required' });
    const max = Math.min(Number(body.query.max) || 5, 20);
    const hits = search('summit', text, max);
    return send(res, 200, {
      data: {
        count: hits.length,
        items: hits.map((b) => ({
          recordId: `SUM:${b.id}`,
          name: b.title,
          // One string, "Last, First" joined with "; ".
          creator: b.authors
            .map((a) => {
              const parts = a.split(' ');
              const last = parts.pop();
              return `${last}, ${parts.join(' ')}`;
            })
            .join('; '),
          publicationDate: `${b.year}-01-01`,
          holdings: { total: b.copies, onLoan: b.onLoan },
          link: `http://localhost:${PORT}/items/SUM:${b.id}`,
        })),
      },
    });
  }

  send(res, 404, { error: 'not found' });
});
