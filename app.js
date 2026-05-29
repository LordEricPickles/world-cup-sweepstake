const DATA_PATHS = {
  sweepstake: './public/data/sweepstake.json',
  worldcup: './public/data/worldcup.json',
  overrides: './public/data/manual-overrides.json'
};

const FALLBACK_FINAL_PLACING = 999;
const STAGE_LABELS = {
  pending: 'Pending',
  groupStage: 'Group stage',
  roundOf32: 'Round of 32',
  roundOf16: 'Round of 16',
  quarterFinal: 'Quarter Final',
  semiFinal: 'Semi Final',
  final: 'Final',
  winner: 'Winner'
};

const state = { sweepstake: null, worldcup: null, overrides: null };
let activeFixtureFilter = 'all';
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}

async function init() {
  setupTabs();
  setupDrawTool();

  try {
    const [sweepstake, worldcup, overrides] = await Promise.all([
      loadJson(DATA_PATHS.sweepstake),
      loadJson(DATA_PATHS.worldcup),
      loadJson(DATA_PATHS.overrides)
    ]);

    state.sweepstake = sweepstake;
    state.worldcup = worldcup;
    state.overrides = overrides;

    setupDrawTool();
    renderAll();
    byId('statusText').textContent = worldcup.competition || 'Ready';
    byId('updatedText').textContent = worldcup.updatedAt ? `Data updated ${new Date(worldcup.updatedAt).toLocaleString('en-GB')} from ${worldcup.source ?? 'JSON'}` : 'No live data yet';
  } catch (error) {
    console.error(error);
    byId('statusText').textContent = 'Data error';
    byId('updatedText').textContent = error.message;
  }
}

function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.tab));
    });
  });
}

function milestones() {
  return state.sweepstake.milestones ?? [
    { id: 'roundOf32', label: 'Round of 32', rank: 1 },
    { id: 'roundOf16', label: 'Round of 16', rank: 2 },
    { id: 'quarterFinal', label: 'Quarter Final', rank: 3 },
    { id: 'semiFinal', label: 'Semi Final', rank: 4 },
    { id: 'final', label: 'Final', rank: 5 },
    { id: 'winner', label: 'Winner', rank: 6 }
  ];
}

function stageRank(stage) {
  if (stage === 'pending' || stage === 'groupStage') return 0;
  return milestones().find((milestone) => milestone.id === stage)?.rank ?? 0;
}

function stageLabel(stage) {
  return milestones().find((milestone) => milestone.id === stage)?.label ?? STAGE_LABELS[stage] ?? stage ?? 'Pending';
}

function potMap() {
  const map = new Map();
  for (const pot of state.sweepstake.pots ?? []) {
    for (const team of pot.teams ?? []) {
      map.set(team, {
        id: pot.id,
        label: pot.label ?? `Pot ${pot.id}`,
        pointsPerMilestone: pot.pointsPerMilestone ?? pot.id
      });
    }
  }
  return map;
}

function normaliseAssignment(entry) {
  if (typeof entry === 'string') {
    const pot = potMap().get(entry);
    return { name: entry, pot: pot?.id ?? null };
  }
  return { name: entry.name, pot: entry.pot ?? potMap().get(entry.name)?.id ?? null };
}

function allocatedTeams() {
  return state.sweepstake.players.flatMap((player) => (
    player.teams.map((entry) => ({ player: player.name, ...normaliseAssignment(entry) }))
  ));
}

function teamOwner(teamName) {
  return allocatedTeams().find((entry) => entry.name === teamName)?.player ?? 'Unallocated';
}

function teamDataMap() {
  return new Map((state.worldcup.teams ?? []).map((team) => [team.name, team]));
}

function manualResultMap() {
  return new Map((state.overrides.teamResults ?? []).map((team) => [team.name ?? team.team, team]));
}

function deriveStage(team) {
  if (team.stageReached) return team.stageReached;
  if ((team.status ?? 'pending') === 'pending' || (team.finishRank ?? FALLBACK_FINAL_PLACING) === FALLBACK_FINAL_PLACING) return 'pending';
  const rank = team.finishRank ?? FALLBACK_FINAL_PLACING;
  if (rank === 1) return 'winner';
  if (rank <= 2) return 'final';
  if (rank <= 4) return 'semiFinal';
  if (rank <= 8) return 'quarterFinal';
  if (rank <= 16) return 'roundOf16';
  if (rank <= 32) return 'roundOf32';
  return 'groupStage';
}

function getTeamStats(teamName) {
  const live = teamDataMap().get(teamName) ?? { name: teamName, status: 'pending', finishRank: FALLBACK_FINAL_PLACING };
  const manual = manualResultMap().get(teamName) ?? {};
  const merged = { ...live, ...manual, name: teamName };
  return {
    ...merged,
    stageReached: deriveStage(merged),
    finalPlacing: Number.isFinite(Number(merged.finalPlacing ?? merged.finishRank))
      ? Number(merged.finalPlacing ?? merged.finishRank)
      : FALLBACK_FINAL_PLACING
  };
}

function teamContribution(assignment) {
  const team = getTeamStats(assignment.name);
  const pot = potMap().get(assignment.name) ?? {
    id: assignment.pot,
    label: assignment.pot ? `Pot ${assignment.pot}` : 'Pot TBC',
    pointsPerMilestone: assignment.pot ?? 0
  };
  const reached = stageRank(team.stageReached);

  return {
    ...team,
    owner: assignment.player,
    potId: pot.id,
    potLabel: pot.label,
    pointsPerMilestone: pot.pointsPerMilestone,
    stageRank: reached,
    sweepstakePoints: reached * pot.pointsPerMilestone
  };
}

function playerRows() {
  return state.sweepstake.players.map((player) => {
    const teams = player.teams.map((entry) => teamContribution({ player: player.name, ...normaliseAssignment(entry) }));
    const stageTieBreakers = [...teams].sort(compareTeamsForTieBreak).map((team) => team.stageRank);
    const totalPoints = teams.reduce((sum, team) => sum + team.sweepstakePoints, 0);
    const combinedFinalPlacing = teams.reduce((sum, team) => sum + team.finalPlacing, 0);

    return {
      name: player.name,
      teams,
      totalPoints,
      stageTieBreakers,
      combinedFinalPlacing
    };
  }).sort(comparePlayers);
}

function compareTeamsForTieBreak(a, b) {
  return b.stageRank - a.stageRank
    || a.finalPlacing - b.finalPlacing
    || b.sweepstakePoints - a.sweepstakePoints
    || a.name.localeCompare(b.name);
}

function comparePlayers(a, b) {
  const pointDiff = b.totalPoints - a.totalPoints;
  if (pointDiff) return pointDiff;

  for (let index = 0; index < 4; index += 1) {
    const stageDiff = (b.stageTieBreakers[index] ?? 0) - (a.stageTieBreakers[index] ?? 0);
    if (stageDiff) return stageDiff;
  }

  return a.combinedFinalPlacing - b.combinedFinalPlacing || a.name.localeCompare(b.name);
}

function renderAll() {
  renderOverview();
  renderPlayers();
  renderLeaderboards();
  renderFixtures();
  renderRules();
}

function renderOverview() {
  const config = state.sweepstake;
  const allocated = allocatedTeams();
  const rows = playerRows();
  const leader = rows[0];

  byId('overview').innerHTML = `
    <h2>Overview</h2>
    <div class="grid">
      <article class="card"><span class="label">Competition</span><div>${escapeHtml(state.worldcup.competition ?? 'Not loaded')}</div></article>
      <article class="card"><span class="label">Players</span><div class="stat">${config.players.length}</div></article>
      <article class="card"><span class="label">Allocated teams</span><div class="stat">${allocated.length}</div></article>
      <article class="card"><span class="label">Draw pots</span><div class="stat">${config.pots?.length ?? 0}</div></article>
      <article class="card"><span class="label">Current leader</span><div class="stat small-stat">${escapeHtml(leader?.name ?? 'TBC')}</div></article>
      <article class="card"><span class="label">Pot</span><div class="stat">${money.format(config.potTotal ?? 0)}</div></article>
    </div>
    <p class="notice">Data source: ${escapeHtml(state.worldcup.sourceUrl ?? state.worldcup.source ?? 'manual JSON')}. Use manual overrides for stages or final placings that the source cannot infer.</p>
  `;
}

function renderPlayers() {
  byId('players').innerHTML = `
    <h2>Players</h2>
    <div class="grid">
      ${playerRows().map((player) => `
        <article class="card">
          <h3>${escapeHtml(player.name)}</h3>
          <p><strong>${player.totalPoints}</strong> points · final placing tie-breaker ${formatPlacingTotal(player.combinedFinalPlacing)}</p>
          <div class="tag-list">
            ${player.teams.map((team) => `<span class="tag ${escapeHtml(team.stageReached)}">${escapeHtml(team.name)} · ${escapeHtml(team.potLabel)} · ${team.sweepstakePoints} pts</span>`).join('')}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderLeaderboards() {
  const players = playerRows();
  const teams = allocatedTeams().map(teamContribution).sort(compareTeamsForTieBreak);

  byId('leaderboards').innerHTML = `
    <h2>Leaderboards</h2>
    <article class="card">
      <h3>Player standings</h3>
      ${table(['Rank', 'Player', 'Points', 'Best teams by stage', 'Final placing total'], players.map((player, index) => [
        index + 1,
        player.name,
        player.totalPoints,
        player.teams.sort(compareTeamsForTieBreak).map((team) => `${team.name} (${stageLabel(team.stageReached)})`).join(', '),
        formatPlacingTotal(player.combinedFinalPlacing)
      ]))}
    </article>
    <div class="grid" style="margin-top:16px">
      <article class="card">
        <h3>Team scores</h3>
        ${table(['Team', 'Owner', 'Pot', 'Stage', 'Score', 'Final placing'], teams.map((team) => [
          team.name,
          team.owner,
          team.potLabel,
          stageLabel(team.stageReached),
          team.sweepstakePoints,
          formatPlacing(team.finalPlacing)
        ]))}
      </article>
    </div>
  `;
}

function formatPlacing(value) {
  return value >= FALLBACK_FINAL_PLACING ? 'TBC' : value;
}

function formatPlacingTotal(value) {
  return value >= FALLBACK_FINAL_PLACING ? 'TBC' : value;
}

function renderFixtures() {
  const fixtures = state.worldcup.fixtures ?? [];
  const filters = ['all', 'finished', 'scheduled'];
  const filtered = fixtures.filter((match) => activeFixtureFilter === 'all' || match.status.toLowerCase() === activeFixtureFilter);

  byId('fixtures').innerHTML = `
    <h2>Fixtures</h2>
    <div class="tabs">${filters.map((filter) => `<button class="fixture-filter ${activeFixtureFilter === filter ? 'active' : ''}" data-filter="${filter}">${filter}</button>`).join('')}</div>
    ${filtered.length ? table(['Date', 'Round', 'Home', 'Score', 'Away', 'Group', 'Venue', 'Status'], filtered.map((match) => [
      match.date,
      match.round ?? '',
      match.home,
      score(match),
      match.away,
      match.group ?? '',
      match.ground ?? '',
      match.status
    ])) : '<p>No fixtures loaded yet.</p>'}
  `;

  document.querySelectorAll('.fixture-filter').forEach((button) => {
    button.addEventListener('click', () => {
      activeFixtureFilter = button.dataset.filter;
      renderFixtures();
    });
  });
}

function score(match) {
  if (match.homeScore === null || match.homeScore === undefined) return 'v';
  return `${match.homeScore}-${match.awayScore}`;
}

function renderRules() {
  const config = state.sweepstake;
  byId('rules').innerHTML = `
    <h2>Rules</h2>
    <div class="card">
      <h3>Current setup</h3>
      <ul>${(config.rulesSummary ?? []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>
      <h3>Scoring milestones</h3>
      ${table(['Milestone', 'Pot 1', 'Pot 2', 'Pot 3', 'Pot 4'], milestones().map((milestone) => [
        milestone.label,
        '1',
        '2',
        '3',
        '4'
      ]))}
      <h3 style="margin-top:20px">Pots</h3>
      <div class="grid">
        ${(config.pots ?? []).map((pot) => `
          <article class="card compact-card">
            <h3>${escapeHtml(pot.label ?? `Pot ${pot.id}`)}</h3>
            <p>${pot.pointsPerMilestone ?? pot.id} point${(pot.pointsPerMilestone ?? pot.id) === 1 ? '' : 's'} per milestone</p>
            <div class="tag-list">${(pot.teams ?? []).map((team) => `<span class="tag">${escapeHtml(team)}</span>`).join('')}</div>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function setupDrawTool() {
  const configuredPots = state.sweepstake?.pots ?? defaultDrawPots();
  byId('draw').innerHTML = `
    <h2>Draw tool</h2>
    <p>Paste 12 player names and 12 teams in each pot, then generate a repeatable pot-aware draw from a seed.</p>
    <label>Players, one per line</label>
    <textarea id="drawPlayers">${Array.from({ length: 12 }, (_, index) => `Player ${index + 1}`).join('\n')}</textarea>
    ${configuredPots.map((pot) => `
      <label>${escapeHtml(pot.label ?? `Pot ${pot.id}`)}, one team per line</label>
      <textarea id="drawPot${pot.id}">${(pot.teams ?? []).join('\n')}</textarea>
    `).join('')}
    <label>Seed<input id="drawSeed" value="world-cup-2026-sweepstake" /></label>
    <button class="primary" id="generateDraw">Generate draw</button>
    <h3 style="margin-top:20px">Output</h3>
    <pre id="drawOutput">Click generate to create JSON.</pre>
  `;
  byId('generateDraw').addEventListener('click', generateDraw);
}

function defaultDrawPots() {
  return [1, 2, 3, 4].map((id) => ({ id, label: `Pot ${id}`, teams: [] }));
}

function lines(id) {
  return byId(id).value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function generateDraw() {
  const players = lines('drawPlayers');
  const seed = byId('drawSeed').value.trim() || 'sweepstake';
  const pots = (state.sweepstake?.pots ?? defaultDrawPots()).map((pot) => ({
    ...pot,
    teams: lines(`drawPot${pot.id}`)
  }));

  const errors = [];
  if (players.length !== 12) errors.push(`Expected 12 players, found ${players.length}.`);
  for (const pot of pots) {
    if (pot.teams.length !== 12) errors.push(`Expected 12 teams in ${pot.label ?? `Pot ${pot.id}`}, found ${pot.teams.length}.`);
  }

  const duplicates = duplicateValues(pots.flatMap((pot) => pot.teams));
  if (duplicates.length) errors.push(`Duplicate teams: ${duplicates.join(', ')}.`);

  if (errors.length) {
    byId('drawOutput').textContent = errors.join('\n');
    return;
  }

  const shuffledPots = pots.map((pot) => ({
    ...pot,
    teams: seededShuffle(pot.teams, `${seed}:${pot.id}`)
  }));

  const assignments = players.map((name, playerIndex) => ({
    name,
    teams: shuffledPots.map((pot) => ({ name: pot.teams[playerIndex], pot: pot.id }))
  }));

  byId('drawOutput').textContent = JSON.stringify({
    drawSeed: seed,
    pots,
    players: assignments
  }, null, 2);
}

function duplicateValues(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates];
}

function seededShuffle(items, seed) {
  const random = mulberry32(hashString(seed));
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function hashString(value) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function next() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

init();
