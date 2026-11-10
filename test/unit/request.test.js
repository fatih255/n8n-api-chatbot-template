const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareRequest, toSearchText, runInN8n } = require('../../src/request');

test('a valid request routes to its library and gets search text', () => {
  assert.deepEqual(prepareRequest({ library: ' Harbor ', question: 'Do you have books about urban gardening?' }), {
    route: 'harbor',
    library: 'harbor',
    question: 'Do you have books about urban gardening?',
    searchText: 'urban gardening',
  });
});

test('search text drops stopwords and duplicates, keeps unicode, caps the word count', () => {
  assert.equal(toSearchText('Which books on Fermentation and fermentation at home?'), 'fermentation home');
  assert.equal(toSearchText('Ekström rivers'), 'ekström rivers');
  assert.equal(toSearchText('one two three four five six seven eight'), 'one two three four five six');
});

test('a question made only of stopwords falls back to the question itself', () => {
  assert.equal(toSearchText('What do you have?'), 'What do you have?');
});

test('invalid requests route to "invalid" with every problem listed', () => {
  const out = prepareRequest({ library: 'not a valid id!', question: 'x' });
  assert.equal(out.route, 'invalid');
  assert.match(out.error, /library must be/);
  assert.match(out.error, /at least 3 characters/);
  assert.equal(prepareRequest({ library: 'harbor', question: 'a'.repeat(501) }).route, 'invalid');
});

test('missing or non-object bodies are invalid, not a crash', () => {
  for (const body of [undefined, null, 'text', 42, { library: 5, question: [] }]) {
    assert.equal(prepareRequest(body).route, 'invalid');
  }
});

test('an unknown but well-formed library id is passed on; the Switch fallback handles it', () => {
  assert.equal(prepareRequest({ library: 'elsewhere', question: 'maps please' }).route, 'elsewhere');
});

test('runInN8n reads the webhook body', () => {
  const $input = { first: () => ({ json: { headers: {}, body: { library: 'meadow', question: 'history of maps' } } }) };
  const [item] = runInN8n({ $input });
  assert.equal(item.json.route, 'meadow');
  assert.equal(item.json.searchText, 'history maps');
});
