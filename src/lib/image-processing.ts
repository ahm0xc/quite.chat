export async function prepareVideo(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error("Video metadata could not be loaded"));
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;
    if (!width || !height) throw new Error("Video has no dimensions");
    const target = Number.isFinite(duration) ? Math.min(1, duration / 2) : 0;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const timer = window.setTimeout(done, 3000);
      video.onseeked = () => {
        window.clearTimeout(timer);
        done();
      };
      try {
        video.currentTime = target;
      } catch {
        window.clearTimeout(timer);
        done();
      }
    });
    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / width);
    const thumbWidth = Math.max(2, Math.round(width * scale));
    const thumbHeight = Math.max(2, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(video, 0, 0, thumbWidth, thumbHeight);
    const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Thumbnail generation failed")),
        "image/webp",
        0.82,
      );
    });
    return {
      thumbnailBlob,
      width,
      height,
      duration,
      fileName: file.name,
      posterFileName: `${file.name.replace(/\.[^.]+$/, "")}-poster.webp`,
      mimeType: file.type,
      sizeBytes: file.size,
      originalName: file.name,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
export async function prepareImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 2000;
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Canvas is unavailable");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Image compression failed")),
      "image/webp",
      0.82,
    );
  });
  return {
    blob,
    width,
    height,
    fileName: `${file.name.replace(/\.[^.]+$/, "")}.webp`,
    mimeType: "image/webp",
    originalName: file.name,
    originalMimeType: file.type,
    originalSizeBytes: file.size,
  };
}
