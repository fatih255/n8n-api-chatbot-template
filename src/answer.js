// Builds the chat completions request from normalized results, and shapes the
// final webhook response. This file is inlined into the "Build LLM request" and
// "Shape response" Code nodes by scripts/build-workflow.js, so it must stay
// plain JS without require().

const SYSTEM_PROMPT = [
  'You answer questions for a library chatbot.',
  'Use only the numbered catalog results in the message. Cite them as [1], [2].',
  'If the results do not answer the question, say so. Do not invent titles.',
  'Keep the answer under 120 words.',
].join(' ');

function oneLine(value) {
  return String(value == null ? '' : value).replace(/[\s|]+/g, ' ').trim();
}

function formatResult(r, index) {
  const available = r.available === true ? 'yes' : r.available === false ? 'no' : 'unknown';
  return [
    `[${index + 1}] ${oneLine(r.title)}`,
    `authors: ${r.authors.length ? r.authors.map(oneLine).join(', ') : 'unknown'}`,
    `year: ${r.year == null ? 'unknown' : r.year}`,
    `available: ${available}`,
    `url: ${r.url || 'none'}`,
  ].join(' | ');
}

// ctx: { question, libraryName, results } from the Normalize step.
// The model name is added by the HTTP Request node from LLM_MODEL.
function buildLlmRequest(ctx) {
  const lines = [`Question: ${oneLine(ctx.question)}`, `Library: ${oneLine(ctx.libraryName)}`];
  if (ctx.results.length) {
    lines.push('Catalog results:', ...ctx.results.map(formatResult));
  } else {
    lines.push('Catalog results: none');
  }
  return {
    temperature: 0.2,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: lines.join('\n') },
    ],
  };
}

// completion: an OpenAI-style chat completions response body.
function buildResponse(ctx, completion) {
  const choice = completion && Array.isArray(completion.choices) ? completion.choices[0] : null;
  const answer = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content.trim() : '';
  if (!answer) throw new Error('The LLM response had no message content');
  return {
    library: ctx.library,
    libraryName: ctx.libraryName,
    question: ctx.question,
    answer,
    sources: ctx.results.map((r, i) => ({
      ref: i + 1,
      id: r.id,
      title: r.title,
      authors: r.authors,
      year: r.year,
      available: r.available,
      url: r.url,
    })),
    model: completion.model || null,
  };
}

// Entry points used by the two Code nodes.
function buildLlmRequestInN8n({ $input }) {
  const ctx = $input.first().json;
  return [{ json: { ...ctx, llmRequest: buildLlmRequest(ctx) } }];
}

function buildResponseInN8n({ $input, $ }) {
  const ctx = $('Build LLM request').first().json;
  return [{ json: buildResponse(ctx, $input.first().json) }];
}

module.exports = { SYSTEM_PROMPT, buildLlmRequest, buildResponse, formatResult, buildLlmRequestInN8n, buildResponseInN8n };
