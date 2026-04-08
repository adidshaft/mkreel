<p align="center">
  Send feedbacks on X: <a href="https://x.com/adidshaft">@adidshaft</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/adidshaft/mkreel/main/assets/mkreel-terminal.png" alt="mkreel terminal card" width="860" />
</p>

<h1 align="center">mkreel</h1>

<p align="center">
  Creator-grade CLI for clipping YouTube moments into polished vertical reels with optional burned captions.
</p>

<p align="center">
  <a href="https://github.com/adidshaft/mkreel/actions/workflows/ci.yml">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/adidshaft/mkreel/ci.yml?branch=main&style=for-the-badge&label=CI">
  </a>
  <a href="https://www.npmjs.com/package/mkreel">
    <img alt="npm ready" src="https://img.shields.io/badge/npm-ready-CB3837?style=for-the-badge&logo=npm&logoColor=white">
  </a>
  <img alt="Node 20.10 or newer" src="https://img.shields.io/badge/node-%3E%3D20.10-111827?style=for-the-badge&logo=node.js&logoColor=83CD29">
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-111827?style=for-the-badge&color=0F172A">
</p>

<p align="center">
  <code>clip it</code>
  <code>crop it</code>
  <code>caption it</code>
  <code>ship it</code>
</p>

`mkreel` takes a YouTube URL, lets you choose a segment, optionally turns it into a `1080x1920` reel, retimes English subtitles in native TypeScript, burns them into the video, and exports a ready-to-post MP4.

## Why It Feels Good

- Guided interactive flow with smart defaults
- Fully scriptable flags when you want automation
- First-run dependency bootstrapping for `ffmpeg`, `ffprobe`, and `yt-dlp`
- Ready-made caption presets for Shorts, Reels, and TikTok-style exports
- Clean subtitle retiming, clamping, overlap cleanup, and renumbering
- Blur-fill vertical reel layout with centered foreground video
- Predictable output naming and debug-friendly temp workspace handling

## Quick Start

### 1. Install

Requires Node.js `>=20.10`.

```bash
npm install -g mkreel
```

Or run it without a global install:

```bash
npx mkreel --help
```

### 2. Run It

```bash
mkreel https://www.youtube.com/watch?v=YOUR_VIDEO_ID
```

If you prefer `npx`:

```bash
npx mkreel https://www.youtube.com/watch?v=YOUR_VIDEO_ID
```

### 3. Answer A Few Prompts

The interactive flow is intentionally compact:

1. Validate the URL
2. Ask for clip start
3. Ask for clip end
4. Ask for output mode
5. Ask whether to burn subtitles
6. Ask for a caption preset if subtitles are enabled
7. Show a concise execution summary
8. Run the pipeline
9. Print the final file path

## Fast Mental Model

| You want | Use |
| --- | --- |
| A vertical export for social apps | `--mode reel` |
| The original aspect ratio | `--mode original` |
| Burned captions | `--subs burn` |
| No captions | `--subs skip` |
| Human-friendly times | `8:43`, `08:43`, or `00:08:43` |
| A dry preview first | `--dry-run` |
| Temp files kept for inspection | `--keep-temp` |
| Deep failure details | `--debug` |

## A Good First Command

```bash
mkreel "https://youtu.be/dQw4w9WgXcQ" \
  --start 8:43 \
  --end 11:38 \
  --mode reel \
  --subs burn \
  --subtitle-position bottom \
  --subtitle-size large \
  --subtitle-style creator \
  --output final.mp4
```

If you just want to preview the resolved plan without downloading or exporting:

```bash
mkreel "https://youtu.be/dQw4w9WgXcQ" \
  --start 8:43 \
  --end 11:38 \
  --mode reel \
  --subs burn \
  --dry-run
```

## Caption Presets

Interactive caption presets are designed so you usually do not need manual tuning.

| Preset | Best for | Feel |
| --- | --- | --- |
| Bottom creator | General reels and talking-head clips | Strong default, creator-style |
| Bottom compact | Longer spoken clips | Smaller, denser captions |
| Lower third clean | Busy lower UI areas | Safer above overlays |
| Center punch | Dramatic or emphatic clips | Large, loud, punchy |
| Top safe clean | Lower frame covered by UI | Moves captions away from the bottom |
| Custom / advanced | Fine-grained control | Manual ASS tuning |

Long captions are wrapped automatically, and `mkreel` can reduce caption size slightly when needed to keep text inside the frame.

## Core Flags

| Flag | Meaning |
| --- | --- |
| `--start <time>` | Clip start time |
| `--end <time>` | Clip end time |
| `--mode <mode>` | `reel` or `original` |
| `--subs <mode>` | `burn` or `skip` |
| `--subtitle-position <position>` | `bottom`, `lower-third`, `center`, `top`, or `custom` |
| `--subtitle-size <size>` | `compact`, `balanced`, `large`, `xl`, or `custom` |
| `--subtitle-style <style>` | `creator`, `clean`, `soft`, or `custom` |
| `--output <file>` | Output file path |
| `--open` | Open the exported file after completion |
| `--keep-temp` | Keep the job workspace after success |
| `--dry-run` | Print the resolved plan without running the pipeline |
| `--debug` | Print deeper failure detail and preserve temp files on errors |
| `--non-interactive` | Disable prompts and require all key flags |

<details>
<summary><strong>Advanced caption tuning flags</strong></summary>

<br />

| Flag | Meaning |
| --- | --- |
| `--subtitle-alignment <n>` | Custom ASS alignment `1-9` |
| `--subtitle-margin-v <px>` | Custom vertical margin |
| `--subtitle-margin-l <px>` | Custom left margin |
| `--subtitle-margin-r <px>` | Custom right margin |
| `--subtitle-font-size <n>` | Custom subtitle font size |
| `--subtitle-outline <n>` | Custom outline thickness |
| `--subtitle-shadow <n>` | Custom shadow strength |
| `--subtitle-bold` | Force bold captions |

</details>

## What Happens On First Run

`mkreel` checks for working system binaries first. If they are missing, it provisions managed versions of:

- `ffmpeg`
- `ffprobe`
- `yt-dlp`

Managed tools are cached for reuse. On macOS, that typically lands under:

```text
~/Library/Caches/mkreel/bin/
```

This setup is quiet by default and only shows raw details when `--debug` is enabled.

## Reel Mode

When `--mode reel` is selected, `mkreel` exports a `1080x1920` MP4 with:

- blurred background fill
- centered foreground video
- preserved audio

The default vertical layout is based on:

```text
[0:v]split=2[bgsrc][fgsrc];
[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:10[bg];
[fgsrc]scale=1080:-2:force_original_aspect_ratio=decrease[fg];
[bg][fg]overlay=(W-w)/2:(H-h)/2
```

## Subtitle Behavior

If subtitles are enabled, `mkreel`:

1. Detects English manual captions first
2. Falls back to automatic English captions when available
3. Downloads subtitles as SRT
4. Shifts timestamps backward so the selected clip starts at `00:00:00`
5. Clamps negative times safely
6. Removes cue overlap so captions stay readable
7. Drops invalid cues
8. Renumbers cues from `1`
9. Burns subtitles into the final export with a styled ASS track

Default styling includes white text, black outline, bold creator captions by default, and preset-specific outline tuning.

## Output Naming

Generated filenames are deterministic and based on:

- video title
- clip start
- clip end
- output mode
- subtitle status

Example:

```text
video-title-08m43s-11m38s-reel-subbed.mp4
```

If the path already exists, `mkreel` automatically adds a numeric suffix.

## Troubleshooting

### Tool setup failed

Run with:

```bash
mkreel <url> --debug
```

### No subtitles available

Interactive runs offer to continue without subtitles.

For non-interactive runs:

```bash
--subs skip
```

### End time is before start time

`mkreel` validates the range before running the pipeline and exits with a clear message.

### A run failed mid-pipeline

On failures, `mkreel` preserves the temp workspace path so you can inspect:

- downloaded media
- subtitle files
- intermediate outputs

## Development

```bash
npm install
npm run typecheck
npm run build
npm test
npm run dev -- --help
```

## Local Development Usage

```bash
npm run dev -- "https://www.youtube.com/watch?v=YOUR_VIDEO_ID"
```

Or build and run the compiled CLI:

```bash
npm run build
node dist/cli.js --help
```
