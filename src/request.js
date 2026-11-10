// Validates the incoming chat request and turns the question into search text.
// This file is inlined into the "Prepare request" Code node by
// scripts/build-workflow.js, so it must stay plain JS without require().

const STOPWORDS = new Set(
  (
    'a about an and any are as at be book books by can could do does find for from get ' +
    'have how i in is it me my of on or please recommend show some something that the ' +
    'there they this to want what where which who with you your'
  ).split(' ')
);

const MAX_QUESTION_LENGTH = 500;
const MAX_SEARCH_WORDS = 6;

function toSearchText(question) {
  const words = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  const unique = [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
  return unique.length ? unique.join(' ') : question.trim();
}

// body: the parsed JSON body of the webhook call, e.g.
//   { "library": "harbor", "question": "Do you have books about urban gardening?" }
// Returns the context object the rest of the workflow passes along.
// `route` is what the Switch node routes on: the library id, or "invalid".
function prepareRequest(body) {
  const input = body && typeof body === 'object' ? body : {};
  const library = typeof input.library === 'string' ? input.library.trim().toLowerCase() : '';
  const question = typeof input.question === 'string' ? input.question.trim() : '';

  const errors = [];
  if (!/^[a-z0-9-]{1,40}$/.test(library)) errors.push('library must be a short id like "harbor"');
  if (question.length < 3) errors.push('question must be at least 3 characters');
  if (question.length > MAX_QUESTION_LENGTH) errors.push(`question must be at most ${MAX_QUESTION_LENGTH} characters`);

  if (errors.length) {
    return { route: 'invalid', library, question, error: errors.join('; ') };
  }
  return { route: library, library, question, searchText: toSearchText(question) };
}

// Entry point used by the Code node.
function runInN8n({ $input }) {
  return [{ json: prepareRequest($input.first().json.body) }];
}

module.exports = { prepareRequest, toSearchText, runInN8n };
