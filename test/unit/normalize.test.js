const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeResponse, parseXml, splitInvertedNames, toYear, adapters, runInN8n } = require('../../src/normalize');

// Response bodies in the shape each mock API returns (see mocks/*.js).
const harborBody = {
  total: 2,
  results: [
    { id: 'HB-b07', title: 'A Short History of Maps', authors: ['Pieter Voss'], year: 2011, available: true, url: 'http://h/record/HB-b07' },
    { id: 'HB-b14', title: '  Statistics Without Tears,\n Revised ', authors: ['Elif Sarı', 'Mark Odum'], year: 2022, available: false, url: 'http://h/record/HB-b14' },
  ],
};

const summitBody = {
  data: {
    count: 2,
    items: [
      { recordId: 'SUM:b07', name: 'A Short History of Maps', creator: 'Voss, Pieter', publicationDate: '2011-01-01', holdings: { total: 5, onLoan: 1 }, link: 'http://s/items/SUM:b07' },
      { recordId: 'SUM:b09', name: 'Rivers That Moved Cities', creator: 'Ekström, Jonas; Raman, Priya', publicationDate: '2018-01-01', holdings: { total: 1, onLoan: 1 }, link: 'http://s/items/SUM:b09' },
    ],
  },
};

const meadowXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <!-- comment from the server -->
  <hits count="2">
    <record id="MW-b12">
      <title>Bread, Salt &amp; Time</title>
      <author>Nora Castellanos</author>
      <issued>2020</issued>
      <status>checked out</status>
      <permalink>http://m/opac/record/MW-b12</permalink>
    </record>
    <record id="MW-b09">
      <title><![CDATA[Rivers That Moved Cities]]></title>
      <author>Jonas Ekstr&#246;m</author>
      <author>Priya Raman</author>
      <issued>c. 2018</issued>
      <status>on shelf</status>
      <permalink>http://m/opac/record/MW-b09</permalink>
    </record>
  </hits>
</response>`;

test('harbor: maps the JSON results and tidies whitespace in titles', () => {
  const out = normalizeResponse('harbor', harborBody);
  assert.deepEqual(out, [
    { library: 'harbor', id: 'HB-b07', title: 'A Short History of Maps', authors: ['Pieter Voss'], year: 2011, available: true, url: 'http://h/record/HB-b07' },
    { library: 'harbor', id: 'HB-b14', title: 'Statistics Without Tears, Revised', authors: ['Elif Sarı', 'Mark Odum'], year: 2022, available: false, url: 'http://h/record/HB-b14' },
  ]);
});

test('summit: renames fields, splits "Last, First" names and derives availability from holdings', () => {
  const out = normalizeResponse('summit', summitBody);
  assert.deepEqual(out[1], {
    library: 'summit',
    id: 'SUM:b09',
    title: 'Rivers That Moved Cities',
    authors: ['Jonas Ekström', 'Priya Raman'],
    year: 2018,
    available: false,
    url: 'http://s/items/SUM:b09',
  });
  assert.equal(out[0].available, true);
});

test('summit: missing holdings means availability is unknown, not false', () => {
  const body = { data: { items: [{ recordId: 'x', name: 'No holdings', creator: 'Doe, Jane', publicationDate: '1999' }] } };
  assert.equal(normalizeResponse('summit', body)[0].available, null);
});

test('meadow: parses the XML from the { data } item the HTTP node produces', () => {
  const out = normalizeResponse('meadow', { data: meadowXml });
  assert.deepEqual(out, [
    { library: 'meadow', id: 'MW-b12', title: 'Bread, Salt & Time', authors: ['Nora Castellanos'], year: 2020, available: false, url: 'http://m/opac/record/MW-b12' },
    { library: 'meadow', id: 'MW-b09', title: 'Rivers That Moved Cities', authors: ['Jonas Ekström', 'Priya Raman'], year: 2018, available: true, url: 'http://m/opac/record/MW-b09' },
  ]);
});

test('meadow: an empty hit list gives no results', () => {
  const xml = '<?xml version="1.0"?>\n<response>\n  <hits count="0">\n\n  </hits>\n</response>\n';
  assert.deepEqual(normalizeResponse('meadow', { data: xml }), []);
});

test('empty or unexpected JSON bodies give no results instead of throwing', () => {
  assert.deepEqual(normalizeResponse('harbor', {}), []);
  assert.deepEqual(normalizeResponse('harbor', { results: 'nope' }), []);
  assert.deepEqual(normalizeResponse('summit', { error: 'x' }), []);
});

test('drops records without a title, removes duplicate ids and keeps at most 5', () => {
  const results = [
    { id: '1', title: '' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: String(i % 6), title: `Book ${i}`, authors: [], year: 2000 })),
  ];
  const out = normalizeResponse('harbor', { results });
  assert.deepEqual(out.map((r) => r.id), ['0', '1', '2', '3', '4']);
});

test('unknown library throws a clear error', () => {
  assert.throws(() => normalizeResponse('nowhere', {}), /No adapter for library "nowhere"/);
  // Inherited object keys are not adapters.
  assert.throws(() => normalizeResponse('toString', {}), /No adapter/);
});

test('every adapter has a display name, a known format and a normalize function', () => {
  for (const [id, adapter] of Object.entries(adapters)) {
    assert.match(id, /^[a-z0-9-]+$/);
    assert.ok(adapter.name, `${id} has a name`);
    assert.ok(['json', 'xml'].includes(adapter.format), `${id} format`);
    assert.equal(typeof adapter.normalize, 'function');
  }
});

test('runInN8n reads the context from "Prepare request" and the body from its input', () => {
  const ctx = { route: 'summit', library: 'summit', question: 'maps?', searchText: 'maps' };
  const $input = { first: () => ({ json: summitBody }) };
  const $ = (name) => {
    assert.equal(name, 'Prepare request');
    return { first: () => ({ json: ctx }) };
  };
  const [item] = runInN8n({ $input, $ });
  assert.equal(item.json.libraryName, 'Summit Library');
  assert.equal(item.json.question, 'maps?');
  assert.equal(item.json.results.length, 2);
});

test('parseXml: attributes, self-closing tags, entities and nesting', () => {
  const doc = parseXml(`<a x="1" y='two &amp; three'><b/><c>&lt;hi&gt; &#x41;</c></a>`);
  assert.equal(doc.name, 'a');
  assert.deepEqual(doc.attrs, { x: '1', y: 'two & three' });
  assert.deepEqual(doc.children.map((c) => c.name), ['b', 'c']);
  assert.equal(doc.children[1].text, '<hi> A');
});

test('parseXml: rejects malformed documents', () => {
  assert.throws(() => parseXml('<a><b></a>'), /Unexpected <\/a>/);
  assert.throws(() => parseXml('<a>'), /Unclosed <a>/);
  assert.throws(() => parseXml('<a/><b/>'), /exactly one root/);
  assert.throws(() => parseXml('<a>1 < 2</a>'), /Malformed XML/);
  assert.throws(() => parseXml(null), /must be a string/);
});

test('splitInvertedNames and toYear', () => {
  assert.deepEqual(splitInvertedNames('Whitlock, Dana; Raman, Priya;'), ['Dana Whitlock', 'Priya Raman']);
  assert.deepEqual(splitInvertedNames('Anonymous'), ['Anonymous']);
  assert.deepEqual(splitInvertedNames(undefined), []);
  assert.equal(toYear('2019-04-01'), 2019);
  assert.equal(toYear(2011), 2011);
  assert.equal(toYear('n.d.'), null);
  assert.equal(toYear(null), null);
});
