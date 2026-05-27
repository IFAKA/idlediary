export type CoverSourceRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export function getCoverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CoverSourceRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("Source and target dimensions must be positive");
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const sw = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
  const sh = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;

  return {
    sx: (sourceWidth - sw) / 2,
    sy: (sourceHeight - sh) / 2,
    sw,
    sh,
  };
}

export function drawCoverFrame(
  source: CanvasImageSource,
  canvas: HTMLCanvasElement,
  sourceWidth: number,
  sourceHeight: number,
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable");

  const { sx, sy, sw, sh } = getCoverSourceRect(
    sourceWidth,
    sourceHeight,
    canvas.width,
    canvas.height,
  );

  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}
