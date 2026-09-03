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
