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

function normaliseMatch(match, index) {
  const displayScore = match.score?.et ?? match.score?.ft ?? [];
  const homeScore = displayScore[0] ?? null;
  const awayScore = displayScore[1] ?? null;
  const homePenaltyScore = match.score?.p?.[0] ?? null;
  const awayPenaltyScore = match.score?.p?.[1] ?? null;
  const hasScore = homeScore !== null && awayScore !== null;
  const winner = decisiveWinner(match);

  return {
    matchNumber: match.num ?? index + 1,
    round: match.round ?? null,
    date: match.date ?? null,
    time: match.time ?? null,
    home: match.team1 ?? null,
    away: match.team2 ?? null,
    homeScore,
    awayScore,
    homePenaltyScore,
    awayPenaltyScore,
    decidedBy: decisionType(match),
    winner,
    status: hasScore ? 'FINISHED' : 'SCHEDULED',
    group: match.group ?? null,
    ground: match.ground ?? null,
    source: 'openfootball'
  };
}

function decisionType(match) {
  if (match.score?.p) return 'penalties';
  if (match.score?.et) return 'extraTime';
  if (match.score?.ft) return 'regularTime';
  return null;
}

function decisiveWinner(match) {
  const [homeScore, awayScore] = match.score?.ft ?? [];
  if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined) return null;
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

  const materialData = {
    source: 'openfootball/worldcup.json',
    sourceUrl,
    competition: raw.name ?? `World Cup ${season}`,
    season,
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
  console.log(`Wrote ${fixtures.length} fixtures from ${sourceUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
