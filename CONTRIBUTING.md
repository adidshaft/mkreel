# Contributing to mkreel

Thanks for helping make `mkreel` better. This project aims to be a friendly, practical CLI for creators and engineers who need reliable video clips, captions, and AI-assisted publishing helpers.

## Ways to contribute

- Fix bugs in clipping, subtitle timing, output naming, or AI validation.
- Improve documentation, examples, and troubleshooting notes.
- Add tests around edge cases for captions, time parsing, and CLI options.
- Propose focused features through GitHub issues before doing larger implementation work.
- Try `mkreel` on real videos and report clear reproduction steps when something feels off.

## Development setup

Requires Node.js `>=20.10` and npm.

```bash
npm install
npm run verify
npm run dev -- --help
```

`npm run verify` runs the same core checks expected before review:

```bash
npm run typecheck
npm test
npm run build
```

## Running the CLI locally

```bash
npm run dev -- "https://www.youtube.com/watch?v=YOUR_VIDEO_ID"
```

Or build first and run the compiled CLI:

```bash
npm run build
node dist/cli.js --help
```

## Pull request expectations

- Keep changes focused and explain the user-facing behavior in the PR description.
- Add or update tests when changing parsing, validation, subtitles, AI contracts, or pipeline behavior.
- Update the README when flags, commands, outputs, dependencies, or troubleshooting behavior change.
- Do not commit generated `dist/` output, local videos, temp workspaces, credentials, or personal config.
- Keep AI-provider behavior optional and validated. The core clip/export path should not require Codex or Claude.

## Bug reports

Use the bug report template and include:

- the command you ran
- your Node.js version and OS
- whether `ffmpeg`, `ffprobe`, or `yt-dlp` were system-provided or managed by `mkreel`
- the smallest useful error output, ideally with `--debug`
- whether subtitles were manual, automatic, missing, or skipped

Please avoid posting private video URLs, personal tokens, local usernames, or unrelated command output.

## Feature proposals

Please open a feature request before starting large work. A good proposal explains:

- the creator or automation workflow it improves
- the current workaround
- the expected CLI shape or output
- any compatibility or privacy concerns

Small documentation, test, and bug-fix PRs can go straight to review.

## Code style

The project uses TypeScript ES modules, `commander` for CLI wiring, `vitest` for tests, and `zod` for validating AI responses. Prefer small functions, explicit validation, and deterministic outputs over hidden side effects.

## Community

Be kind, specific, and patient. The project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
