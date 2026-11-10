// Harbor Library (fictional): API key in a header, JSON response.
//   GET /api/v1/search?q=<text>&limit=<n>
//   X-API-Key: <key>
const { send, serve } = require('./http');
const { search, byRecordId } = require('./books');

const API_KEY = process.env.HARBOR_API_KEY || 'harbor-demo-key';
const PORT = Number(process.env.PORT || 15671);

serve('harbor', PORT, (req, res, url) => {
  // Public record page, so the source links in answers resolve.
  if (req.method === 'GET' && url.pathname.startsWith('/record/')) {
    const book = byRecordId('harbor', decodeURIComponent(url.pathname.slice(8)), 'HB-');
    return book ? send(res, 200, { title: book.title, authors: book.authors, year: book.year }) : send(res, 404, { error: 'not found' });
  }
  if (req.method !== 'GET' || url.pathname !== '/api/v1/search') {
    return send(res, 404, { error: 'not found' });
  }
  if (req.headers['x-api-key'] !== API_KEY) {
    return send(res, 401, { error: 'missing or wrong X-API-Key' });
  }
  const limit = Math.min(Number(url.searchParams.get('limit')) || 5, 20);
  const hits = search('harbor', url.searchParams.get('q'), limit);
  send(res, 200, {
    total: hits.length,
    results: hits.map((b) => ({
      id: `HB-${b.id}`,
      title: b.title,
      authors: b.authors,
      year: b.year,
      available: b.copies - b.onLoan > 0,
      url: `http://localhost:${PORT}/record/HB-${b.id}`,
    })),
  });
});
