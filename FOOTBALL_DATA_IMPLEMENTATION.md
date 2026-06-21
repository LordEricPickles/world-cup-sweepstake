# football-data.org Primary Source Implementation Guide

This guide describes how to make football-data.org the primary World Cup data
source for `scripts/update-data.mjs`, while keeping the existing openfootball
JSON source as a fallback.

The goal is to keep the browser app unchanged. The updater should continue to
write `public/data/worldcup.json` in the existing fixture format.

## Local API Checks

Set your token locally. Do not commit it.

```bash
export FOOTBALL_DATA_TOKEN='your_api_key_here'
```

Check that the token can access the World Cup competition resource:

```bash
curl -i \
  -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
  "https://api.football-data.org/v4/competitions/WC"
```

Expected signs of success:

- HTTP status is `200`.
- Response headers include `X-Authenticated-Client`.
- JSON body includes `"code":"WC"` and `"name":"FIFA World Cup"`.

Check 2026 World Cup match data:

```bash
curl -i \
  -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
  "https://api.football-data.org/v4/competitions/WC/matches?season=2026"
```

Expected signs of success:

- HTTP status is `200`.
- JSON body includes a `matches` array.
- Match objects include fields like `utcDate`, `status`, `stage`, `group`,
  `venue`, `homeTeam`, `awayTeam`, and `score`.

If you have `jq`, inspect the first few normalized-relevant fields:

```bash
curl -s \
  -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
  "https://api.football-data.org/v4/competitions/WC/matches?season=2026" \
  | jq '.matches[:5] | map({
      id,
      utcDate,
      status,
      stage,
      group,
      venue,
      home: .homeTeam.name,
      away: .awayTeam.name,
      score: .score.fullTime,
      winner: .score.winner
    })'
```

If `jq` is not available, use Node:

```bash
curl -s \
  -H "X-Auth-Token: $FOOTBALL_DATA_TOKEN" \
  "https://api.football-data.org/v4/competitions/WC/matches?season=2026" \
  | node -e '
const chunks = [];
process.stdin.on("data", chunk => chunks.push(chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  console.log(JSON.stringify((data.matches ?? []).slice(0, 5).map(match => ({
    id: match.id,
    utcDate: match.utcDate,
    status: match.status,
    stage: match.stage,
    group: match.group,
    venue: match.venue,
    home: match.homeTeam?.name,
    away: match.awayTeam?.name,
    score: match.score?.fullTime,
    winner: match.score?.winner
  })), null, 2));
});
'
```

Also check the anonymous behavior, because this confirms why the token is
required in GitHub Actions:

```bash
curl -i "https://api.football-data.org/v4/competitions/WC/matches?season=2026"
```

This is expected to fail or return restricted access for match data.

## Environment Contract

Add this secret in GitHub:

- `FOOTBALL_DATA_TOKEN`: football-data.org API token.

Keep these existing environment variables:

- `WORLDCUP_SEASON`: defaults to `2026`.
- `WORLDCUP_SOURCE_URL`: optional override for the openfootball fallback URL.

Add these optional variables only if you want easier local testing:

- `FOOTBALL_DATA_COMPETITION`: defaults to `WC`.
- `FOOTBALL_DATA_BASE_URL`: defaults to `https://api.football-data.org/v4`.

The updater should behave like this:

1. Try football-data.org if `FOOTBALL_DATA_TOKEN` is present.
2. Accept that data only if it produces a non-empty normalized fixture list.
3. If the primary request fails or produces unusable data, fetch openfootball.
4. Write `public/data/worldcup.json` only if material data changed.

## Workflow Change

Update `.github/workflows/update-data.yml` so the refresh step receives the
token:

```yaml
jobs:
  refresh-and-deploy:
    env:
      WORLDCUP_SEASON: ${{ github.event.inputs.season || '2026' }}
      WORLDCUP_SOURCE_URL: ${{ github.event.inputs.source_url }}
      FOOTBALL_DATA_TOKEN: ${{ secrets.FOOTBALL_DATA_TOKEN }}
```

The rest of the workflow can stay as it is. The auto-commit action should still
only commit `public/data/worldcup.json`.

## Updater Structure

Keep the script dependency-free. Split the existing source-specific logic into
small adapter functions.

Suggested top-level constants:

```js
import { readFile, writeFile } from 'node:fs/promises';

const season = process.env.WORLDCUP_SEASON || '2026';
const openfootballSourceUrl = process.env.WORLDCUP_SOURCE_URL
  || `https://raw.githubusercontent.com/openfootball/worldcup.json/master/${season}/worldcup.json`;
const footballDataBaseUrl = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
const footballDataCompetition = process.env.FOOTBALL_DATA_COMPETITION || 'WC';
const footballDataToken = process.env.FOOTBALL_DATA_TOKEN || '';
const dataPath = new URL('../public/data/worldcup.json', import.meta.url);
```

Make `fetchJson` accept headers so both sources can share it:

```js
async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'world-cup-sweepstake-data-refresh/1.0',
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

## football-data.org Adapter

Fetch from the competition matches endpoint:

```js
async function fetchFootballData() {
  if (!footballDataToken) {
    throw new Error('FOOTBALL_DATA_TOKEN is not set');
  }

  const sourceUrl = `${footballDataBaseUrl}/competitions/${footballDataCompetition}/matches?season=${season}`;
  const raw = await fetchJson(sourceUrl, {
    'X-Auth-Token': footballDataToken
  });
  const fixtures = (raw.matches ?? []).map(normaliseFootballDataMatch);

  if (fixtures.length === 0) {
    throw new Error(`football-data.org returned no matches for ${footballDataCompetition} ${season}`);
  }

  return {
    source: 'football-data.org',
    sourceUrl,
    competition: raw.competition?.name ?? `World Cup ${season}`,
    season,
    fixtures
  };
}
```

Normalize one football-data.org match into the existing fixture shape:

```js
function normaliseFootballDataMatch(match) {
  const { date, time } = footballDataDateTime(match.utcDate);
  const homeScore = match.score?.fullTime?.home ?? null;
  const awayScore = match.score?.fullTime?.away ?? null;

  return {
    round: footballDataRound(match),
    date,
    time,
    home: cleanTeamName(match.homeTeam?.name),
    away: cleanTeamName(match.awayTeam?.name),
    homeScore,
    awayScore,
    winner: footballDataWinner(match),
    status: match.status ?? 'SCHEDULED',
    group: footballDataGroup(match.group),
    ground: match.venue ?? null,
    source: 'football-data.org'
  };
}
```

Date and time conversion:

```js
function footballDataDateTime(utcDate) {
  if (!utcDate) {
    return { date: null, time: null };
  }

  const date = new Date(utcDate);
  if (Number.isNaN(date.getTime())) {
    return { date: null, time: null };
  }

  const iso = date.toISOString();
  return {
    date: iso.slice(0, 10),
    time: `${iso.slice(11, 16)} UTC+0`
  };
}
```

Winner conversion:

```js
function footballDataWinner(match) {
  if (match.score?.winner === 'HOME_TEAM') return cleanTeamName(match.homeTeam?.name);
  if (match.score?.winner === 'AWAY_TEAM') return cleanTeamName(match.awayTeam?.name);
  return null;
}
```

Group conversion:

```js
function footballDataGroup(group) {
  const [, letter] = String(group ?? '').match(/^GROUP_([A-Z])$/) ?? [];
  return letter ? `Group ${letter}` : group ?? null;
}
```

Round conversion:

```js
const stageLabels = {
  GROUP_STAGE: 'Group Stage',
  LAST_32: 'Round of 32',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter Finals',
  SEMI_FINALS: 'Semi Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final'
};

function footballDataRound(match) {
  if (stageLabels[match.stage]) return stageLabels[match.stage];
  if (match.matchday) return `Matchday ${match.matchday}`;
  return match.stage ?? null;
}
```

Team names may include suffixes that do not match the existing sweepstake data.
Start conservatively and add mappings only when real API output proves they are
needed.

```js
const teamNameMap = new Map([
  ['United States FC', 'USA'],
  ['Korea Republic', 'South Korea'],
  ['C\u00f4te d\u2019Ivoire', 'Ivory Coast'],
  ['Cote dIvoire', 'Ivory Coast']
]);

function cleanTeamName(name) {
  if (!name) return null;
  return teamNameMap.get(name) ?? name.replace(/\s+FC$/, '');
}
```

After you run the local API checks, compare actual team names against
`public/data/sweepstake.json`. Expand `teamNameMap` only for mismatches that
would otherwise break ownership lookups.

## openfootball Fallback Adapter

Move the current normalization into an explicit fallback adapter:

```js
async function fetchOpenfootballData() {
  const raw = await fetchJson(openfootballSourceUrl);
  const fixtures = (raw.matches ?? []).map(normaliseOpenfootballMatch);

  if (fixtures.length === 0) {
    throw new Error(`openfootball returned no matches from ${openfootballSourceUrl}`);
  }

  return {
    source: 'openfootball/worldcup.json',
    sourceUrl: openfootballSourceUrl,
    competition: raw.name ?? `World Cup ${season}`,
    season,
    fixtures
  };
}
```

Rename the existing `normaliseMatch` function to make its source clear:

```js
function normaliseOpenfootballMatch(match) {
  const homeScore = match.score?.ft?.[0] ?? null;
  const awayScore = match.score?.ft?.[1] ?? null;
  const hasScore = homeScore !== null && awayScore !== null;
  const winner = decisiveOpenfootballWinner(match, homeScore, awayScore);

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
```

The existing extra-time and penalty winner logic can stay as-is, just renamed:

```js
function decisiveOpenfootballWinner(match, homeScore, awayScore) {
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
```

## Source Selection

Add a small primary/fallback selector:

```js
async function fetchTournamentData() {
  try {
    const data = await fetchFootballData();
    console.log(`Fetched ${data.fixtures.length} fixtures from ${data.sourceUrl}`);
    return data;
  } catch (error) {
    console.warn(`football-data.org unavailable: ${error.message}`);
    const fallback = await fetchOpenfootballData();
    console.log(`Fetched ${fallback.fixtures.length} fallback fixtures from ${fallback.sourceUrl}`);
    return fallback;
  }
}
```

Then `main` becomes source-agnostic:

```js
async function main() {
  const materialData = await fetchTournamentData();
  const current = await readCurrentData();

  if (stableJson(withoutUpdatedAt(current)) === stableJson(materialData)) {
    console.log(`No material data changes from ${materialData.sourceUrl}; leaving ${dataPath.pathname} unchanged.`);
    return;
  }

  const next = {
    updatedAt: new Date().toISOString(),
    ...materialData
  };

  await writeFile(dataPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Wrote ${materialData.fixtures.length} fixtures from ${materialData.sourceUrl}`);
}
```

## Validation Commands After Implementation

Run without a token to prove fallback still works:

```bash
unset FOOTBALL_DATA_TOKEN
node scripts/update-data.mjs
```

Run with a token to use football-data.org:

```bash
export FOOTBALL_DATA_TOKEN='your_api_key_here'
WORLDCUP_SEASON=2026 node scripts/update-data.mjs
```

Inspect the generated data:

```bash
node -e '
const data = require("./public/data/worldcup.json");
console.log({
  source: data.source,
  sourceUrl: data.sourceUrl,
  competition: data.competition,
  season: data.season,
  fixtureCount: data.fixtures.length,
  firstFixture: data.fixtures[0],
  statuses: [...new Set(data.fixtures.map(match => match.status))].sort()
});
'
```

Check for team names that do not map to the sweepstake team list:

```bash
node -e '
const worldcup = require("./public/data/worldcup.json");
const sweepstake = require("./public/data/sweepstake.json");
const knownTeams = new Set((sweepstake.pots ?? []).flatMap(pot => pot.teams ?? []).map(team => team.name));
const fixtureTeams = new Set((worldcup.fixtures ?? []).flatMap(match => [match.home, match.away]).filter(Boolean));
const missing = [...fixtureTeams].filter(team => !knownTeams.has(team)).sort();
console.log(JSON.stringify(missing, null, 2));
'
```

Check for obviously unusable fixture records:

```bash
node -e '
const data = require("./public/data/worldcup.json");
const bad = data.fixtures.filter(match =>
  !match.date ||
  !match.time ||
  !match.home ||
  !match.away ||
  !match.status
);
console.log(JSON.stringify(bad.slice(0, 20), null, 2));
console.log(`Bad fixture count: ${bad.length}`);
'
```

Review the data diff:

```bash
git diff -- public/data/worldcup.json
```

Serve the static site and inspect the core views:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`, then check:

- Overview
- Team scores
- Fixtures
- Draw tool
- Rules

Shut down the server when done.

## Acceptance Criteria

The implementation is ready when:

- GitHub Actions can refresh data with `FOOTBALL_DATA_TOKEN`.
- A missing, invalid, rate-limited, or failing football-data.org request falls
  back to openfootball.
- `public/data/worldcup.json` stays valid, pretty-printed JSON.
- The app loads without console errors.
- Fixture rows show sensible dates, teams, statuses, scores, groups, and venues.
- Team ownership still works after any required team-name mappings are added.
