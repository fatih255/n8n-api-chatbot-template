// Mock OpenAI-compatible chat completions server.
// It is NOT a language model. It reads the numbered catalog results that the
// workflow puts in the prompt and writes a fixed-template answer that cites
// them, so the demo and the tests run without an API key and give stable output.
//   POST /v1/chat/completions   Authorization: Bearer <key>
const crypto = require('node:crypto');
const { send, readJson, serve } = require('./http');

const API_KEY = process.env.MOCK_LLM_API_KEY || 'mock-llm-key';
const PORT = Number(process.env.PORT || 15674);

const RESULT_LINE = /^\[(\d+)\] (.+?) \| authors: (.*?) \| year: (.*?) \| available: (\w+)/;

function answerFrom(prompt) {
  const lines = prompt.split('\n');
  const question = (lines.find((l) => l.startsWith('Question: ')) || '').slice(10);
  const library = (lines.find((l) => l.startsWith('Library: ')) || '').slice(9);
  const results = lines
    .map((l) => RESULT_LINE.exec(l))
    .filter(Boolean)
    .map(([, n, title, authors, year, available]) => ({ n, title, authors, year, available }));

  if (results.length === 0) {
    return `I couldn't find anything in the ${library} catalog for "${question}". Try different keywords.`;
  }
  const listed = results
    .map((r) => `"${r.title}" by ${r.authors}${r.year !== 'unknown' ? ` (${r.year})` : ''} [${r.n}]`)
    .join('; ');
  const onShelf = results.filter((r) => r.available === 'yes').map((r) => `[${r.n}]`);
  const availability = onShelf.length
    ? `Available to borrow right now: ${onShelf.join(', ')}.`
    : 'None of them is available right now.';
  return `The ${library} catalog has ${results.length} matching title${results.length > 1 ? 's' : ''}: ${listed}. ${availability}`;
}

async function handle(req, res, url) {
  if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') {
    return send(res, 404, { error: { message: 'not found' } });
  }
  if (req.headers.authorization !== `Bearer ${API_KEY}`) {
    return send(res, 401, { error: { message: 'invalid api key' } });
  }
  const body = await readJson(req);
  if (!body || !Array.isArray(body.messages)) {
    return send(res, 400, { error: { message: 'messages must be an array' } });
  }
  const userMessages = body.messages.filter((m) => m.role === 'user');
  const prompt = String((userMessages[userMessages.length - 1] || {}).content || '');
  const content = answerFrom(prompt);
  send(res, 200, {
    id: `chatcmpl-mock-${crypto.randomBytes(6).toString('hex')}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || 'mock-catalog-llm',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

if (require.main === module) serve('mock-llm', PORT, handle);

module.exports = { answerFrom };
