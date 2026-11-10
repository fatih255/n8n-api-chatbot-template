// One adapter per library: it knows that library's response format and maps it
// to the shared record shape below. This file is inlined into the
// "Normalize results" Code node by scripts/build-workflow.js, so it must stay
// plain JS without require().
//
// Normalized record:
//   { library, id, title, authors: string[], year: number|null, available: boolean|null, url: string|null }

const MAX_RESULTS = 5;

// ---------------------------------------------------------------------------
// Minimal XML reader. It handles elements, attributes, text, entities, CDATA,
// comments and the XML declaration, which is all a catalog record needs. It
// doesn't handle DTDs or namespaces.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, ref) ? ENTITIES[ref] : whole;
  });
}

function parseXml(xml) {
  if (typeof xml !== 'string') throw new Error('XML input must be a string');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let match;
  let consumed = 0;
  while ((match = token.exec(xml)) !== null) {
    if (match.index !== consumed) break;
    consumed = token.lastIndex;
    const [, cdata, closeName, openName, attrText, selfClose, text] = match;
    const current = stack[stack.length - 1];
    if (cdata !== undefined) {
      current.text += cdata;
    } else if (closeName) {
      if (current.name !== closeName) throw new Error(`Unexpected </${closeName}>, expected </${current.name}>`);
      stack.pop();
    } else if (openName) {
      const attrs = {};
      const attr = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = attr.exec(attrText)) !== null) attrs[a[1]] = decodeEntities(a[2] !== undefined ? a[2] : a[3]);
      const node = { name: openName, attrs, children: [], text: '' };
      current.children.push(node);
      if (!selfClose) stack.push(node);
    } else if (text !== undefined) {
      current.text += decodeEntities(text);
    }
    // Anything else is a comment or the XML declaration, which we skip.
  }
  if (consumed !== xml.length) throw new Error(`Malformed XML near position ${consumed}`);
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].name}>`);
  const elements = root.children;
  if (elements.length !== 1) throw new Error('XML must have exactly one root element');
  return elements[0];
}

function child(node, name) {
  return node.children.find((c) => c.name === name) || null;
}

function children(node, name) {
  return node.children.filter((c) => c.name === name);
}

function textOf(node) {
  return node ? node.text.trim() : '';
}

// ---------------------------------------------------------------------------
// Small helpers shared by adapters.

function toYear(value) {
  const match = /\b(\d{4})\b/.exec(String(value == null ? '' : value));
  return match ? Number(match[1]) : null;
}

function cleanString(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

// "Whitlock, Dana; Raman, Priya" -> ["Dana Whitlock", "Priya Raman"]
function splitInvertedNames(value) {
  return cleanString(value)
    .split(';')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const [last, first] = name.split(',').map((s) => s.trim());
      return first ? `${first} ${last}` : last;
    });
}

// ---------------------------------------------------------------------------
// Adapters. To add a library, add an entry here, add its branch in the
// workflow, and run `npm run build:workflow`.

const adapters = {
  // { total, results: [{ id, title, authors[], year, available, url }] }
  harbor: {
    name: 'Harbor Library',
    format: 'json',
    normalize(body) {
      const results = body && Array.isArray(body.results) ? body.results : [];
      return results.map((r) => ({
        id: String(r.id),
        title: cleanString(r.title),
        authors: Array.isArray(r.authors) ? r.authors.map(cleanString).filter(Boolean) : [],
        year: toYear(r.year),
        available: typeof r.available === 'boolean' ? r.available : null,
        url: r.url || null,
      }));
    },
  },

  // { data: { items: [{ recordId, name, creator: "Last, First; ...", publicationDate, holdings: { total, onLoan }, link }] } }
  summit: {
    name: 'Summit Library',
    format: 'json',
    normalize(body) {
      const items = body && body.data && Array.isArray(body.data.items) ? body.data.items : [];
      return items.map((item) => {
        const h = item.holdings;
        const available = h && Number.isFinite(h.total) && Number.isFinite(h.onLoan) ? h.total - h.onLoan > 0 : null;
        return {
          id: String(item.recordId),
          title: cleanString(item.name),
          authors: splitInvertedNames(item.creator),
          year: toYear(item.publicationDate),
          available,
          url: item.link || null,
        };
      });
    },
  },

  // <response><hits count="n"><record id=".."><title/><author/>*<issued/><status/><permalink/></record></hits></response>
  meadow: {
    name: 'Meadow Library',
    format: 'xml',
    normalize(xml) {
      const doc = parseXml(xml);
      const hits = child(doc, 'hits');
      if (!hits) return [];
      return children(hits, 'record').map((rec) => {
        const status = textOf(child(rec, 'status')).toLowerCase();
        return {
          id: rec.attrs.id || '',
          title: cleanString(textOf(child(rec, 'title'))),
          authors: children(rec, 'author').map(textOf).map(cleanString).filter(Boolean),
          year: toYear(textOf(child(rec, 'issued'))),
          available: status === 'on shelf' ? true : status === 'checked out' ? false : null,
          url: textOf(child(rec, 'permalink')) || null,
        };
      });
    },
  },
};

function getAdapter(library) {
  if (!Object.prototype.hasOwnProperty.call(adapters, library)) {
    throw new Error(`No adapter for library "${library}"`);
  }
  return adapters[library];
}

// httpItem is the item the HTTP Request node produced: the parsed body for
// JSON APIs, or { data: "<xml...>" } when the node reads the response as text.
function normalizeResponse(library, httpItem) {
  const adapter = getAdapter(library);
  const body = adapter.format === 'xml' ? httpItem && httpItem.data : httpItem;
  const seen = new Set();
  return adapter
    .normalize(body)
    .filter((r) => r.title && !seen.has(r.id) && seen.add(r.id))
    .slice(0, MAX_RESULTS)
    .map((r) => ({ library, ...r }));
}

// Entry point used by the Code node.
function runInN8n({ $input, $ }) {
  const ctx = $('Prepare request').first().json;
  const adapter = getAdapter(ctx.library);
  const results = normalizeResponse(ctx.library, $input.first().json);
  return [{ json: { ...ctx, libraryName: adapter.name, results } }];
}

module.exports = { adapters, getAdapter, normalizeResponse, parseXml, splitInvertedNames, toYear, runInN8n };
