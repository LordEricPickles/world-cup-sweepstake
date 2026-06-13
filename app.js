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
const TEAM_FLAGS = {
  Algeria: '🇩🇿',
  Argentina: '🇦🇷',
  Australia: '🇦🇺',
  Austria: '🇦🇹',
  Belgium: '🇧🇪',
  'Bosnia & Herzegovina': '🇧🇦',
  Brazil: '🇧🇷',
  Canada: '🇨🇦',
  'Cape Verde': '🇨🇻',
  Colombia: '🇨🇴',
  Croatia: '🇭🇷',
  Curaçao: '🇨🇼',
  'Czech Republic': '🇨🇿',
  'DR Congo': '🇨🇩',
  Ecuador: '🇪🇨',
  Egypt: '🇪🇬',
  England: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  France: '🇫🇷',
  Germany: '🇩🇪',
  Ghana: '🇬🇭',
  Haiti: '🇭🇹',
  Iran: '🇮🇷',
  Iraq: '🇮🇶',
  'Ivory Coast': '🇨🇮',
  Japan: '🇯🇵',
  Jordan: '🇯🇴',
  Mexico: '🇲🇽',
  Morocco: '🇲🇦',
  Netherlands: '🇳🇱',
  'New Zealand': '🇳🇿',
  Norway: '🇳🇴',
  Panama: '🇵🇦',
  Paraguay: '🇵🇾',
  Portugal: '🇵🇹',
  Qatar: '🇶🇦',
  'Saudi Arabia': '🇸🇦',
  Scotland: '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  Senegal: '🇸🇳',
  'South Africa': '🇿🇦',
  'South Korea': '🇰🇷',
  Spain: '🇪🇸',
  Sweden: '🇸🇪',
  Switzerland: '🇨🇭',
  Tunisia: '🇹🇳',
  Turkey: '🇹🇷',
  USA: '🇺🇸',
  Uruguay: '🇺🇾',
  Uzbekistan: '🇺🇿'
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
const htmlCell = (html) => ({ html });

function renderCell(cell) {
  return cell && typeof cell === 'object' && 'html' in cell ? cell.html : escapeHtml(cell);
}

function teamLabel(teamName) {
  const name = String(teamName ?? '');
  const flag = TEAM_FLAGS[name];
  if (!flag) return escapeHtml(name);
  return `<span class="team-label"><span class="team-flag" aria-hidden="true">${flag}</span><span>${escapeHtml(name)}</span></span>`;
}

function teamFlag(teamName) {
  const flag = TEAM_FLAGS[String(teamName ?? '')];
  return flag ? `<span class="team-flag" aria-hidden="true">${flag}</span>` : '';
}

function fixtureTeamLabel(teamName) {
  return `<span class="fixture-team-item">${teamLabel(teamName)} <span class="team-owner">(${escapeHtml(teamOwner(teamName))})</span></span>`;
}

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
    byId('updatedText').textContent = worldcup.updatedAt ? `Data updated ${new Date(worldcup.updatedAt).toLocaleString('en-GB')} from ${worldcup.source ?? 'JSON'}` : 'No live data yet';
  } catch (error) {
    console.error(error);
    byId('updatedText').textContent = `Data error: ${error.message}`;
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
        startingPoints: potStartingPoints(pot)
      });
    }
  }
  return map;
}

function potStartingPoints(pot) {
  return pot.startingPoints ?? pot.id ?? 0;
}

function milestoneAward(startingPoints, rank) {
  return startingPoints + rank - 1;
}

function cumulativeSweepstakePoints(startingPoints, reachedRank) {
  let total = 0;
  for (let rank = 1; rank <= reachedRank; rank += 1) {
    total += milestoneAward(startingPoints, rank);
  }
  return total;
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

function manualResultMap() {
  return new Map((state.overrides.teamResults ?? []).map((team) => [team.name ?? team.team, team]));
}

function isPlaceholderTeam(teamName) {
  const name = String(teamName ?? '').trim();
  return /^[WL]\d+$/i.test(name)
    || /^[123][A-L]$/i.test(name)
    || /^3[A-L](\/[A-L])+$/i.test(name);
}

function fixtureStage(round) {
  const label = String(round ?? '').trim().toLowerCase();
  if (label.includes('round of 32')) return 'roundOf32';
  if (label.includes('round of 16')) return 'roundOf16';
  if (label.includes('quarter-final') || label.includes('quarter final')) return 'quarterFinal';
  if (label.includes('semi-final') || label.includes('semi final')) return 'semiFinal';
  if (label === 'final') return 'final';
  return null;
}

function winnerName(match) {
  if (match.winner) return match.winner;
  if (match.homeScore === null || match.homeScore === undefined || match.awayScore === null || match.awayScore === undefined) return null;
  if (match.homeScore === match.awayScore) return null;
  return match.homeScore > match.awayScore ? match.home : match.away;
}

function automaticStage(teamName) {
  let stage = 'pending';

  for (const match of state.worldcup.fixtures ?? []) {
    const currentStage = fixtureStage(match.round);
    if (!currentStage) continue;

    const teams = [match.home, match.away].filter((team) => team && !isPlaceholderTeam(team));
    if (!teams.includes(teamName)) continue;
    if (stageRank(currentStage) > stageRank(stage)) stage = currentStage;

    if (winnerName(match) === teamName) {
      const nextStage = currentStage === 'final' ? 'winner' : milestones()[stageRank(currentStage)]?.id;
      if (nextStage && stageRank(nextStage) > stageRank(stage)) stage = nextStage;
    }
  }

  return stage;
}

function getTeamStats(teamName) {
  const manual = manualResultMap().get(teamName) ?? {};
  const finalPlacing = Number(manual.finalPlacing);
  return {
    ...manual,
    name: teamName,
    stageReached: manual.stageReached ?? automaticStage(teamName),
    finalPlacing: Number.isFinite(finalPlacing)
      ? finalPlacing
      : FALLBACK_FINAL_PLACING
  };
}

function teamContribution(assignment) {
  const team = getTeamStats(assignment.name);
  const pot = potMap().get(assignment.name) ?? {
    id: assignment.pot,
    label: assignment.pot ? `Pot ${assignment.pot}` : 'Pot TBC',
    startingPoints: assignment.pot ?? 0
  };
  const reached = stageRank(team.stageReached);

  return {
    ...team,
    owner: assignment.player,
    potId: pot.id,
    potLabel: pot.label,
    startingPoints: pot.startingPoints,
    stageRank: reached,
    sweepstakePoints: cumulativeSweepstakePoints(pot.startingPoints, reached)
  };
}

function playerRows() {
  const rows = state.sweepstake.players.map((player) => {
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
  const rankedRows = [];

  for (const [index, player] of rows.entries()) {
    const previous = rows[index - 1];
    const rank = previous && comparePlayerStanding(player, previous) === 0
      ? rankedRows[index - 1].rank
      : index + 1;
    rankedRows.push({ ...player, rank });
  }

  return rankedRows;
}

function compareTeamsForTieBreak(a, b) {
  return b.stageRank - a.stageRank
    || a.finalPlacing - b.finalPlacing
    || b.sweepstakePoints - a.sweepstakePoints
    || a.name.localeCompare(b.name);
}

function compareTeamsByScore(a, b) {
  return b.sweepstakePoints - a.sweepstakePoints
    || a.name.localeCompare(b.name);
}

function comparePlayers(a, b) {
  return comparePlayerStanding(a, b) || a.name.localeCompare(b.name);
}

function comparePlayerStanding(a, b) {
  const pointDiff = b.totalPoints - a.totalPoints;
  if (pointDiff) return pointDiff;

  for (let index = 0; index < 4; index += 1) {
    const stageDiff = (b.stageTieBreakers[index] ?? 0) - (a.stageTieBreakers[index] ?? 0);
    if (stageDiff) return stageDiff;
  }

  return a.combinedFinalPlacing - b.combinedFinalPlacing;
}

function renderAll() {
  renderOverview();
  renderLeaderboards();
  renderFixtures();
  renderRules();
}

function renderOverview() {
  const config = state.sweepstake;
  const rows = playerRows();
  const leaderNames = rows[0]?.totalPoints > 0
    ? rows.filter((player) => player.rank === 1).map((player) => player.name).join(', ')
    : 'N/A';

  byId('overview').innerHTML = `
    <h2>Overview</h2>
    <div class="grid overview-grid">
      <article class="card stat-card leader-card"><span class="label">Current leader</span><div class="stat small-stat">${escapeHtml(leaderNames)}</div></article>
      <article class="card stat-card pot-card"><span class="label">Pot</span><div class="stat">${money.format(config.potTotal ?? 0)}</div></article>
    </div>
    <h2>Players</h2>
    <div class="grid players-grid">
      ${rows.map((player) => `
        <article class="card player-card">
          <div class="player-card-header">
            <h3>${escapeHtml(player.name)}</h3>
            <strong class="score-pill">${player.totalPoints} pts</strong>
          </div>
          <p>Final placing tie-breaker ${formatPlacingTotal(player.combinedFinalPlacing)}</p>
          <div class="tag-list">
            ${player.teams.map((team) => `<span class="tag ${escapeHtml(team.stageReached)}">${teamLabel(team.name)} · ${escapeHtml(team.potLabel)} · ${team.sweepstakePoints} pts</span>`).join('')}
          </div>
        </article>
      `).join('')}
    </div>
    <p class="notice">Data source: ${escapeHtml(state.worldcup.sourceUrl ?? state.worldcup.source ?? 'manual JSON')}. Use manual overrides for stages or final placings that the source cannot infer.</p>
  `;
}

function renderLeaderboards() {
  const teams = allocatedTeams().map(teamContribution).sort(compareTeamsByScore);

  byId('leaderboards').innerHTML = `
    <h2>Team scores</h2>
    ${table(['Team', 'Score', 'Owner', 'Pot', 'Stage', 'Final placing'], teams.map((team) => [
    htmlCell(teamLabel(team.name)),
    team.sweepstakePoints,
    team.owner,
    team.potLabel,
    stageLabel(team.stageReached),
    formatPlacing(team.finalPlacing)
  ]), 'responsive-table')}
  `;
}

function formatPlacing(value) {
  return value >= FALLBACK_FINAL_PLACING ? 'TBC' : value;
}

function formatPlacingTotal(value) {
  return value >= FALLBACK_FINAL_PLACING ? 'TBC' : value;
}

function fixtureTimeMinutes(match) {
  const [, hours, minutes] = String(match.time ?? '').match(/^(\d{1,2}):(\d{2})/) ?? [];
  if (hours === undefined) return Number.POSITIVE_INFINITY;
  return Number(hours) * 60 + Number(minutes);
}

function ukFixtureDateTime(match) {
  const [, year, month, day] = String(match.date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  const [, hours, minutes, utcOffset] = String(match.time ?? '').match(/^(\d{1,2}):(\d{2}) UTC([+-]\d{1,2})$/) ?? [];
  if (year === undefined || hours === undefined) {
    return {
      date: match.date ?? '',
      time: match.time ?? ''
    };
  }

  const utcDate = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours) - Number(utcOffset),
    Number(minutes)
  ));
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(utcDate).map((part) => [part.type, part.value]));
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(utcDate);

  return {
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    time
  };
}

function fixtureDateCell(match) {
  const { date, time } = ukFixtureDateTime(match);
  const inlineTime = time ? ` <span class="fixture-time-inline">${escapeHtml(time)}</span>` : '';
  return `<span class="fixture-date-item">${escapeHtml(date)}${inlineTime}</span>`;
}

function compactFixtureDate(date) {
  const [, year, month, day] = String(date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (year === undefined) return date ?? '';

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)));
}

function compareFixturesByDateTime(left, right) {
  const leftDate = left.match.date ?? '9999-12-31';
  const rightDate = right.match.date ?? '9999-12-31';
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

  const timeDiff = fixtureTimeMinutes(left.match) - fixtureTimeMinutes(right.match);
  if (timeDiff !== 0) return timeDiff;

  return left.index - right.index;
}

function fixtureScoreMarkup(match) {
  if (match.homeScore === null || match.homeScore === undefined) return '<span class="fixture-score fixture-score-pending">v</span>';
  return `<span class="fixture-score">${escapeHtml(match.homeScore)}-${escapeHtml(match.awayScore)}</span>`;
}

function mobileFixtureTeam(match, side) {
  const teamName = side === 'home' ? match.home : match.away;
  const team = `<span class="fixture-card-team-name">${escapeHtml(teamName)}</span>`;
  const flag = teamFlag(teamName);

  if (side === 'home') {
    return `<span class="fixture-card-team fixture-card-team-home">${team} ${flag}</span>`;
  }

  return `<span class="fixture-card-team fixture-card-team-away">${flag} ${team}</span>`;
}

function mobileFixtureOwner(match, side) {
  const teamName = side === 'home' ? match.home : match.away;
  return `<span class="fixture-card-owner fixture-card-owner-${side}">(${escapeHtml(teamOwner(teamName))})</span>`;
}

function mobileFixtureCard(match) {
  const { date, time } = ukFixtureDateTime(match);
  const meta = [compactFixtureDate(date), time].filter(Boolean).map(escapeHtml).join(' · ');

  return `
    <article class="fixture-card">
      <div class="fixture-card-meta">${meta}</div>
      <div class="fixture-card-match">
        ${mobileFixtureTeam(match, 'home')}
        ${fixtureScoreMarkup(match)}
        ${mobileFixtureTeam(match, 'away')}
      </div>
      <div class="fixture-card-owners">
        ${mobileFixtureOwner(match, 'home')}
        <span class="fixture-card-owner-spacer" aria-hidden="true"></span>
        ${mobileFixtureOwner(match, 'away')}
      </div>
    </article>
  `;
}

function renderFixtures() {
  const fixtures = (state.worldcup.fixtures ?? [])
    .map((match, index) => ({ match, index }))
    .sort(compareFixturesByDateTime)
    .map(({ match }) => match);
  const filters = ['all', 'finished', 'scheduled'];
  const filtered = fixtures.filter((match) => activeFixtureFilter === 'all' || match.status.toLowerCase() === activeFixtureFilter);

  byId('fixtures').innerHTML = `
    <h2>Fixtures</h2>
    <div class="tabs">${filters.map((filter) => `<button class="fixture-filter ${activeFixtureFilter === filter ? 'active' : ''}" data-filter="${filter}">${filter}</button>`).join('')}</div>
    ${filtered.length ? `
      <div class="fixture-desktop-table">
        ${table(['Date', { label: 'Time', hideOnMobile: true }, { label: 'Round', hideOnMobile: true }, 'Home', 'Score', 'Away', { label: 'Group', hideOnMobile: true }, { label: 'Venue', hideOnMobile: true }], filtered.map((match) => [
    htmlCell(fixtureDateCell(match)),
    ukFixtureDateTime(match).time,
    match.round ?? '',
    htmlCell(fixtureTeamLabel(match.home)),
    score(match),
    htmlCell(fixtureTeamLabel(match.away)),
    match.group ?? '',
    match.ground ?? ''
  ]), 'responsive-table fixture-table')}
      </div>
      <div class="mobile-fixture-list">${filtered.map(mobileFixtureCard).join('')}</div>
    ` : '<p>No fixtures loaded yet.</p>'}
  `;

  document.querySelectorAll('.fixture-filter').forEach((button) => {
    button.addEventListener('click', () => {
      activeFixtureFilter = button.dataset.filter;
      renderFixtures();
    });
  });
}

function score(match) {
  return htmlCell(fixtureScoreMarkup(match));
}

function renderRules() {
  const config = state.sweepstake;
  const pots = config.pots ?? [];
  const scoringRows = [
    ...milestones().map((milestone) => [
      milestone.label,
      ...pots.map((pot) => milestoneAward(potStartingPoints(pot), milestone.rank))
    ]),
    [
      'Possible winning total',
      ...pots.map((pot) => cumulativeSweepstakePoints(potStartingPoints(pot), milestones().length))
    ]
  ];
  byId('rules').innerHTML = `
    <h2>Rules</h2>
    <div class="card">
      <h3>Current setup</h3>
      <ul>${(config.rulesSummary ?? []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>
      <h3>Scoring milestones</h3>
      ${table(['Milestone', ...pots.map((pot) => pot.label ?? `Pot ${pot.id}`)], scoringRows, 'responsive-table')}
      <h3 style="margin-top:20px">Pots</h3>
      <div class="grid">
        ${pots.map((pot) => `
          <article class="card compact-card">
            <h3>${escapeHtml(pot.label ?? `Pot ${pot.id}`)}</h3>
            <p>Starts at ${potStartingPoints(pot)} point${potStartingPoints(pot) === 1 ? '' : 's'}, +1 each milestone</p>
            <div class="tag-list">${(pot.teams ?? []).map((team) => `<span class="tag">${teamLabel(team)}</span>`).join('')}</div>
          </article>
        `).join('')}
      </div>
    </div>
  `;
}

function table(headers, rows, tableClass = '') {
  const columns = headers.map((header) => (
    typeof header === 'object' ? header : { label: header }
  ));
  const classAttribute = tableClass ? ` class="${escapeHtml(tableClass)}"` : '';
  const columnClass = (column) => column.hideOnMobile ? ' class="mobile-hidden"' : '';

  return `
    <div class="table-wrap">
      <table${classAttribute}>
        <thead><tr>${columns.map((column) => `<th${columnClass(column)}>${escapeHtml(column.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td${columnClass(columns[index] ?? {})} data-label="${escapeHtml(columns[index]?.label ?? '')}">${renderCell(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
}

function setupDrawTool() {
  const playerNames = state.sweepstake?.players?.map((player) => player.name)
    ?? Array.from({ length: 12 }, (_, index) => `Player ${index + 1}`);
  const seed = state.sweepstake?.drawSeed ?? 'world-cup-2026-sweepstake';
  byId('draw').innerHTML = `
    <h2>Draw tool</h2>
    <p>Paste 12 player names, then generate a repeatable draw using the official pots from the sweepstake data.</p>
    <label>Players, one per line</label>
    <textarea id="drawPlayers">${escapeHtml(playerNames.join('\n'))}</textarea>
    <label>Seed<input id="drawSeed" value="${escapeHtml(seed)}" /></label>
    <button class="primary" id="generateDraw">Generate draw</button>
    <h3 style="margin-top:20px">Output</h3>
    <div id="drawOutput" class="draw-output"><p>Click generate to create the draw.</p></div>
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
  const pots = state.sweepstake?.pots ?? defaultDrawPots();

  const errors = [];
  if (players.length !== 12) errors.push(`Expected 12 players, found ${players.length}.`);
  for (const pot of pots) {
    const teams = pot.teams ?? [];
    if (teams.length !== 12) errors.push(`Expected 12 teams in ${pot.label ?? `Pot ${pot.id}`}, found ${teams.length}.`);
  }

  const duplicates = duplicateValues(pots.flatMap((pot) => pot.teams ?? []));
  if (duplicates.length) errors.push(`Duplicate teams: ${duplicates.join(', ')}.`);

  if (errors.length) {
    byId('drawOutput').innerHTML = `<pre>${escapeHtml(errors.join('\n'))}</pre>`;
    return;
  }

  const shuffledPots = pots.map((pot) => ({
    ...pot,
    teams: seededShuffle(pot.teams ?? [], `${seed}:${pot.id}`)
  }));

  const assignments = players.map((name, playerIndex) => ({
    name,
    teams: shuffledPots.map((pot) => ({ name: pot.teams[playerIndex], pot: pot.id }))
  }));

  const potHeaders = pots.map((pot) => pot.label ?? `Pot ${pot.id}`);
  const rows = assignments.map((player) => [
    player.name,
    ...pots.map((pot) => htmlCell(teamLabel(player.teams.find((team) => team.pot === pot.id)?.name ?? '')))
  ]);
  const playersJson = JSON.stringify(assignments, null, 2);

  byId('drawOutput').innerHTML = `
    ${table(['Player', ...potHeaders], rows, 'responsive-table')}
    <details class="json-details">
      <summary>Show JSON</summary>
      <pre>${escapeHtml(playersJson)}</pre>
    </details>
  `;
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
