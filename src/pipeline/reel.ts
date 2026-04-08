export function buildReelFilter(inputLabel = "0:v", outputLabel = "reel"): string {
  return [
    `[${inputLabel}]split=2[bgsrc][fgsrc]`,
    "[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:10[bg]",
    "[fgsrc]scale=1080:-2:force_original_aspect_ratio=decrease[fg]",
    `[bg][fg]overlay=(W-w)/2:(H-h)/2[${outputLabel}]`,
  ].join(";");
}
