# Security Policy

## Supported versions

Security fixes target the latest published version of `mkreel` and the current `main` branch.

## Reporting a vulnerability

Please do not open a public issue for security vulnerabilities.

Report privately through GitHub's private vulnerability reporting if it is enabled for this repository. If that is unavailable, contact the maintainer using the support path in [SUPPORT.md](SUPPORT.md) and include `mkreel security` in the subject or first line.

Helpful details include:

- affected version or commit
- operating system and Node.js version
- exact command or workflow involved
- impact and reproduction steps
- whether the issue involves local files, shell execution, downloads, generated subtitles, AI provider output, or package publishing

Please do not include real access tokens, cookies, private video URLs, or unrelated personal data.

## Security model

`mkreel` is a local CLI. It downloads media through `yt-dlp`, processes files through `ffmpeg` and `ffprobe`, and can optionally call local AI CLIs for suggestions. AI responses are parsed as JSON, validated, normalized, and constrained to supported values before use.

Security-sensitive changes should preserve these boundaries:

- validate all external input before using it in pipeline decisions
- avoid arbitrary shell interpolation
- keep AI suggestions advisory and constrained
- avoid leaking local paths or private context in normal output
- keep package publication tied to CI verification
