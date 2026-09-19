export function captureFrame(
  video: HTMLVideoElement,
  width = 1280,
  height = 720
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context.");
  }

  // The live video is mirrored for the user, but the image sent to Gemini
  // is intentionally NOT mirrored so text remains readable.
  ctx.drawImage(video, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.82);
}