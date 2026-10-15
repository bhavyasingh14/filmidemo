import {COLORS, MAX_MISTAKES, createState, dateKey, evaluateGuess, millisecondsToMidnight, normalisePuzzle, restoreState, selectPuzzle, shuffleCards, statistics, validateDataset} from './core.js';

const $ = id => document.getElementById(id);
const PREFIX = 'filmi.connections.v1.';
const EMOJI = ['🟨', '🟩', '🟦', '🟪'];
let dataset, puzzle, state, roundDate, preview = false, archive = false;
let selected = new Set(), order = [], busy = false, lastDate = dateKey(), storageWorks = true;
const memory = new Map();

function readStorage(key) {
  try {return localStorage.getItem(key);} catch {storageWorks = false; return memory.get(key) ?? null;}
}
function writeStorage(key, value) {
  memory.set(key, value);
  try {localStorage.setItem(key, value);} catch {storageWorks = false;}
  $('storageNote').hidden = storageWorks;
}
function storageKey() {return PREFIX + roundDate + '.' + puzzle.id;}
function parse(value) {try {return JSON.parse(value);} catch {return null;}}
function save() {writeStorage(storageKey(), JSON.stringify(state));}
function formatDate(date, options = {weekday: 'short', day: 'numeric', month: 'long'}) {
  return new Intl.DateTimeFormat('en-IN', {...options, timeZone: 'Asia/Kolkata'}).format(new Date(date + 'T12:00:00+05:30'));
}
function say(message, tone = '') {$('feedback').textContent = message; $('feedback').className = tone;}
function seededRandom(text) {
  let seed = [...text].reduce((n, char) => Math.imul(n ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296;};
}

function loadRound(date = dateKey()) {
  const round = selectPuzzle(dataset, date);
  closeDialogs();
  if (!round) {showUnavailable(); return;}
  puzzle = round.puzzle; preview = round.preview; roundDate = date; archive = date !== dateKey();
  const raw = parse(readStorage(storageKey()));
  state = restoreState(puzzle, date, preview, raw);
  state.archive = raw?.signature === state.signature && typeof raw.archive === 'boolean' ? raw.archive : archive;
  if (!archive) state.archive = false;
  selected = new Set();
  order = shuffleCards(puzzle.cards.map(c => c.id), seededRandom(date + puzzle.id));
  busy = false;
  $('loading').hidden = true;
  $('board').setAttribute('aria-busy', 'false');
  $('puzzleDate').textContent = formatDate(date) + (archive ? ' · Archive' : '');
  $('editionNumber').textContent = preview ? 'PREVIEW EDITION' : 'SHOW ' + (puzzle.number || '#' + puzzle.id);
  $('previewNote').hidden = !preview;
  $('nextShowLabel').textContent = preview ? 'NEXT MIDNIGHT IN INDIA' : 'NEXT SHOW AT MIDNIGHT IST';
  $('storageNote').hidden = storageWorks;
  render();
  say(state.status === 'playing' ? 'Pick any four. Find their common thread.' : state.status === 'won' ? 'All four connections found. Well played.' : 'The connections are revealed below.', state.status === 'won' ? 'success' : '');
}

function render() {
  const activeId = document.activeElement?.dataset.cardId;
  renderSolved();
  $('board').replaceChildren();
  for (const id of order) {
    const card = puzzle.cards.find(c => c.id === id);
    if (!card || state.solved.includes(card.groupId) || state.status === 'lost') continue;
    const button = document.createElement('button');
    button.className = 'film-card';
    button.type = 'button'; button.dataset.cardId = id;
    button.setAttribute('aria-pressed', String(selected.has(id)));
    button.setAttribute('aria-label', card.title);
    const title = document.createElement('span'); title.className = 'card-title'; title.textContent = card.title;
    button.append(title);
    button.addEventListener('click', () => toggleCard(id));
    $('board').append(button);
  }
  if (activeId) [...$('board').children].find(b => b.dataset.cardId === activeId)?.focus({preventScroll: true});
  updateControls();
  const finished = state.status !== 'playing';
  $('resultSummary').hidden = !finished;
  $('resultHeading').textContent = state.status === 'won' ? "That's a wrap!" : 'Every show has a twist.';
  $('resultText').textContent = state.status === 'won' ? `${4 - state.mistakes} ${4 - state.mistakes === 1 ? 'retake' : 'retakes'} to spare. All connections found.` : `${state.solved.length} of 4 connections found. Come back for the next show.`;
  $('shareFallback').hidden = true;
}

function renderSolved() {
  $('solvedGroups').replaceChildren();
  const groups = state.solved.map(id => puzzle.groups.find(g => g.id === id));
  if (state.status === 'lost') groups.push(...puzzle.groups.filter(g => !state.solved.includes(g.id)));
  for (const group of groups) {
    const isFound = state.solved.includes(group.id);
    const section = document.createElement('section'); section.className = `solved-group ${group.color}` + (isFound ? '' : ' revealed');
    if (!isFound) {const label = document.createElement('span'); label.className = 'group-unfound'; label.textContent = 'THE ONE THAT GOT AWAY'; section.append(label);}
    const heading = document.createElement('h3'); heading.textContent = group.name;
    const titles = document.createElement('p'); titles.textContent = group.items.map(c => c.title).join(' · ');
    section.append(heading, titles); $('solvedGroups').append(section);
  }
}

function updateControls() {
  const playing = state?.status === 'playing';
  $('submitButton').disabled = !playing || selected.size !== 4 || busy;
  $('deselectButton').disabled = !playing || selected.size === 0 || busy;
  $('shuffleButton').disabled = !playing || busy;
  $('selectionCount').textContent = playing ? `${selected.size} / 4 selected` : `${state.solved.length} / 4 found`;
  $('retakeDots').setAttribute('aria-label', `${MAX_MISTAKES - state.mistakes} mistakes remaining`);
  [...$('retakeDots').children].forEach((dot, index) => dot.classList.toggle('spent', index >= MAX_MISTAKES - state.mistakes));
  [...$('board').children].forEach(b => b.disabled = busy);
}

function toggleCard(id) {
  if (busy || state.status !== 'playing') return;
  if (selected.has(id)) selected.delete(id);
  else if (selected.size < 4) selected.add(id);
  else {say('Four films make a connection. Deselect one to swap it.', 'attention'); return;}
  render();
  say(selected.size === 4 ? 'Feeling a connection? Make it official.' : 'Pick any four. Find their common thread.');
}

function submit() {
  if (!state || busy || selected.size !== 4) return;
  const result = evaluateGuess(puzzle, state, [...selected]);
  if (result.type === 'duplicate') {say("You've tried that combination. Give it another cut.", 'attention'); return;}
  if (['invalid', 'finished'].includes(result.type)) return;
  state = result.state; save();
  if (result.type === 'correct') {
    selected.clear(); render();
    say(state.status === 'won' ? 'All four connections found. Take a bow.' : 'Cut! A perfect connection. Keep rolling.', 'success');
  } else {
    say(result.type === 'near' ? 'One film away. Three of these belong together.' : 'A plot twist. Those four don’t share a group.', 'attention');
    busy = true; updateControls();
    [...$('board').children].filter(b => selected.has(b.dataset.cardId)).forEach(b => b.classList.add('shake'));
    const currentRound = storageKey();
    setTimeout(() => {if (!state || storageKey() !== currentRound) return; busy = false; if (state.status === 'lost') selected.clear(); render();}, 380);
  }
  if (state.status !== 'playing') {
    const currentRound = storageKey();
    setTimeout(() => {if (state && storageKey() === currentRound) showResults();}, 700);
  }
}

function showResults() {
  if (!state || state.status === 'playing') return;
  $('resultsTitle').textContent = state.status === 'won' ? "That's a wrap!" : 'Still a film buff.';
  $('resultsEyebrow').textContent = preview ? 'PREVIEW · THE END CREDITS' : formatDate(roundDate, {day: 'numeric', month: 'short', year: 'numeric'}) + ' · END CREDITS';
  $('resultsDescription').textContent = state.status === 'won' ? state.mistakes === 0 ? 'A flawless take. Four connections, zero retakes.' : `Four connections found with ${state.mistakes} ${state.mistakes === 1 ? 'retake' : 'retakes'}.` : `${state.solved.length} of four connections found. There’s always another show.`;
  $('shareGrid').replaceChildren();
  for (const guess of state.history) {
    const row = document.createElement('div'); row.setAttribute('aria-label', guess.every(n => n === guess[0]) ? 'Correct group' : 'Incorrect guess');
    for (const level of guess) {const tile = document.createElement('i'); tile.className = COLORS[level]; tile.setAttribute('aria-hidden', 'true'); row.append(tile);}
    $('shareGrid').append(row);
  }
  $('shareStatus').textContent = ''; $('shareFallback').hidden = true;
  openDialog('resultsDialog');
}

function shareText() {
  return ['Filmi Connections 🎬', `${preview ? 'Preview' : 'Show ' + (puzzle.number || puzzle.id)} · ${formatDate(roundDate, {day: 'numeric', month: 'short', year: 'numeric'})}`, '', ...state.history.map(row => row.map(n => EMOJI[n]).join('')), '', `${state.solved.length}/4 connections · ${state.mistakes}/4 retakes`, location.origin + location.pathname].join('\n');
}
async function share() {
  const text = shareText();
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    $('shareStatus').textContent = 'Copied. Send a little cinema to someone.';
  } catch {
    $('shareText').value = text; $('shareFallback').hidden = false;
    $('shareText').focus(); $('shareText').select();
    $('shareStatus').textContent = 'Select and copy your result below.';
  }
}

function records() {
  const values = new Map(memory);
  try {for (let i = 0; i < localStorage.length; i++) {const key = localStorage.key(i); if (key?.startsWith(PREFIX)) values.set(key, localStorage.getItem(key));}} catch {storageWorks = false;}
  return [...values.entries()].filter(([key]) => key.startsWith(PREFIX)).map(([,value]) => parse(value)).filter(s => s && !s.archive && /^\d{4}-\d{2}-\d{2}$/.test(s.date));
}
function fillStatistics() {
  const stats = statistics(records(), dateKey());
  $('statPlayed').textContent = stats.played; $('statWinRate').textContent = stats.winRate + '%';
  $('statStreak').textContent = stats.current; $('statBest').textContent = stats.longest;
}
function fillArchive() {
  $('archiveList').replaceChildren();
  let undatedIndex = 0;
  const entries = dataset.puzzles.map(p => {
    const date = p.date || new Date(Date.parse(dataset.startDate + 'T00:00:00Z') + undatedIndex++ * 86400000).toISOString().slice(0, 10);
    return {raw: p, date};
  }).filter(p => p.date <= dateKey()).sort((a,b) => b.date.localeCompare(a.date));
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'archive-empty'; empty.textContent = 'The first show is still in the making. Try the preview puzzle while we set the scene.'; $('archiveList').append(empty); return;
  }
  for (const {raw, date} of entries) {
    const p = normalisePuzzle(raw); const saved = parse(readStorage(PREFIX + date + '.' + p.id));
    const validated = restoreState(p, date, false, saved);
    const button = document.createElement('button'); button.className = 'archive-item';
    const label = document.createElement('b'); label.textContent = formatDate(date);
    const status = document.createElement('span'); status.textContent = validated.status === 'won' ? '4/4 · Completed' : validated.status === 'lost' ? `${validated.solved.length}/4 · Finished` : date === dateKey() ? 'Today’s show →' : 'Play this show →';
    button.append(label, status); button.addEventListener('click', () => {loadRound(date); $('game').focus({preventScroll: true});});
    $('archiveList').append(button);
  }
}
function openDialog(id) {
  if (id === 'statsDialog') fillStatistics();
  if (id === 'archiveDialog') {if (!dataset) return; fillArchive();}
  const dialog = $(id); if (!dialog.open) dialog.showModal();
}
function closeDialogs() {document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());}
function updateCountdown() {
  const ms = millisecondsToMidnight();
  const seconds = Math.ceil(ms / 1000);
  $('countdown').textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  const today = dateKey();
  if (today !== lastDate) {lastDate = today; if (!archive) fetchDataset(true);}
}
function showUnavailable() {
  state = null; $('loading').hidden = true; $('board').replaceChildren(); $('solvedGroups').replaceChildren();
  const message = document.createElement('div'); message.className = 'load-error'; message.style.gridColumn = '1 / -1';
  message.textContent = 'The next show is being prepared. Come back soon for a new connection.'; $('board').append(message);
  $('board').setAttribute('aria-busy', 'false'); $('submitButton').disabled = true; $('shuffleButton').disabled = true; $('deselectButton').disabled = true;
  $('resultSummary').hidden = true;
  $('puzzleDate').textContent = formatDate(dateKey()); $('editionNumber').textContent = 'COMING SOON';
  $('previewNote').hidden = true; $('selectionCount').textContent = '';
  $('nextShowLabel').textContent = 'NEXT MIDNIGHT IN INDIA';
  say('A new story is on its way.');
}
async function fetchDataset(midnight = false) {
  try {
    const response = await fetch('./puzzles.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('Puzzle file unavailable');
    const next = validateDataset(await response.json()); dataset = next; loadRound();
    if (midnight) say(preview ? 'A new day, a little cinema. Try our preview edition.' : 'A new show is ready. Find today’s connections.');
  } catch (error) {
    console.error('Unable to load puzzle:', error);
    if (midnight && state) {say('The next puzzle could not load. Your current progress is saved.', 'attention'); return;}
    $('loading').hidden = true; $('board').setAttribute('aria-busy', 'false'); $('board').replaceChildren();
    const message = document.createElement('div'); message.className = 'load-error'; message.style.gridColumn = '1 / -1';
    message.append(document.createTextNode('A small interval. We couldn’t load the puzzle.'));
    const retry = document.createElement('button'); retry.className = 'button button-light'; retry.textContent = 'Try again'; retry.addEventListener('click', () => fetchDataset()); message.append(retry); $('board').append(message);
    $('submitButton').disabled = true; $('deselectButton').disabled = true; $('shuffleButton').disabled = true;
    say('Please try loading the show again.');
  }
}

$('shuffleButton').addEventListener('click', () => {if (!state || state.status !== 'playing' || busy) return; order = shuffleCards(order.filter(id => !state.solved.includes(puzzle.cards.find(c => c.id === id).groupId))); render(); say('A fresh arrangement. Same stories.');});
$('deselectButton').addEventListener('click', () => {selected.clear(); render(); say('A clean slate. Pick your next four.');});
$('submitButton').addEventListener('click', submit);
$('resultsButton').addEventListener('click', showResults);
$('shareButton').addEventListener('click', share);
$('todayButton').addEventListener('click', () => loadRound());
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openDialog(button.dataset.open)));
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog, index) => {
  const heading = dialog.querySelector('h2');
  if (!heading.id) heading.id = 'dialog-title-' + index;
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.addEventListener('click', event => {if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();});
});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && selected.size === 4 && !document.querySelector('dialog[open]') && (event.target === document.body || event.target.closest('.film-card'))) {event.preventDefault(); submit();}
});
document.addEventListener('visibilitychange', () => {if (!document.hidden) {updateCountdown(); if (dataset && !archive && roundDate !== dateKey()) fetchDataset(true);}});
window.addEventListener('storage', event => {if (state && event.key === storageKey()) loadRound(roundDate);});
fetchDataset(); updateCountdown(); setInterval(updateCountdown, 1000);
