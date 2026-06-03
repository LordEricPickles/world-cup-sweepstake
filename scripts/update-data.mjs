import { readFile, writeFile } from 'node:fs/promises';

const season = process.env.WORLDCUP_SEASON || '2026';
const sourceUrl = process.env.WORLDCUP_SOURCE_URL || `https://raw.githubusercontent.com/openfootball/worldcup.json/master/${season}/worldcup.json`;
const dataPath = new URL('../public/data/worldcup.json', import.meta.url);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'world-cup-sweepstake-data-refresh/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function readCurrentData() {
  try {
    return JSON.parse(await readFile(dataPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function normaliseMatch(match) {
  const homeScore = match.score?.ft?.[0] ?? null;
  const awayScore = match.score?.ft?.[1] ?? null;
  const hasScore = homeScore !== null && awayScore !== null;
  const winner = decisiveWinner(match, homeScore, awayScore);

  return {
    round: match.round ?? null,
    date: match.date ?? null,
    time: match.time ?? null,
    home: match.team1 ?? null,
    away: match.team2 ?? null,
    homeScore,
    awayScore,
    winner,
    status: hasScore ? 'FINISHED' : 'SCHEDULED',
    group: match.group ?? null,
    ground: match.ground ?? null,
    source: 'openfootball'
  };
}

function decisiveWinner(match, homeScore, awayScore) {
  if (homeScore === null || awayScore === null) return null;
  if (homeScore > awayScore) return match.team1 ?? null;
  if (awayScore > homeScore) return match.team2 ?? null;

  for (const scoreKey of ['et', 'p']) {
    const [homeDecider, awayDecider] = match.score?.[scoreKey] ?? [];
    if (homeDecider === undefined || awayDecider === undefined) continue;
    if (homeDecider > awayDecider) return match.team1 ?? null;
    if (awayDecider > homeDecider) return match.team2 ?? null;
  }

  return null;
}

function emptyTeam(name) {
  return {
    name,
    played: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0
  };
}

function addTeam(teams, name) {
  if (!name || isPlaceholderTeam(name)) return null;
  if (!teams.has(name)) teams.set(name, emptyTeam(name));
  return teams.get(name);
}

function isPlaceholderTeam(name) {
  return /^[WL]\d+$/i.test(name)
    || /^[123][A-L]$/i.test(name)
    || /^3[A-L](\/[A-L])+$/i.test(name);
}

function buildTeamTable(matches) {
  const teams = new Map();

  for (const match of matches) {
    const home = addTeam(teams, match.home);
    const away = addTeam(teams, match.away);

    if (!home || !away) continue;
    if (match.homeScore === null || match.awayScore === null) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.points += 3;
    } else if (match.homeScore < match.awayScore) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  }

  const rows = [...teams.values()].map((team) => ({
    ...team,
    goalDifference: team.goalsFor - team.goalsAgainst,
  }));

  return rows
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name))
    .map((team, index) => ({ name: team.name, finishRank: team.played > 0 ? index + 1 : 999 }));
}

function withoutUpdatedAt(data) {
  if (!data) return null;
  const { updatedAt, ...rest } = data;
  return rest;
}

function stableJson(data) {
  return JSON.stringify(data, null, 2);
}

async function main() {
  const raw = await fetchJson(sourceUrl);
  const rawMatches = raw.matches ?? [];
  const fixtures = rawMatches.map(normaliseMatch);
  const teams = buildTeamTable(fixtures);

  const materialData = {
    source: 'openfootball/worldcup.json',
    sourceUrl,
    competition: raw.name ?? `World Cup ${season}`,
    season,
    teams,
    fixtures
  };

  const current = await readCurrentData();

  if (stableJson(withoutUpdatedAt(current)) === stableJson(materialData)) {
    console.log(`No material data changes from ${sourceUrl}; leaving ${dataPath.pathname} unchanged.`);
    return;
  }

  const next = {
    updatedAt: new Date().toISOString(),
    ...materialData
  };

  await writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${fixtures.length} fixtures and ${teams.length} teams from ${sourceUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
