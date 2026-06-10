# World Cup Sweepstake

A static sweepstake tracker for a 12-player, pot-based World Cup draw.

## Format

- There are 12 entrants and 48 teams.
- Teams are split into four draw pots of 12 teams.
- Each entrant gets four teams: one from Pot 1, one from Pot 2, one from Pot 3, and one from Pot 4.
- No teams are excluded.
- The app uses the JSON files in `public/data` and can run without a backend or database.
- Team names in the data follow the fixture source where needed, for example `USA`, `South Korea`, `Iran`, `Ivory Coast`, `Cape Verde`, and `Curaçao`.

## Scoring

Teams earn cumulative points for each tournament milestone they reach. The Round of 32 award is based on the team's pot, then each later milestone is worth one additional point.

| Milestone reached | Pot 1 | Pot 2 | Pot 3 | Pot 4 |
| --- | ---: | ---: | ---: | ---: |
| Round of 32 | 1 | 2 | 3 | 4 |
| Round of 16 | 2 | 3 | 4 | 5 |
| Quarter Final | 3 | 4 | 5 | 6 |
| Semi Final | 4 | 5 | 6 | 7 |
| Final | 5 | 6 | 7 | 8 |
| Winner | 6 | 7 | 8 | 9 |
| Winner cumulative total | 21 | 27 | 33 | 39 |

Examples:

- A Pot 1 team that reaches the Round of 32 earns 1 point.
- A Pot 4 team that reaches the Round of 32 earns 4 points.
- A Pot 1 team that reaches the Quarter Final earns 6 points: 1 + 2 + 3.
- A Pot 4 team that wins the tournament earns 39 points: 4 + 5 + 6 + 7 + 8 + 9.

## Player Ranking

Players are ranked by total points from their four teams.

If players are level on points:

1. Compare each player's best team by stage reached.
2. If still tied, compare their second-best team.
3. If still tied, compare their third-best team.
4. If still tied, compare their fourth-best team.
5. If still tied, the player with the lowest combined final placing across all four teams ranks higher.
6. If still tied, players share the position.

## Final Placings

Final placings are used only as the last tie-breaker.

- The winner is placed 1st.
- The runner-up is placed 2nd.
- The third-place playoff winner is placed 3rd.
- The third-place playoff loser is placed 4th.
- Knockout exits are ranked by bracket path, working backwards from those four teams.
- Group-stage exits are placed below knockout teams using the official group-stage performance tiebreaks.

If the live data source cannot calculate a final placing automatically, enter corrections in `public/data/manual-overrides.json`.

## Running Locally

Serve the directory with any static file server, then open the local URL in a browser. For example:

```bash
python3 -m http.server 8000
```
or
```bash
npx serve . -l 8000
```

To refresh tournament fixture data:

```bash
node scripts/update-data.mjs
```
