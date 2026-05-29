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

  return {
    round: match.round ?? null,
    date: match.date ?? null,
    time: match.time ?? null,
    home: match.team1 ?? null,
    away: match.team2 ?? null,
    homeScore,
    awayScore,
    status: hasScore ? 'FINISHED' : 'SCHEDULED',
    group: match.group ?? null,
    ground: match.ground ?? null,
    source: 'openfootball'
  };
}

function emptyTeam(name) {
  return {
    name,
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

function addTeam(teams, name) {
  if (!name || /^W\d+$/i.test(name) || /^L\d+$/i.test(name)) return null;
  if (!teams.has(name)) teams.set(name, emptyTeam(name));
  return teams.get(name);
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
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.homeScore < match.awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const rows = [...teams.values()].map((team) => ({
    ...team,
    goalDifference: team.goalsFor - team.goalsAgainst,
    status: team.played > 0 ? 'alive' : 'pending'
  }));

  return rows
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.name.localeCompare(b.name))
    .map((team, index) => ({ ...team, finishRank: team.played > 0 ? index + 1 : 999 }));
}

function buildTopScorers(rawMatches) {
  const scorers = new Map();

  for (const match of rawMatches) {
    addGoals(scorers, match.goals1 ?? [], match.team1);
    addGoals(scorers, match.goals2 ?? [], match.team2);
  }

  return [...scorers.values()]
    .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player))
    .map((row, index) => ({ rank: index + 1, ...row }));
}

function addGoals(scorers, goals, team) {
  for (const goal of goals) {
    if (goal.own_goal || !goal.name) continue;
    const key = `${goal.name}::${team}`;
    const current = scorers.get(key) ?? {
      player: goal.name,
      team,
      goals: 0,
      penalties: 0
    };

    current.goals += 1;
    if (goal.penalty) current.penalties += 1;
    scorers.set(key, current);
  }
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
  const topScorers = buildTopScorers(rawMatches);

  const materialData = {
    source: 'openfootball/worldcup.json',
    sourceUrl,
    competition: raw.name ?? `World Cup ${season}`,
    season,
    teams,
    fixtures,
    topScorers,
    discipline: {
      teams: [],
      notes: 'openfootball/worldcup.json does not include yellow-card/red-card tables. Use manual-overrides.json or add a scraper source for cards.'
    }
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
  console.log(`Wrote ${fixtures.length} fixtures, ${teams.length} teams and ${topScorers.length} scorers from ${sourceUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
