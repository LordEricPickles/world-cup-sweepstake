# Repository Guidelines

## Project Structure & Module Organization

This is a static World Cup sweepstake tracker with no backend or package manifest. The main browser files live at the repository root.

Keep new static assets under `public/` and keep data files valid, pretty-printed JSON.

## Build, Test, and Development Commands

Run the app with any static file server from the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Shut down any running server once you're done with testing.

## Coding Style & Naming Conventions

Adhere to YAGNI and KISS principles.

Use modern plain JavaScript, HTML, and CSS. Follow the existing style where reasonable. Keep DOM helper functions small and prefer clear data transformations over hidden side effects.

For CSS, use class names that describe UI roles, for example `.team-label` or `.fixture-row`. Avoid introducing frameworks unless the project is intentionally migrated.

## Testing Guidelines

There is no automated test suite. Before submitting changes, run a local static server and verify the core views in a browser: overview, players, leaderboards, fixtures, rules, and the draw tool. After editing JSON, confirm the page loads without console errors. After changing `scripts/update-data.mjs`, run the refresh command and inspect the resulting diff for expected data-only changes.
