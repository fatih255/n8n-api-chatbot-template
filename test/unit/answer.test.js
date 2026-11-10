const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLlmRequest, buildResponse, formatResult, buildResponseInN8n } = require('../../src/answer');
const { answerFrom } = require('../../mocks/llm');

const ctx = {
  library: 'harbor',
  libraryName: 'Harbor Library',
  question: 'Books about\nmaps?',
  results: [
    { library: 'harbor', id: 'HB-1', title: 'A Short History of Maps', authors: ['Pieter Voss'], year: 2011, available: true, url: 'http://h/1' },
    { library: 'harbor', id: 'HB-2', title: 'Maps | Legends', authors: [], year: null, available: null, url: null },
  ],
};

test('the prompt numbers each result and keeps one result per line', () => {
  const req = buildLlmRequest(ctx);
  assert.equal(req.messages[0].role, 'system');
  assert.match(req.messages[0].content, /Use only the numbered catalog results/);
  const lines = req.messages[1].content.split('\n');
  assert.deepEqual(lines, [
    'Question: Books about maps?',
    'Library: Harbor Library',
    'Catalog results:',
    '[1] A Short History of Maps | authors: Pieter Voss | year: 2011 | available: yes | url: http://h/1',
    '[2] Maps Legends | authors: unknown | year: unknown | available: unknown | url: none',
  ]);
  assert.equal(req.model, undefined, 'the model comes from LLM_MODEL in the HTTP node');
});

test('the prompt says so when there are no results', () => {
  const req = buildLlmRequest({ ...ctx, results: [] });
  assert.match(req.messages[1].content, /Catalog results: none$/);
});

test('formatResult marks unavailable items', () => {
  assert.match(formatResult({ title: 'T', authors: ['A'], year: 2000, available: false, url: null }, 2), /^\[3\] T .* available: no/);
});

test('buildResponse returns the answer and the numbered source list', () => {
  const completion = { model: 'some-model', choices: [{ message: { role: 'assistant', content: '  It has two [1] [2]. ' } }] };
  const out = buildResponse(ctx, completion);
  assert.equal(out.answer, 'It has two [1] [2].');
  assert.equal(out.model, 'some-model');
  assert.deepEqual(out.sources.map((s) => [s.ref, s.id]), [[1, 'HB-1'], [2, 'HB-2']]);
  assert.equal('library' in out.sources[0], false);
});

test('buildResponse fails loudly on an empty or malformed completion', () => {
  assert.throws(() => buildResponse(ctx, {}), /no message content/);
  assert.throws(() => buildResponse(ctx, { choices: [{ message: { content: '' } }] }), /no message content/);
});

test('the mock LLM cites exactly the results in the prompt', () => {
  const prompt = buildLlmRequest(ctx).messages[1].content;
  const answer = answerFrom(prompt);
  assert.match(answer, /Harbor Library catalog has 2 matching titles/);
  assert.match(answer, /"A Short History of Maps" by Pieter Voss \(2011\) \[1\]/);
  assert.match(answer, /Available to borrow right now: \[1\]\./);
  assert.match(answerFrom(buildLlmRequest({ ...ctx, results: [] }).messages[1].content), /couldn't find anything/);
});

test('buildResponseInN8n reads the context from "Build LLM request"', () => {
  const $ = (name) => {
    assert.equal(name, 'Build LLM request');
    return { first: () => ({ json: ctx }) };
  };
  const $input = { first: () => ({ json: { choices: [{ message: { content: 'ok' } }] } }) };
  const [item] = buildResponseInN8n({ $input, $ });
  assert.equal(item.json.answer, 'ok');
  assert.equal(item.json.sources.length, 2);
});
