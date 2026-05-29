const DATA_PATHS = {
  sweepstake: './public/data/sweepstake.json',
  worldcup: './public/data/worldcup.json',
  overrides: './public/data/manual-overrides.json'
};

const state = {
  sweepstake: null,
  worldcup: null,
  overrides: null
};

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

    renderAll();
    byId('statusText').textContent = 'Ready';
    byId('updatedText').textContent = worldcup.updatedAt ? `Data updated ${new Date(worldcup.updatedAt).toLocaleString('en-GB')}` : 'No live data yet';
  } catch (error) {
    console.error(error);
    byId('statusText').textContent = 'Data error';
    byId('updatedText').textContent = error.message;
  }
}

function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === target));
    });
  });
}

function allocatedTeams() {
  return state.sweepstake.players.flatMap((player) => player.teams.map((team) => ({ player: player.name, team })));
}

function teamOwner(teamName) {
  return allocatedTeams().find((entry) => entry.team === teamName)?.player ?? 'Unallocated';
}

function teamDataMap() {
  return new Map((state.worldcup.teams ?? []).map((team) => [team.name, team]));
}

function getTeamStats(teamName) {
  return teamDataMap().get(teamName) ?? {
    name: teamName,
    status: 'pending',
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    finishRank: 999
  };
}

function goalDifference(team) {
  return (team.goalsFor ?? 0) - (team.goalsAgainst ?? 0);
}

function entertainmentScore(team) {
  return (team.goalsFor ?? 0) + (team.goalsAgainst ?? 0);
}

function sortByFinish(a, b) {
  return (a.finishRank ?? 999) - (b.finishRank ?? 999)
    || (b.points ?? 0) - (a.points ?? 0)
    || goalDifference(b) - goalDifference(a)
    || (b.goalsFor ?? 0) - (a.goalsFor ?? 0)
    || a.name.localeCompare(b.name);
}

function allocatedTeamRows() {
  return allocatedTeams().map(({ player, team }) => ({ player, ...getTeamStats(team) }));
}

function prizeAmount(share) {
  const pot = state.sweepstake.potTotal ?? 0;
  return money.format(pot * share);
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
  const excluded = config.excludedTeams ?? [];
  const aliveCount = allocated.filter(({ team }) => getTeamStats(team).status !== 'eliminated').length;

  byId('overview').innerHTML = `
    <h2>Overview</h2>
    <div class="grid">
      <article class="card"><span class="label">Players</span><div class="stat">${config.players.length}</div></article>
      <article class="card"><span class="label">Allocated teams</span><div class="stat">${allocated.length}</div></article>
      <article class="card"><span class="label">Excluded teams</span><div class="stat">${excluded.length}</div></article>
      <article class="card"><span class="label">Still alive</span><div class="stat">${aliveCount}</div></article>
      <article class="card"><span class="label">Pot</span><div class="stat">${money.format(config.potTotal ?? 0)}</div></article>
      <article class="card"><span class="label">Draw seed</span><div>${escapeHtml(config.drawSeed ?? 'Not set')}</div></article>
    </div>
    <h3 style="margin-top:24px">Prizes</h3>
    ${table(['Prize', 'Share', 'Amount'], config.prizes.map((prize) => [prize.label, `${Math.round(prize.share * 100)}%`, prizeAmount(prize.share)]))}
    <p class="notice">Tip: use the Draw tool to generate a repeatable allocation, then paste the final teams into <code>public/data/sweepstake.json</code>.</p>
  `;
}

function renderPlayers() {
  byId('players').innerHTML = `
    <h2>Players</h2>
    <div class="grid">
      ${state.sweepstake.players.map((player) => `
        <article class="card">
          <h3>${escapeHtml(player.name)}</h3>
          <div class="tag-list">
            ${player.teams.map((team) => {
              const stats = getTeamStats(team);
              return `<span class="tag ${escapeHtml(stats.status)}">${escapeHtml(team)}</span>`;
            }).join('')}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderLeaderboards() {
  const rows = allocatedTeamRows();
  const finish = [...rows].sort(sortByFinish);
  const outsiders = rows.filter((team) => state.sweepstake.outsiderTeams?.includes(team.name)).sort(sortByFinish);
  const worst = [...rows].sort((a, b) => (a.points ?? 0) - (b.points ?? 0) || goalDifference(a) - goalDifference(b) || (a.goalsFor ?? 0) - (b.goalsFor ?? 0));
  const entertainers = [...rows].sort((a, b) => entertainmentScore(b) - entertainmentScore(a) || (b.goalsFor ?? 0) - (a.goalsFor ?? 0));
  const topScorers = state.overrides.topScorers ?? [];
  const discipline = state.overrides.discipline?.teams ?? [];

  byId('leaderboards').innerHTML = `
    <h2>Leaderboards</h2>
    <div class="grid">
      ${leaderboardCard('Best finishing allocated teams', finish.slice(0, 8), 'finish')}
      ${leaderboardCard('Best outsiders', outsiders.slice(0, 8), 'finish')}
      ${leaderboardCard('Wooden spoon candidates', worst.slice(0, 8), 'worst')}
      ${leaderboardCard('Most entertaining teams', entertainers.slice(0, 8), 'entertainers')}
    </div>
    <h3 style="margin-top:24px">Manual stat prizes</h3>
    <div class="grid">
      <article class="card">
        <h3>Top scorers</h3>
        ${topScorers.length ? table(['Player', 'Team', 'Owner', 'Goals'], topScorers.map((item) => [item.player, item.team, teamOwner(item.team), item.goals])) : '<p>No top scorer data yet.</p>'}
      </article>
      <article class="card">
        <h3>Cards</h3>
        ${discipline.length ? table(['Team', 'Owner', 'Y', 'R', 'Pts'], discipline.map((item) => [item.team, teamOwner(item.team), item.yellowCards, item.redCards, item.cardPoints])) : '<p>No card data yet.</p>'}
      </article>
    </div>
  `;
}

function leaderboardCard(title, rows, mode) {
  const body = rows.length
    ? table(['Team', 'Owner', 'Pts', 'GD', mode === 'entertainers' ? 'Total goals' : 'Rank'], rows.map((team) => [
        team.name,
        team.player,
        team.points ?? 0,
        goalDifference(team),
        mode === 'entertainers' ? entertainmentScore(team) : (team.finishRank ?? 'TBC')
      ]))
    : '<p>No data yet.</p>';
  return `<article class="card"><h3>${escapeHtml(title)}</h3>${body}</article>`;
}

function renderFixtures() {
  const fixtures = state.worldcup.fixtures ?? [];
  byId('fixtures').innerHTML = `
    <h2>Fixtures</h2>
    ${fixtures.length ? table(['Date', 'Home', 'Score', 'Away', 'Status'], fixtures.map((match) => [
      match.date,
      match.home,
      score(match),
      match.away,
      match.status
    ])) : '<p>No fixtures loaded yet.</p>'}
  `;
}

function score(match) {
  if (match.homeScore === null || match.homeScore === undefined) return 'v';
  return `${match.homeScore}–${match.awayScore}`;
}

function renderRules() {
  const config = state.sweepstake;
  byId('rules').innerHTML = `
    <h2>Rules</h2>
    <div class="card">
      <h3>Current setup</h3>
      <ul>
        ${(config.rulesSummary ?? []).map((rule) => `<li>${escapeHtml(rule)}</li>`).join('')}
      </ul>
      <h3>Excluded teams</h3>
      <div class="tag-list">${(config.excludedTeams ?? []).map((team) => `<span class="tag excluded">${escapeHtml(team)}</span>`).join('')}</div>
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
  byId('draw').innerHTML = `
    <h2>Draw tool</h2>
    <p>Paste player names and teams, choose how many teams to allocate, then generate a repeatable draw from a seed.</p>
    <label>Players, one per line</label>
    <textarea id="drawPlayers">Player 1\nPlayer 2\nPlayer 3\nPlayer 4\nPlayer 5\nPlayer 6\nPlayer 7\nPlayer 8\nPlayer 9\nPlayer 10</textarea>
    <label>Teams, one per line. Put preferred/top teams first if you plan to cut off the bottom teams.</label>
    <textarea id="drawTeams">England\nBrazil\nFrance\nArgentina\nSpain\nPortugal\nGermany\nNetherlands\nBelgium\nItaly\nJapan\nMorocco\nCroatia\nUruguay\nUSA\nMexico\nColombia\nSwitzerland\nSouth Korea\nSenegal\nScotland\nNorway\nGhana\nPanama\nNew Zealand\nTunisia\nBolivia\nSouth Africa\nEgypt\nJamaica\nAlgeria\nHonduras\nQatar\nHaiti\nSaudi Arabia\nJordan\nParaguay\nCuracao\nAustralia\nCape Verde\nTeam 41\nTeam 42\nTeam 43\nTeam 44\nTeam 45\nTeam 46\nTeam 47\nTeam 48</textarea>
    <div class="grid">
      <label>Teams to allocate<input id="teamsToAllocate" type="number" value="40" min="1" /></label>
      <label>Seed<input id="drawSeed" value="world-cup-2026-sweepstake" /></label>
    </div>
    <button class="primary" id="generateDraw">Generate draw</button>
    <h3 style="margin-top:20px">Output</h3>
    <pre id="drawOutput">Click generate to create JSON.</pre>
  `;

  byId('generateDraw').addEventListener('click', generateDraw);
}

function lines(id) {
  return byId(id).value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function generateDraw() {
  const players = lines('drawPlayers');
  const allTeams = lines('drawTeams');
  const count = Number(byId('teamsToAllocate').value || allTeams.length);
  const seed = byId('drawSeed').value.trim() || 'sweepstake';
  const includedTeams = allTeams.slice(0, count);
  const excludedTeams = allTeams.slice(count);
  const shuffled = seededShuffle(includedTeams, seed);
  const assignments = players.map((name) => ({ name, teams: [] }));

  shuffled.forEach((team, index) => {
    assignments[index % assignments.length].teams.push(team);
  });

  const output = {
    drawSeed: seed,
    players: assignments,
    excludedTeams
  };

  byId('drawOutput').textContent = JSON.stringify(output, null, 2);
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
