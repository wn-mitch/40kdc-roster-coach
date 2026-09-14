# 40K Roster Coach

A Codex-first skill and small TypeScript helper for evidence-backed roster development. The current slice supports:

- pinned `@alpaca-software/40kdc-data` entity lookup, roster import, pricing/legality coverage, export, and expected-value damage projections;
- a separately pinned local `40kdc-abilities` source-text reader;
- bounded Listhammer page snapshots with source identity;
- normalized local-meta evidence from Listhammer, BCP extracts, browser-assisted research, and firsthand scouting;
- private, resumable state under `.roster-coach/`.

It does not submit rosters, automate credentials, claim undocumented site APIs, or turn partial mechanics coverage into a legality certificate.

## Setup

```sh
npm install
just check
node dist/cli.js workspace init
```

Codex discovers the repository skill at `.agents/skills/40k-roster-coach/SKILL.md` when launched in this repository. Run `node dist/cli.js help` for deterministic helper commands.

Authenticated BCP research is browser-assisted: the user signs in, the agent reads only the pages needed for the active event, and normalized evidence is saved locally. Saved JSON, CSV, text, or links remain the reproducible fallback.

## Local state

The default workspace is `.roster-coach/` and is ignored by Git. Source captures, roster inputs, reports, and private scouting remain local. Public fixtures under `tests/fixtures/` must stay synthetic.
