export const TIMEZONE = 'Asia/Kolkata';
export const MAX_MISTAKES = 4;
export const COLORS = ['yellow', 'green', 'blue', 'purple'];

export function dateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function millisecondsToMidnight(now = new Date()) {
  return Math.max(0, Date.parse(`${dateKey(now)}T00:00:00+05:30`) + 86400000 - now.getTime());
}

export function normalisePuzzle(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) throw new Error('Every puzzle needs a unique id.');
  if (!Array.isArray(raw.groups) || raw.groups.length !== 4) throw new Error('A puzzle must have four groups.');
  const ids = new Set(), titles = new Set(), groupIds = new Set(), difficulties = new Set();
  const groups = raw.groups.map((group, index) => {
    const difficulty = group.difficulty ?? index + 1;
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4 || difficulties.has(difficulty)) throw new Error('Use each difficulty from 1 to 4 exactly once.');
    difficulties.add(difficulty);
    const level = difficulty - 1;
    const id = group.id || `group-${level}`;
    const name = group.name || group.category;
    if (typeof name !== 'string' || !name.trim() || groupIds.has(id)) throw new Error('Group names and unique group ids are required.');
    groupIds.add(id);
    if (!Array.isArray(group.items) || group.items.length !== 4) throw new Error('Each group must contain exactly four cards.');
    const items = group.items.map((item, index) => {
      const card = typeof item === 'string' ? {title: item} : item;
      if (!card || typeof card.title !== 'string' || !card.title.trim()) throw new Error('Every card needs a title.');
      const title = card.title.trim();
      const cardId = card.id || `${id}-${index}`;
      const canonical = title.normalize('NFKC').toLocaleLowerCase('en-IN');
      if (ids.has(cardId) || titles.has(canonical)) throw new Error('Card ids and titles must be unique within a puzzle.');
      if (card.poster && !/^(assets\/|https:\/\/)/.test(card.poster)) throw new Error('Posters must use a local assets path or HTTPS.');
      ids.add(cardId); titles.add(canonical);
      return {...card, id: cardId, title, groupId: id, level};
    });
    return {...group, id, name: name.trim(), difficulty, level, color: COLORS[level], items};
  }).sort((a, b) => a.level - b.level);
  return {...raw, groups, cards: groups.flatMap(group => group.items)};
}

export function validateDataset(data) {
  if (!data || !Array.isArray(data.puzzles)) throw new Error('The dataset needs a puzzles array.');
  const ids = new Set(), dates = new Set();
  for (const raw of [...data.puzzles, ...(data.preview ? [data.preview] : [])]) {
    const puzzle = normalisePuzzle(raw);
    if (ids.has(puzzle.id)) throw new Error('Puzzle ids must be unique.');
    ids.add(puzzle.id);
    if (puzzle.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(puzzle.date) || !Number.isFinite(Date.parse(puzzle.date + 'T00:00:00Z')) || new Date(puzzle.date + 'T00:00:00Z').toISOString().slice(0, 10) !== puzzle.date) throw new Error('Use a valid YYYY-MM-DD puzzle date.');
      if (dates.has(puzzle.date)) throw new Error('Only one puzzle may be assigned to a date.');
      dates.add(puzzle.date);
    }
  }
  if (data.puzzles.some(p => !p.date) && !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate || '')) throw new Error('Undated puzzles need a startDate.');
  return data;
}

export function selectPuzzle(data, date) {
  let raw = data.puzzles.find(p => p.date === date);
  if (!raw && data.startDate) {
    const index = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(data.startDate + 'T00:00:00Z')) / 86400000);
    raw = data.puzzles.filter(p => !p.date)[index];
  }
  if (raw) return {puzzle: normalisePuzzle(raw), preview: false};
  return data.preview ? {puzzle: normalisePuzzle(data.preview), preview: true} : null;
}

export function puzzleSignature(puzzle) {
  return JSON.stringify(puzzle.groups.map(g => [g.id, g.name, g.items.map(c => [c.id, c.title])]));
}

export function createState(puzzle, date, preview = false) {
  return {version: 1, puzzleId: puzzle.id, signature: puzzleSignature(puzzle), date, preview, solved: [], mistakes: 0, guesses: [], history: [], status: 'playing'};
}

export function evaluateGuess(puzzle, state, selected) {
  if (state.status !== 'playing') return {state, type: 'finished'};
  if (!Array.isArray(selected) || selected.length !== 4 || new Set(selected).size !== 4) return {state, type: 'invalid'};
  const available = puzzle.cards.filter(c => !state.solved.includes(c.groupId));
  if (selected.some(id => !available.some(c => c.id === id))) return {state, type: 'invalid'};
  const key = [...selected].sort().join('\u0000');
  if (state.guesses.some(ids => [...ids].sort().join('\u0000') === key)) return {state, type: 'duplicate'};
  const counts = puzzle.groups.map(g => g.items.filter(c => selected.includes(c.id)).length);
  const correct = counts.findIndex(count => count === 4);
  const history = [...state.history, selected.map(id => puzzle.cards.find(c => c.id === id).level)];
  const next = {...state, guesses: [...state.guesses, [...selected]], history};
  if (correct !== -1) {
    const group = puzzle.groups[correct];
    next.solved = [...state.solved, group.id];
    next.status = next.solved.length === 4 ? 'won' : 'playing';
    return {state: next, type: 'correct', group};
  }
  next.mistakes = state.mistakes + 1;
  next.status = next.mistakes >= MAX_MISTAKES ? 'lost' : 'playing';
  return {state: next, type: counts.includes(3) ? 'near' : 'incorrect'};
}

export function restoreState(puzzle, date, preview, raw) {
  let state = createState(puzzle, date, preview);
  if (!raw || raw.version !== 1 || raw.puzzleId !== puzzle.id || raw.date !== date || raw.signature !== state.signature || !Array.isArray(raw.guesses)) return state;
  if (raw.guesses.length > 8) return state;
  for (const guess of raw.guesses) {
    const result = evaluateGuess(puzzle, state, guess);
    if (['invalid', 'duplicate', 'finished'].includes(result.type)) return createState(puzzle, date, preview);
    state = result.state;
  }
  return state;
}

export function shuffleCards(cards, random = Math.random) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result.every((item, index) => item === cards[index])) result.push(result.shift());
  return result;
}

export function statistics(records, today) {
  const completed = [...new Map(records.filter(s => !s.preview && s.date <= today && ['won', 'lost'].includes(s.status)).map(s => [s.date, s])).values()];
  const wins = completed.filter(s => s.status === 'won').map(s => s.date).sort();
  let longest = 0, run = 0, previous;
  for (const day of wins) {
    const ms = Date.parse(day + 'T00:00:00Z');
    run = previous === ms - 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run); previous = ms;
  }
  let current = 0;
  let cursor = Date.parse(today + 'T00:00:00Z');
  const winSet = new Set(wins);
  if (!winSet.has(today)) cursor -= 86400000;
  if (!completed.some(s => s.date === today && s.status === 'lost')) {
    while (winSet.has(new Date(cursor).toISOString().slice(0, 10))) {current++; cursor -= 86400000;}
  }
  return {played: completed.length, winRate: completed.length ? Math.round(wins.length / completed.length * 100) : 0, current, longest};
}
