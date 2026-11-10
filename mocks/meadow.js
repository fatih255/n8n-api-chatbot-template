// Meadow Library (fictional): API key as a query parameter, XML response.
//   GET /opac/find?apikey=<key>&term=<text>
const { send, serve } = require('./http');
const { search, byRecordId } = require('./books');

const API_KEY = process.env.MEADOW_API_KEY || 'meadow-demo-key';
const PORT = Number(process.env.PORT || 15673);

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

serve('meadow', PORT, (req, res, url) => {
  // Public record page, so the source links in answers resolve.
  if (req.method === 'GET' && url.pathname.startsWith('/opac/record/')) {
    const book = byRecordId('meadow', decodeURIComponent(url.pathname.slice(13)), 'MW-');
    return book
      ? send(res, 200, `<record><title>${esc(book.title)}</title><issued>${book.year}</issued></record>`, 'application/xml')
      : send(res, 404, '<error>not found</error>', 'application/xml');
  }
  if (req.method !== 'GET' || url.pathname !== '/opac/find') {
    return send(res, 404, '<error>not found</error>', 'application/xml');
  }
  if (url.searchParams.get('apikey') !== API_KEY) {
    return send(res, 403, '<error>bad apikey</error>', 'application/xml');
  }
  const hits = search('meadow', url.searchParams.get('term'), 5);
  const records = hits
    .map((b) => {
      const authors = b.authors.map((a) => `      <author>${esc(a)}</author>`).join('\n');
      const status = b.copies - b.onLoan > 0 ? 'on shelf' : 'checked out';
      return [
        `    <record id="MW-${esc(b.id)}">`,
        `      <title>${esc(b.title)}</title>`,
        authors,
        `      <issued>${b.year}</issued>`,
        `      <status>${status}</status>`,
        `      <permalink>http://localhost:${PORT}/opac/record/MW-${esc(b.id)}</permalink>`,
        '    </record>',
      ].join('\n');
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n  <hits count="${hits.length}">\n${records}\n  </hits>\n</response>\n`;
  send(res, 200, xml, 'application/xml');
});
