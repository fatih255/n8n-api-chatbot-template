// Synthetic catalog data. Titles, authors and libraries are made up for the demo.
// Each mock API serves its own subset and exposes it in its own format.

const books = [
  { id: 'b01', libraries: ['harbor', 'meadow'], title: 'Gardens on the Roof', authors: ['Mara Okafor'], year: 2019, subjects: ['gardening', 'urban', 'food'], copies: 3, onLoan: 1 },
  { id: 'b02', libraries: ['harbor'], title: 'Small Plot, Big Harvest', authors: ['Ilya Brandt', 'Sena Kaya'], year: 2021, subjects: ['gardening', 'vegetables'], copies: 2, onLoan: 2 },
  { id: 'b03', libraries: ['summit', 'meadow'], title: 'The Patient Soil', authors: ['Ruth Achterberg'], year: 2016, subjects: ['gardening', 'soil', 'composting'], copies: 1, onLoan: 0 },
  { id: 'b04', libraries: ['harbor', 'summit'], title: 'Learning Rust by Building Things', authors: ['Tomasz Wierzba'], year: 2023, subjects: ['programming', 'rust'], copies: 4, onLoan: 3 },
  { id: 'b05', libraries: ['summit'], title: 'Queues, Retries and Other Promises', authors: ['Dana Whitlock'], year: 2022, subjects: ['programming', 'distributed systems', 'reliability'], copies: 2, onLoan: 0 },
  { id: 'b06', libraries: ['meadow'], title: 'Typed Functional Programming for the Curious', authors: ['Ayla Demirci'], year: 2020, subjects: ['programming', 'functional', 'types'], copies: 1, onLoan: 1 },
  { id: 'b07', libraries: ['harbor', 'summit', 'meadow'], title: 'A Short History of Maps', authors: ['Pieter Voss'], year: 2011, subjects: ['history', 'maps', 'geography'], copies: 5, onLoan: 1 },
  { id: 'b08', libraries: ['summit'], title: 'Coastlines and Empires', authors: ['Leila Haddad'], year: 2014, subjects: ['history', 'maritime'], copies: 1, onLoan: 1 },
  { id: 'b09', libraries: ['meadow'], title: 'Rivers That Moved Cities', authors: ['Jonas Ekström', 'Priya Raman'], year: 2018, subjects: ['history', 'rivers', 'urban'], copies: 2, onLoan: 0 },
  { id: 'b10', libraries: ['harbor'], title: 'Night Sky Field Guide', authors: ['Caro Mbeki'], year: 2017, subjects: ['astronomy', 'stars'], copies: 2, onLoan: 0 },
  { id: 'b11', libraries: ['summit', 'meadow'], title: 'Telescopes for Beginners', authors: ['Hugo Lindqvist'], year: 2015, subjects: ['astronomy', 'telescopes'], copies: 3, onLoan: 3 },
  { id: 'b12', libraries: ['harbor', 'meadow'], title: 'Bread, Salt and Time', authors: ['Nora Castellanos'], year: 2020, subjects: ['cooking', 'baking', 'food'], copies: 2, onLoan: 1 },
  { id: 'b13', libraries: ['summit'], title: 'Fermentation at Home', authors: ['Kenji Arimura'], year: 2019, subjects: ['cooking', 'fermentation', 'food'], copies: 1, onLoan: 0 },
  { id: 'b14', libraries: ['harbor', 'summit'], title: 'Statistics Without Tears, Revised', authors: ['Elif Sarı', 'Mark Odum'], year: 2022, subjects: ['statistics', 'mathematics', 'data'], copies: 6, onLoan: 2 },
  { id: 'b15', libraries: ['meadow'], title: 'Designing Data Pipelines', authors: ['Ola Nwosu'], year: 2024, subjects: ['data', 'programming', 'pipelines'], copies: 2, onLoan: 1 },
  { id: 'b16', libraries: ['harbor'], title: 'Birds of Wet Meadows', authors: ['Greta Halvorsen'], year: 2013, subjects: ['nature', 'birds'], copies: 1, onLoan: 0 },
];

function forLibrary(library) {
  return books.filter((b) => b.libraries.includes(library));
}

// Very small search: every word of the query that appears in the title or
// subjects adds to the score. Books with score 0 are dropped.
function search(library, query, limit = 5) {
  const words = String(query || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];
  return forLibrary(library)
    .map((book) => {
      const haystack = `${book.title} ${book.subjects.join(' ')}`.toLowerCase();
      const score = words.filter((w) => haystack.includes(w)).length;
      return { book, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.book.year - a.book.year)
    .slice(0, limit)
    .map((r) => r.book);
}

// Looks up a book by the id a mock put in its record URL, e.g. "HB-b01" -> b01.
function byRecordId(library, recordId, prefix) {
  if (!recordId.startsWith(prefix)) return null;
  const id = recordId.slice(prefix.length);
  return forLibrary(library).find((b) => b.id === id) || null;
}

module.exports = { books, forLibrary, search, byRecordId };
