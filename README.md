# mkreel

`mkreel` is a production-style Node.js CLI for turning a YouTube segment into a creator-ready MP4.

Run:

```bash
mkreel <url>
```

`mkreel` guides you through a compact interactive flow, downloads the selected clip, optionally converts it to a 9:16 reel, retimes English subtitles natively in TypeScript, burns them in, and exports a final MP4.

## Highlights

- Guided interactive UX with smart defaults
- Fully scriptable flags for automation and shell usage
- First-run dependency bootstrapping for `ffmpeg`, `ffprobe`, and `yt-dlp`
- Managed tool cache in an app-owned directory
- Native SRT parsing, retiming, clamping, renumbering, and serialization
- Overlap cleanup so caption cues do not stack on top of each other
- Canvas-aware ASS subtitle rendering for reliable placement and scaling
- Default auto-wrap and auto-fit so long captions stay inside the frame
- Reel rendering with blurred background fill and centered foreground video
- Clean temp workspace lifecycle with `--keep-temp` and debug-friendly failures

## Install

Requires Node.js `>=20.10`.

### From npm

```bash
npm install -g mkreel
```

Or run it without installing globally:

```bash
npx mkreel --help
```

### Local development

```bash
npm install
npm run build
node dist/cli.js --help
```

## First-run setup

`mkreel` checks for working system binaries first.

If they are missing, it automatically provisions managed tools and caches them for reuse:

- `ffmpeg`
- `ffprobe`
- `yt-dlp`

Managed tools are cached under the app cache directory, for example on macOS:

```text
~/Library/Caches/mkreel/bin/
```

This setup is silent by default and surfaces raw details only when `--debug` is enabled.

## Interactive usage

The primary UX is:

```bash
mkreel https://www.youtube.com/watch?v=...
```

If you installed from npm, you can also run:

```bash
npx mkreel https://www.youtube.com/watch?v=...
```

Interactive flow:

1. Validate the URL
2. Ask for clip start
3. Ask for clip end
4. Ask for output mode
5. Ask whether to burn subtitles
6. Ask for a caption preset if subtitles are enabled
7. Show a concise execution summary
8. Run the pipeline
9. Print the final file path

## Non-interactive usage

Example:

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

Key flags:

- `--start <time>` clip start, accepts `8:43`, `08:43`, or `00:08:43`
- `--end <time>` clip end
- `--mode <mode>` `reel` or `original`
- `--subs <mode>` `burn` or `skip`
- `--subtitle-position <position>` `bottom`, `lower-third`, `center`, `top`, or `custom`
- `--subtitle-size <size>` `compact`, `balanced`, `large`, `xl`, or `custom`
- `--subtitle-style <style>` `creator`, `clean`, `soft`, or `custom`
- `--output <file>` final output file path
- `--open` open the exported file after completion
- `--keep-temp` preserve the workspace after success
- `--dry-run` print the resolved plan without downloading or exporting
- `--debug` print deeper failure detail and preserve temp files on errors
- `--non-interactive` require all key flags and disable prompts

Advanced caption tuning flags:

- `--subtitle-alignment <n>` custom ASS alignment `1-9`
- `--subtitle-margin-v <px>` custom vertical margin
- `--subtitle-margin-l <px>` custom left margin
- `--subtitle-margin-r <px>` custom right margin
- `--subtitle-font-size <n>` custom subtitle font size
- `--subtitle-outline <n>` custom outline thickness
- `--subtitle-shadow <n>` custom shadow strength
- `--subtitle-bold` force bold captions

## Reel mode

When `--mode reel` is selected, `mkreel` exports a `1080x1920` MP4 using:

- blurred background fill
- centered foreground video
- preserved audio

The default reel layout is based on:

```text
[0:v]split=2[bgsrc][fgsrc];
[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:10[bg];
[fgsrc]scale=1080:-2:force_original_aspect_ratio=decrease[fg];
[bg][fg]overlay=(W-w)/2:(H-h)/2
```

## Subtitle behavior

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

Default subtitle placements:

- Bottom safe: creator-friendly lower safe zone for reels
- Lower third: a little higher for busy lower UI
- Center emphasis: center anchored for punchy clips
- Top safe: top anchored when the lower frame is busy

Interactive preset flow:

- Bottom creator: the simplest all-round default
- Bottom compact: smaller, denser captions for longer spoken clips
- Lower third clean: useful when the very bottom is busy
- Center punch: large, loud captions for dramatic clips
- Top safe clean: useful when lower overlays cover the frame
- Custom / advanced: only when you actually want manual tuning

Long captions are wrapped automatically by default, and `mkreel` will reduce caption size a bit when needed to keep text inside the frame.

Default styling:

- Primary color white
- Outline color black
- Bold creator captions by default
- Border style `1`
- Outline `4-5` depending on preset
- Shadow `1`

## Output naming

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

If that path already exists, `mkreel` automatically adds a numeric suffix.

## Debugging and troubleshooting

### `yt-dlp` or `ffmpeg` setup failed

Run with:

```bash
mkreel <url> --debug
```

This exposes more detail while preserving temp files for inspection.

### No subtitles available

Interactive runs offer to continue without subtitles.

For non-interactive runs, use:

```bash
--subs skip
```

### End time is before start time

`mkreel` validates the range before running the pipeline and exits with a clear message.

### A run failed mid-pipeline

In failure cases `mkreel` preserves the temp workspace path so you can inspect:

- downloaded media
- subtitle files
- intermediate outputs

## Development

Useful commands:

```bash
npm install
npm run typecheck
npm run build
npm test
npm run dev -- --help
```

## Tests

The current test suite covers:

- time parsing
- range validation
- SRT parsing
- subtitle retiming and renumbering
- SRT serialization
- output name generation
- CLI option normalization
