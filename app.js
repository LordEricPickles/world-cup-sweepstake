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
let fixtureSortDescending = false;
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

function groupFixtures() {
  return (state.worldcup.fixtures ?? []).filter((match) => match.group);
}

function isCompletedMatch(match) {
  return String(match.status ?? '').toLowerCase() === 'finished'
    && match.homeScore !== null
    && match.homeScore !== undefined
    && match.awayScore !== null
    && match.awayScore !== undefined;
}

function hasCompletedGroupFixtures() {
  return groupFixtures().some(isCompletedMatch);
}

function allGroupFixturesComplete() {
  const fixtures = groupFixtures();
  return fixtures.length > 0 && fixtures.every(isCompletedMatch);
}

function hasConfirmedRoundOf32Field() {
  const qualified = new Set();
  for (const assignment of allocatedTeams()) {
    const manualStage = manualResultMap().get(assignment.name)?.stageReached;
    const stage = manualStage ?? automaticStage(assignment.name);
    if (stageRank(stage) > 0) qualified.add(assignment.name);
  }
  return qualified.size >= 32;
}

function useGroupDerivedScoring() {
  return hasCompletedGroupFixtures() && !hasConfirmedRoundOf32Field();
}

function provisionalScoringLabelActive() {
  return useGroupDerivedScoring() && !allGroupFixturesComplete();
}

function provisionalScoringNotice() {
  return '<p class="notice provisional-notice"><strong>Provisional scoring:</strong> Round of 32 qualification is assumed based on current group standings.</p>';
}

function activeScoringOptions() {
  return { provisional: useGroupDerivedScoring() };
}

function emptyGroupTeam(group, name) {
  return {
    group,
    name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    position: null
  };
}

function addGroupMatchStats(team, goalsFor, goalsAgainst) {
  team.played += 1;
  team.goalsFor += goalsFor;
  team.goalsAgainst += goalsAgainst;
  team.goalDifference = team.goalsFor - team.goalsAgainst;

  if (goalsFor > goalsAgainst) {
    team.wins += 1;
    team.points += 3;
  } else if (goalsFor === goalsAgainst) {
    team.draws += 1;
    team.points += 1;
  } else {
    team.losses += 1;
  }
}

function groupSortValue(groupName) {
  const [, letter] = String(groupName ?? '').match(/^Group ([A-Z])$/i) ?? [];
  return letter ? letter.toUpperCase().charCodeAt(0) : Number.POSITIVE_INFINITY;
}

function groupStandings() {
  const groups = new Map();
  const completedMatchesByGroup = new Map();

  for (const match of groupFixtures()) {
    if (!groups.has(match.group)) groups.set(match.group, new Map());
    if (!completedMatchesByGroup.has(match.group)) completedMatchesByGroup.set(match.group, []);

    const teams = groups.get(match.group);
    for (const teamName of [match.home, match.away]) {
      if (!teamName || isPlaceholderTeam(teamName)) continue;
      if (!teams.has(teamName)) teams.set(teamName, emptyGroupTeam(match.group, teamName));
    }

    if (!isCompletedMatch(match)) continue;

    completedMatchesByGroup.get(match.group).push(match);
    const home = teams.get(match.home);
    const away = teams.get(match.away);
    if (!home || !away) continue;

    addGroupMatchStats(home, Number(match.homeScore), Number(match.awayScore));
    addGroupMatchStats(away, Number(match.awayScore), Number(match.homeScore));
  }

  return [...groups.entries()]
    .sort(([left], [right]) => groupSortValue(left) - groupSortValue(right) || left.localeCompare(right))
    .map(([group, teams]) => {
      const completedMatches = completedMatchesByGroup.get(group) ?? [];
      const sortedTeams = sortGroupTeams([...teams.values()], completedMatches)
        .map((team, index) => ({ ...team, position: index + 1 }));

      return {
        group,
        teams: sortedTeams,
        hasPlayed: sortedTeams.some((team) => team.played > 0)
      };
    });
}

function sortGroupTeams(teams, completedMatches) {
  const teamsByPoints = new Map();
  for (const team of teams) {
    if (!teamsByPoints.has(team.points)) teamsByPoints.set(team.points, []);
    teamsByPoints.get(team.points).push(team);
  }

  return [...teamsByPoints.entries()]
    .sort(([left], [right]) => Number(right) - Number(left))
    .flatMap(([, tiedTeams]) => sortTeamsTiedOnPoints(tiedTeams, completedMatches));
}

function sortTeamsTiedOnPoints(teams, completedMatches) {
  const overallCriteria = [
    (team) => team.goalDifference,
    (team) => team.goalsFor
  ];
  const headToHeadCriteria = [
    (team, tiedTeams) => headToHeadStats(team.name, tiedTeams, completedMatches).points,
    (team, tiedTeams) => headToHeadStats(team.name, tiedTeams, completedMatches).goalDifference,
    (team, tiedTeams) => headToHeadStats(team.name, tiedTeams, completedMatches).goalsFor
  ];
  const criteria = hasCompleteHeadToHeadMiniTable(teams, completedMatches)
    ? [...headToHeadCriteria, ...overallCriteria]
    : overallCriteria;

  return sortByDescendingCriteria(teams, criteria);
}

function hasCompleteHeadToHeadMiniTable(teams, completedMatches) {
  if (teams.length <= 1) return true;

  const matches = completedMatches.filter((match) => isCompletedMatch(match));
  for (let leftIndex = 0; leftIndex < teams.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < teams.length; rightIndex += 1) {
      const leftName = teams[leftIndex].name;
      const rightName = teams[rightIndex].name;
      const hasMatch = matches.some((match) => (
        (match.home === leftName && match.away === rightName)
        || (match.home === rightName && match.away === leftName)
      ));
      if (!hasMatch) return false;
    }
  }

  return true;
}

function compareGroupTeams(a, b) {
  return b.points - a.points
    || b.goalDifference - a.goalDifference
    || b.goalsFor - a.goalsFor
    || a.name.localeCompare(b.name);
}

function sortByDescendingCriteria(items, criteria, index = 0) {
  if (items.length <= 1) return items;
  if (index >= criteria.length) return [...items].sort((a, b) => a.name.localeCompare(b.name));

  const grouped = new Map();
  for (const item of items) {
    const value = criteria[index](item, items);
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(item);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => Number(right) - Number(left))
    .flatMap(([, tiedItems]) => sortByDescendingCriteria(tiedItems, criteria, index + 1));
}

function headToHeadStats(teamName, tiedTeams, completedMatches) {
  const tiedNames = new Set(tiedTeams.map((team) => team.name));
  const stats = { points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };

  for (const match of completedMatches) {
    if (!tiedNames.has(match.home) || !tiedNames.has(match.away)) continue;
    if (match.home !== teamName && match.away !== teamName) continue;

    const isHome = match.home === teamName;
    const goalsFor = Number(isHome ? match.homeScore : match.awayScore);
    const goalsAgainst = Number(isHome ? match.awayScore : match.homeScore);
    stats.goalsFor += goalsFor;
    stats.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) stats.points += 3;
    if (goalsFor === goalsAgainst) stats.points += 1;
  }

  stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  return stats;
}

function thirdPlaceStandings(standings = groupStandings()) {
  return standings
    .filter((group) => group.hasPlayed)
    .map((group) => group.teams[2])
    .filter((team) => team && team.played > 0)
    .sort(compareThirdPlacedTeams)
    .map((team, index) => ({ ...team, thirdPlaceRank: index + 1 }));
}

function compareThirdPlacedTeams(a, b) {
  return b.points - a.points
    || b.goalDifference - a.goalDifference
    || b.goalsFor - a.goalsFor
    || a.name.localeCompare(b.name);
}

function provisionalQualificationMap() {
  const standings = groupStandings();
  const thirds = thirdPlaceStandings(standings);
  const bestThirdNames = new Set(thirds.slice(0, 8).map((team) => team.name));
  const thirdRanks = new Map(thirds.map((team) => [team.name, team.thirdPlaceRank]));
  const map = new Map();

  for (const group of standings) {
    for (const team of group.teams) {
      if (!group.hasPlayed || team.played === 0) {
        map.set(team.name, {
          qualified: false,
          reason: 'tbc',
          group: group.group,
          groupPosition: team.position,
          thirdPlaceRank: null
        });
        continue;
      }

      const isTopTwo = team.position <= 2;
      const thirdPlaceRank = thirdRanks.get(team.name) ?? null;
      const isBestThird = team.position === 3 && bestThirdNames.has(team.name);

      map.set(team.name, {
        qualified: isTopTwo || isBestThird,
        reason: isTopTwo ? 'group-top-two' : isBestThird ? 'best-third' : team.position === 3 ? 'third-place-outside-top-eight' : 'outside-qualifying',
        group: group.group,
        groupPosition: team.position,
        thirdPlaceRank
      });
    }
  }

  return map;
}

function effectiveStage(teamName, { provisional = false } = {}) {
  const manualStage = manualResultMap().get(teamName)?.stageReached;
  if (manualStage) return manualStage;

  const officialStage = automaticStage(teamName);
  if (stageRank(officialStage) > 0) return officialStage;

  if (provisional && provisionalQualificationMap().get(teamName)?.qualified) {
    return 'roundOf32';
  }

  return officialStage;
}

function getTeamStats(teamName, options = {}) {
  const manual = manualResultMap().get(teamName) ?? {};
  const finalPlacing = Number(manual.finalPlacing);
  return {
    ...manual,
    name: teamName,
    stageReached: effectiveStage(teamName, options),
    finalPlacing: Number.isFinite(finalPlacing)
      ? finalPlacing
      : FALLBACK_FINAL_PLACING
  };
}

function teamContribution(assignment, options = {}) {
  const team = getTeamStats(assignment.name, options);
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

function playerRows(options = {}) {
  const rows = state.sweepstake.players.map((player) => {
    const teams = player.teams.map((entry) => teamContribution({ player: player.name, ...normaliseAssignment(entry) }, options));
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
  renderGroups();
  renderFixtures();
  renderRules();
}

function renderOverview() {
  const config = state.sweepstake;
  const scoringOptions = activeScoringOptions();
  const rows = playerRows(scoringOptions);
  const isProvisional = provisionalScoringLabelActive();
  const leaderNames = rows[0]?.totalPoints > 0
    ? rows.filter((player) => player.rank === 1).map((player) => player.name).join(', ')
    : 'N/A';
  const provisionalNotice = isProvisional ? provisionalScoringNotice() : '';

  byId('overview').innerHTML = `
    <h2>Overview</h2>
    <div class="grid overview-grid">
      <article class="card stat-card leader-card">
        <span class="label">Current leader ${isProvisional ? '<span class="provisional-chip">Provisional</span>' : ''}</span>
        <div class="stat small-stat">${escapeHtml(leaderNames)}</div>
      </article>
      <article class="card stat-card pot-card"><span class="label">Pot</span><div class="stat">${money.format(config.potTotal ?? 0)}</div></article>
    </div>
    ${provisionalNotice}
    <h2>Players</h2>
    <div class="grid players-grid">
      ${rows.map((player) => `
        <article class="card player-card">
          <div class="player-card-header">
            <h3>${escapeHtml(player.name)}</h3>
            <strong class="score-pill">${player.totalPoints} pts</strong>
          </div>
          <div class="tag-list">
            ${player.teams.map((team) => `<span class="tag ${escapeHtml(team.stageReached)}"><span class="player-team-summary">${teamLabel(team.name)} · ${escapeHtml(team.potLabel)}</span><strong class="player-team-points">${team.sweepstakePoints} pts</strong></span>`).join('')}
          </div>
        </article>
      `).join('')}
    </div>
    <p class="notice">Data source: ${escapeHtml(state.worldcup.sourceUrl ?? state.worldcup.source ?? 'manual JSON')}. Use manual overrides for stages or final placings that the source cannot infer.</p>
  `;
}

function renderLeaderboards() {
  const scoringOptions = activeScoringOptions();
  const isProvisional = provisionalScoringLabelActive();
  const teams = allocatedTeams().map((team) => teamContribution(team, scoringOptions)).sort(compareTeamsByScore);
  const provisionalNotice = isProvisional ? provisionalScoringNotice() : '';

  byId('leaderboards').innerHTML = `
    <h2>Team scores ${isProvisional ? '<span class="provisional-chip">Provisional</span>' : ''}</h2>
    ${provisionalNotice}
    ${table(['Team', 'Score', 'Owner', 'Pot', 'Stage'], teams.map((team) => [
    htmlCell(teamLabel(team.name)),
    team.sweepstakePoints,
    team.owner,
    team.potLabel,
    htmlCell(leaderboardStageLabel(team.stageReached, isProvisional))
  ]), 'leaderboard-table')}
  `;
}

function leaderboardStageLabel(stage, isProvisional) {
  const isGroupStage = stage === 'groupStage' || (isProvisional && stage === 'pending');
  const desktopLabel = isGroupStage ? 'Group stage' : stageLabel(stage);
  const mobileLabels = {
    groupStage: 'GS',
    roundOf32: 'Ro32',
    roundOf16: 'Ro16',
    quarterFinal: 'QF',
    semiFinal: 'SF'
  };
  const mobileLabel = isGroupStage ? mobileLabels.groupStage : (mobileLabels[stage] ?? desktopLabel);

  return `<span class="leaderboard-stage-desktop">${escapeHtml(desktopLabel)}</span><span class="leaderboard-stage-mobile">${escapeHtml(mobileLabel)}</span>`;
}

function renderGroups() {
  const standings = groupStandings();
  const qualification = provisionalQualificationMap();

  byId('groups').innerHTML = `
    <h2>Group standings</h2>
    <div class="groups-grid">
      ${standings.map((group) => {
    const headingId = `group-${String(group.group).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;
    return `
        <section class="group-section" aria-labelledby="${headingId}">
          <h3 id="${headingId}">${escapeHtml(group.group)}</h3>
          ${groupStandingsTable(group.teams, qualification)}
        </section>
      `;
  }).join('')}
    </div>
  `;
}

function groupStandingsTable(teams, qualification) {
  return `
    <div class="table-wrap group-table-wrap">
      <table class="group-table">
        <thead>
          <tr><th>Team</th><th class="mobile-hidden">Owner</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GLS</th><th>PTS</th><th class="mobile-hidden">Status</th></tr>
        </thead>
        <tbody>
          ${teams.map((team) => {
    const meta = qualification.get(team.name);
    const rowClass = meta?.qualified ? 'group-qualified' : 'group-not-qualified';
    return `
              <tr class="${rowClass}">
                <td>${groupTeamLabel(team)}</td>
                <td class="mobile-hidden">${escapeHtml(teamOwner(team.name))}</td>
                <td>${team.played}</td><td>${team.wins}</td><td>${team.draws}</td><td>${team.losses}</td>
                <td>${team.goalsFor}:${team.goalsAgainst}</td><td>${team.points}</td>
                <td class="mobile-hidden">${qualificationBadge(meta)}</td>
              </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function groupTeamLabel(team) {
  return `<span class="group-team-item"><span class="group-position">${team.position}</span>${teamLabel(team.name)}<span class="group-team-owner">${escapeHtml(teamOwner(team.name))}</span></span>`;
}

function qualificationBadge(meta) {
  if (!meta || meta.reason === 'tbc') return '<span class="qualification-badge tbc">TBC</span>';
  if (meta.reason === 'group-top-two') return '<span class="qualification-badge qualified">Qualified</span>';
  if (meta.reason === 'best-third') return `<span class="qualification-badge best-third">Best 3rd #${escapeHtml(meta.thirdPlaceRank)}</span>`;
  if (meta.reason === 'third-place-outside-top-eight') return `<span class="qualification-badge outside-qualifying">3rd, #${escapeHtml(meta.thirdPlaceRank)}</span>`;
  return '<span class="qualification-badge outside-qualifying">Outside</span>';
}

function formatPlacing(value) {
  return value >= FALLBACK_FINAL_PLACING ? 'TBC' : value;
}

function formatPlacingTotal(value) {
  return value >= FALLBACK_FINAL_PLACING ? 'TBC' : value;
}

function fixtureDateValue(match) {
  const [, year, month, day] = String(match.date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  const [, hours, minutes, utcOffset] = String(match.time ?? '').match(/^(\d{1,2}):(\d{2}) UTC([+-]\d{1,2})$/) ?? [];
  if (year === undefined || hours === undefined) return Number.POSITIVE_INFINITY;

  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours) - Number(utcOffset),
    Number(minutes)
  );
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

  const utcDate = new Date(fixtureDateValue(match));
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
  const timeDiff = fixtureDateValue(left.match) - fixtureDateValue(right.match);
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
  if (fixtureSortDescending) fixtures.reverse();
  const filters = ['all', 'finished', 'scheduled'];
  const filterLabel = (filter) => filter.charAt(0).toUpperCase() + filter.slice(1);
  const filtered = fixtures.filter((match) => activeFixtureFilter === 'all' || match.status.toLowerCase() === activeFixtureFilter);

  byId('fixtures').innerHTML = `
    <h2>Fixtures</h2>
    <div class="fixture-controls">
      <div class="tabs">${filters.map((filter) => `<button class="fixture-filter ${activeFixtureFilter === filter ? 'active' : ''}" data-filter="${filter}">${filterLabel(filter)}</button>`).join('')}</div>
      <button class="fixture-sort-toggle" id="fixtureSortToggle" type="button" aria-pressed="${fixtureSortDescending}">${fixtureSortDescending ? 'Newest first' : 'Oldest first'}</button>
    </div>
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
  byId('fixtureSortToggle').addEventListener('click', () => {
    fixtureSortDescending = !fixtureSortDescending;
    renderFixtures();
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
      ${table(['Milestone', ...pots.map((pot) => pot.label ?? `Pot ${pot.id}`)], scoringRows, 'responsive-table milestone-table')}
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
