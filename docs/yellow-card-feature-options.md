# Yellow-card secondary prize implementation options

## Requirement

Add a secondary prize for the player whose teams receive the most disciplinary points per game.

Suggested scoring:

- Yellow card: 1 point
- Straight red card: 3 points
- Red card via two yellow cards: 2 points

Because players have four teams and teams may play different numbers of matches, this should be ranked by disciplinary points per game rather than raw disciplinary points.

## Current data-source constraint

The app currently refreshes `public/data/worldcup.json` from `openfootball/worldcup.json` in `scripts/update-data.mjs`. The normalised fixture model contains match metadata, teams, scores, status, group, ground and winner, but no card or booking events. That means the full feature cannot be implemented reliably from the current data alone.

## Option 1: Manual disciplinary data file

Add a new static file such as `public/data/discipline.json` and enter card totals manually after each match.

Example shape:

```json
{
  "matches": [
    {
      "date": "2026-06-11",
      "home": "Mexico",
      "away": "South Africa",
      "cards": {
        "Mexico": { "yellow": 2, "secondYellowRed": 0, "straightRed": 1 },
        "South Africa": { "yellow": 1, "secondYellowRed": 1, "straightRed": 0 }
      }
    }
  ]
}
```

The app can then calculate each team as:

```text
disciplinaryPoints = yellow + (secondYellowRed * 2) + (straightRed * 3)
disciplinaryPointsPerGame = disciplinaryPoints / matchesPlayed
```

Pros:

- Works with the existing static app architecture.
- No paid API dependency.
- Can be implemented quickly and corrected manually.

Cons:

- Manual maintenance throughout the tournament.
- Needs care to avoid double-counting a second-yellow dismissal as both a yellow and a red.

## Option 2: Add a richer football API for cards

Use a football data provider that exposes per-match cards or event timelines, then update `scripts/update-data.mjs` to merge those events into `worldcup.json` or a separate `discipline.json`.

Potential implementation shape:

1. Keep `openfootball` for fixtures if it remains reliable.
2. Fetch cards from a provider with match events.
3. Map provider team names to the app's team names.
4. Store normalised card totals per fixture/team.
5. Render a disciplinary leaderboard in the app.

Pros:

- Can be automated.
- More likely to stay current during the tournament.

Cons:

- May need an API key, paid plan, rate-limit handling, and provider-specific team/match ID mapping.
- Adds operational risk to an otherwise simple static app.

## Option 3: Hybrid automatic + manual override

Build the app-level scoring and leaderboard now using a `discipline.json` contract, then allow that file to be generated automatically later if a suitable card source is chosen.

Recommended data contract:

```json
{
  "updatedAt": "2026-06-11T22:00:00.000Z",
  "source": "manual",
  "teams": [
    {
      "name": "Mexico",
      "matchesPlayed": 1,
      "yellowCards": 2,
      "secondYellowReds": 0,
      "straightReds": 1
    }
  ]
}
```

The UI would calculate and display:

- disciplinary points
- matches played
- disciplinary points per game
- owner
- player-level total or average across their four teams

Pros:

- Lets the feature be implemented independently from the data-source decision.
- Starts manual but leaves a clean path to automation.
- Keeps overrides simple and transparent.

Cons:

- Still requires a decision on whether the prize is awarded by best single team or by a player's combined four-team average.

## Recommended next step

Implement Option 3 first. Add `public/data/discipline.json`, load it alongside the existing sweepstake/worldcup/overrides files, and render a disciplinary leaderboard. Keep the source marked as `manual` until a reliable cards API is selected.

Before coding the full UI, confirm the prize rule:

- **Team-based:** the player who owns the single team with the highest disciplinary points per game wins the secondary prize.
- **Player-based:** the player whose four teams have the highest combined disciplinary points per game wins the secondary prize.
