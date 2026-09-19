const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 0.86;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file could not be read as an image."));
    image.src = src;
  });
}

/**
 * Phone photos are far larger than Gemini needs, so every picked page is
 * re-encoded as a JPEG whose longest side is at most MAX_DIMENSION.
 */
export async function fileToPageImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);

    return encodePageJpeg(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * A frame grabbed from the live webcam, sized and encoded exactly like a picked
 * file so a snapped page and an uploaded page travel the same way.
 */
export function videoFrameToPageImage(video: HTMLVideoElement): string {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    throw new Error("The camera is still starting up — try again in a moment.");
  }

  return encodePageJpeg(video, width, height);
}

function encodePageJpeg(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): string {
  const longestSide = Math.max(sourceWidth, sourceHeight);

  if (!longestSide) {
    throw new Error("That image looks empty.");
  }

  const scale = Math.min(1, MAX_DIMENSION / longestSide);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not process that image.");
  }

  // White first: a transparent PNG would otherwise turn black in JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
