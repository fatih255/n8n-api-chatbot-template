#!/usr/bin/env node
// Inlines the modules in src/ into the Code nodes of workflows/library-chat.json.
//
//   node scripts/build-workflow.js          rewrite the workflow file
//   node scripts/build-workflow.js --check  exit 1 if the file is out of date
//
// The Code node can't require() files from this repo, so the build copies each
// module's source into the node, wrapped so `module.exports` works, followed by
// a one-line call to the module's n8n entry point.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_PATH = path.join(ROOT, 'workflows', 'library-chat.json');

// Code node name -> source module and the exported function it calls.
const CODE_NODES = {
  'Prepare request': { source: 'src/request.js', entry: 'runInN8n' },
  'Normalize results': { source: 'src/normalize.js', entry: 'runInN8n' },
  'Build LLM request': { source: 'src/answer.js', entry: 'buildLlmRequestInN8n' },
  'Shape response': { source: 'src/answer.js', entry: 'buildResponseInN8n' },
};

function codeFor({ source, entry }) {
  const text = fs.readFileSync(path.join(ROOT, source), 'utf8').replace(/\r\n/g, '\n').trimEnd();
  return [
    `// Generated from ${source} by scripts/build-workflow.js.`,
    '// Edit the source file and run `npm run build:workflow`; changes made here are overwritten.',
    'const lib = (() => {',
    '  const module = { exports: {} };',
    text,
    '  return module.exports;',
    '})();',
    `return lib.${entry}({ $input, $ });`,
    '',
  ].join('\n');
}

function buildWorkflow(workflowText) {
  const workflow = JSON.parse(workflowText);
  const seen = new Set();
  for (const node of workflow.nodes) {
    const spec = CODE_NODES[node.name];
    if (!spec) continue;
    if (node.type !== 'n8n-nodes-base.code') throw new Error(`"${node.name}" is not a Code node`);
    node.parameters.jsCode = codeFor(spec);
    seen.add(node.name);
  }
  const missing = Object.keys(CODE_NODES).filter((name) => !seen.has(name));
  if (missing.length) throw new Error(`Workflow is missing Code nodes: ${missing.join(', ')}`);
  return `${JSON.stringify(workflow, null, 2)}\n`;
}

function main() {
  const current = fs.readFileSync(WORKFLOW_PATH, 'utf8').replace(/\r\n/g, '\n');
  const built = buildWorkflow(current);
  if (process.argv.includes('--check')) {
    if (built !== current) {
      console.error('workflows/library-chat.json is out of date. Run `npm run build:workflow`.');
      process.exit(1);
    }
    console.log('workflows/library-chat.json is in sync with src/.');
    return;
  }
  fs.writeFileSync(WORKFLOW_PATH, built);
  console.log(`Wrote ${path.relative(ROOT, WORKFLOW_PATH)}`);
}

if (require.main === module) main();

module.exports = { buildWorkflow, codeFor, CODE_NODES, WORKFLOW_PATH };
