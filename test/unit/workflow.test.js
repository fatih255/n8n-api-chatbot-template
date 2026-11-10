const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildWorkflow, CODE_NODES, WORKFLOW_PATH } = require('../../scripts/build-workflow');
const { adapters } = require('../../src/normalize');
const request = require('../../src/request');

const text = fs.readFileSync(WORKFLOW_PATH, 'utf8').replace(/\r\n/g, '\n');
const workflow = JSON.parse(text);
const byName = new Map(workflow.nodes.map((n) => [n.name, n]));

// Runs a Code node's jsCode the way n8n does: as the body of an async function
// with $input and $ in scope, and no require().
async function runCodeNode(name, { $input, $ }) {
  const code = byName.get(name).parameters.jsCode;
  const fn = vm.runInNewContext(`(async function ($input, $) {\n${code}\n})`, {});
  return fn($input, $);
}

const item = (json) => ({ first: () => ({ json }) });

test('workflow JSON is in sync with src/ (run `npm run build:workflow` if this fails)', () => {
  assert.equal(buildWorkflow(text), text);
});

test('every Code node listed in the build exists and contains its source module', () => {
  for (const [name, { source }] of Object.entries(CODE_NODES)) {
    const node = byName.get(name);
    assert.ok(node, `${name} exists`);
    assert.ok(node.parameters.jsCode.includes(fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n').trimEnd()), `${name} inlines ${source}`);
  }
});

test('the inlined "Prepare request" code behaves like src/request.js', async () => {
  const body = { library: 'Summit', question: 'Any books on distributed systems reliability?' };
  const out = await runCodeNode('Prepare request', { $input: item({ body }) });
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [{ json: request.prepareRequest(body) }]);
});

test('the inlined Code nodes run end to end without require()', async () => {
  const ctx = { route: 'meadow', library: 'meadow', question: 'maps', searchText: 'maps' };
  const xml = '<response><hits count="1"><record id="MW-1"><title>Maps</title><author>A B</author><issued>2001</issued><status>on shelf</status></record></hits></response>';
  const [normalized] = await runCodeNode('Normalize results', { $input: item({ data: xml }), $: () => item(ctx) });
  assert.equal(normalized.json.libraryName, 'Meadow Library');
  assert.equal(normalized.json.results[0].title, 'Maps');

  const [withRequest] = await runCodeNode('Build LLM request', { $input: item(normalized.json) });
  assert.match(withRequest.json.llmRequest.messages[1].content, /\[1\] Maps \| authors: A B/);

  const completion = { model: 'm', choices: [{ message: { content: 'Answer [1]' } }] };
  const [shaped] = await runCodeNode('Shape response', { $input: item(completion), $: () => item(withRequest.json) });
  assert.equal(shaped.json.answer, 'Answer [1]');
  assert.equal(shaped.json.sources[0].id, 'MW-1');
});

test('the Switch has one output per adapter, plus "invalid" and an "unknown" fallback', () => {
  const sw = byName.get('Route by library');
  const keys = sw.parameters.rules.values.map((r) => r.outputKey);
  assert.deepEqual(keys, ['invalid', ...Object.keys(adapters)]);
  for (const rule of sw.parameters.rules.values) {
    assert.equal(rule.conditions.conditions[0].rightValue, rule.outputKey);
  }
  assert.equal(sw.parameters.options.fallbackOutput, 'extra');
  // Outputs: one per rule, then the fallback.
  assert.equal(workflow.connections['Route by library'].main.length, keys.length + 1);
});

test('every adapter branch ends in "Normalize results"', () => {
  const outputs = workflow.connections['Route by library'].main;
  const rules = byName.get('Route by library').parameters.rules.values;
  for (const library of Object.keys(adapters)) {
    let current = outputs[rules.findIndex((r) => r.outputKey === library)][0].node;
    const visited = [];
    while (current !== 'Normalize results') {
      assert.ok(!visited.includes(current) && visited.length < 10, `${library} branch loops`);
      visited.push(current);
      const next = workflow.connections[current];
      assert.ok(next, `${library} branch stops at "${current}"`);
      current = next.main[0][0].node;
    }
  }
});

test('connections only point at nodes that exist, and the webhook answers via a Respond node', () => {
  for (const [from, { main }] of Object.entries(workflow.connections)) {
    assert.ok(byName.has(from), `${from} exists`);
    for (const target of main.flat()) assert.ok(byName.has(target.node), `${target.node} exists`);
  }
  const webhook = byName.get('Chat webhook');
  assert.equal(webhook.parameters.responseMode, 'responseNode');
  assert.equal(webhook.parameters.path, 'library-chat');
  assert.match(workflow.id, /^[A-Za-z0-9]{16}$/);
});

test('no credentials are hard-coded in the workflow; they come from $env', () => {
  for (const secret of ['harbor-demo-key', 'summit-demo-secret', 'meadow-demo-key', 'mock-llm-key']) {
    assert.ok(!text.includes(secret), `${secret} not in workflow`);
  }
});
