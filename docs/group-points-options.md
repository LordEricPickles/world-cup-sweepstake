# Group points implementation options

## Goal

Display preliminary sweepstake scores during the World Cup group stage based on the current position of each team in its group, before the app can infer knockout-stage qualification from Round of 32 fixtures.

The current app already:

- Runs as a static app with JSON data in `public/data`, with no backend or database.
- Loads `sweepstake.json`, `worldcup.json`, and `manual-overrides.json` in `app.js`.
- Calculates each player's total from `teamContribution()`, `playerRows()`, and `cumulativeSweepstakePoints()`.
- Infers official sweepstake stages from knockout fixtures in `automaticStage()`, but group-stage teams remain at `pending` or `groupStage` until knockout participants are known.
- Refreshes fixture data from `openfootball/worldcup.json` via `scripts/update-data.mjs`.

The requested feature is therefore a provisional layer: it should not replace final scoring rules, but should show how the sweepstake would look if group positions today decided who had reached the Round of 32.

## Scoring interpretation to confirm

The simplest interpretation is:

- Top two teams in each group are provisionally awarded `roundOf32`.
- The eight best third-placed teams are provisionally awarded `roundOf32`.
- All other teams remain on `groupStage` / `pending` with zero sweepstake points.
- Points use the existing pot-based Round of 32 award, so Pot 1 gets 1 point, Pot 2 gets 2 points, Pot 3 gets 3 points, and Pot 4 gets 4 points.

This matches the 48-team World Cup format and the app's current milestone model, where Round of 32 is the first scoring milestone.

### Qualification logic note

The provisional scorer needs two separate ranking passes:

1. Rank the four teams inside every group.
2. Pull out the team currently ranked third in each of the 12 groups, then rank those 12 third-placed teams against each other.

Award provisional `roundOf32` points to:

- every team ranked 1st in its group;
- every team ranked 2nd in its group;
- only the best eight teams from the cross-group third-place table.

This means a 3rd-placed team can have provisional points one matchday and lose them later if other third-placed teams overtake it. The UI should make this volatility clear.

For the cross-group third-place table, use the same deterministic sort as the group tables: group points, goal difference, goals scored, then a stable fallback such as team name. Exact FIFA tie-breaks can be added later if the fixture data supports them.

## Option 1: Client-side calculation from fixtures only

Calculate group tables in `app.js` from `state.worldcup.fixtures` whenever `renderAll()` runs.

### How it would work

1. Add a `groupTables()` helper that loops over finished group matches.
2. For each team, calculate:
   - played
   - wins
   - draws
   - losses
   - goals for
   - goals against
   - goal difference
   - group points
3. Sort each group by current standings rules and assign positions 1 to 4.
4. Build a `thirdPlaceStandings()` list from the teams currently ranked 3rd in each group.
5. Sort the third-place list and mark only the best eight as provisional qualifiers.
6. Mark provisional qualifiers:
   - positions 1 and 2 in each group
   - best eight third-place teams across groups
7. Add `provisionalStage(teamName)` or `effectiveStage(teamName)`:
   - use manual override if present
   - use automatic knockout-derived stage when available
   - otherwise use provisional group-stage qualification
8. Use this effective stage inside `teamContribution()` when a `showGroupPoints` mode is enabled.

### UI options

- Add a small toggle: `Official points` / `Group-position points`.
- Or add a new tab called `Group points` so existing leaderboards remain official.
- Add a label next to provisional scores: `Provisional: based on current group positions`.

### Pros

- No change to the data refresh script.
- Works with the existing `worldcup.json` structure.
- Keeps all provisional logic close to existing scoring functions.
- Easy to iterate while in the pub.

### Cons

- The browser must recalculate standings on every load.
- Tie-break logic must be implemented carefully.
- If the fixture source changes naming or grouping, the frontend gets more fragile.

### Recommended use

Best first implementation. It is low risk and keeps the app deployable as a fully static site.

## Option 2: Precompute group tables during data refresh

Extend `scripts/update-data.mjs` so `public/data/worldcup.json` includes a derived `groups` or `standings` section.

Example output shape:

```json
{
  "fixtures": [],
  "groups": [
    {
      "name": "Group A",
      "teams": [
        {
          "name": "Mexico",
          "played": 1,
          "wins": 1,
          "draws": 0,
          "losses": 0,
          "goalsFor": 2,
          "goalsAgainst": 0,
          "goalDifference": 2,
          "groupPoints": 3,
          "position": 1,
          "provisionalStage": "roundOf32"
        }
      ]
    }
  ],
  "thirdPlaceStandings": [
    {
      "name": "Example Team",
      "group": "Group A",
      "played": 2,
      "groupPoints": 3,
      "goalDifference": 0,
      "goalsFor": 2,
      "thirdPlaceRank": 8,
      "provisionalStage": "roundOf32"
    }
  ]
}
```

### How it would work

1. Add shared standings calculation to `scripts/update-data.mjs`.
2. Write the calculated group standings and third-place standings into `worldcup.json` alongside fixtures.
3. In `app.js`, read `state.worldcup.groups` and `state.worldcup.thirdPlaceStandings` instead of deriving tables in the browser.
4. Use `provisionalStage` as the fallback for teams whose knockout stage is not yet known.

### Pros

- Cleaner frontend rendering.
- Derived data can be inspected directly in `worldcup.json`.
- Easier to test the calculation as a Node script.
- Avoids recalculating every time the page loads.

### Cons

- Requires changing the refresh pipeline.
- The committed JSON file becomes larger and contains derived data.
- If users manually edit fixture scores, they must rerun the script to regenerate standings.

### Recommended use

Good if the feature becomes permanent and the data refresh is already part of the workflow.

## Option 3: Manual provisional overrides

Extend `public/data/manual-overrides.json` with a new optional field such as `provisionalStageReached` or `groupPosition`.

Example:

```json
{
  "teamResults": [
    { "name": "Mexico", "provisionalStageReached": "roundOf32", "groupPosition": 1 }
  ]
}
```

### How it would work

1. Keep all current automated logic unchanged.
2. Add a manual provisional field that `getTeamStats()` can read.
3. Render official and provisional points separately.

### Pros

- Very simple technically.
- Useful if external data is unreliable.
- Can patch disputes quickly.

### Cons

- Manual work after every matchday.
- Easy for provisional data to go stale.
- Does not really satisfy “based on current positions” unless someone keeps updating it.

### Recommended use

Useful as a safety valve, not as the primary implementation.

## Recommended approach

Start with Option 1 and keep it visually separate from official scoring.

Suggested implementation plan:

1. Add standings helpers to `app.js`:
   - `groupStandings()`
   - `compareGroupTeams()`
   - `thirdPlaceStandings()`
   - `compareThirdPlacedTeams()`
   - `provisionalGroupStage(teamName)`
2. Add an `effectiveStage(teamName, { provisional = false })` helper.
3. Change `teamContribution()` to accept an options object:

```js
function teamContribution(assignment, options = {}) {
  const team = getTeamStats(assignment.name, options);
  // existing scoring logic
}
```

4. Keep current `Overview` and `Team scores` as official scores unless a toggle is enabled.
5. Add a dedicated `Group points` panel showing:
   - provisional player ranking
   - each player's four teams with provisional points
   - group position for each team
   - third-place qualification status where relevant, for example `3rd, currently 7th of 12 third-place teams`
   - a warning that these scores are not final
6. Add CSS classes for provisional badges, for example `provisional`, `qualified`, `third-place`, `best-third`, and `eliminated`.

## Tie-break details

Use the best available deterministic tie-breaks from loaded fixture data for both the per-group tables and the cross-group third-place table:

1. Group points
2. Goal difference
3. Goals scored
4. Team name alphabetically as a deterministic fallback

This is probably enough for a sweepstake preview. If exact FIFA tie-breaks are needed later, add head-to-head points, head-to-head goal difference, fair-play points, and drawing of lots. Those are harder because the fixture source may not expose disciplinary data.

## Display copy

Suggested wording for the UI:

> Group-position points are provisional and assume the current top two teams in each group, plus the eight best third-placed teams, reach the Round of 32. Third-place qualification is calculated by ranking all 12 third-placed teams against each other, so those points can change after every match. Official sweepstake points still come from confirmed knockout fixtures.

## Edge cases

- Before a team has played, it should show zero provisional points unless alphabetical fallback places it in a qualifying position. To avoid silly early tables, only assign provisional Round of 32 points to teams with at least one played match.
- A third-placed team should only receive provisional points if it is currently ranked in the top eight of the 12 third-placed teams.
- If there are fewer than 12 populated groups early in the tournament, rank the available third-placed teams but label the table as incomplete.
- If a group has incomplete data, keep teams visible but mark their position as `TBC`.
- If an actual knockout fixture has confirmed a team, official stage should take precedence over provisional group position.
- Manual `stageReached` overrides should still take highest priority.
- Existing team-name differences must be respected, especially `Bosnia & Herzegovina`, `Czech Republic`, and `Curaçao`.

## Testing checklist

- A completed win gives 3 group points and correct goal difference.
- A draw gives 1 group point to both teams.
- Scheduled matches do not affect standings.
- Top two teams in each group get provisional Round of 32 points after at least one played match.
- Third-placed teams are collected from every group into a separate cross-group table.
- Exactly eight third-placed teams get provisional Round of 32 points once enough groups have played.
- A third-placed team outside the top eight gets zero provisional sweepstake points.
- Existing official knockout scoring still wins over provisional scoring.
- Manual overrides still win over both automatic and provisional scoring.
- Player ranking tie-breaks still use the existing app rules.
