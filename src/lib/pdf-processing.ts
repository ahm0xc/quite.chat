const PDFJS_CDN_BASE = "https://cdn.jsdelivr.net/npm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import("pdfjs-dist");
  const version = lib.version;
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN_BASE}/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  pdfjsLib = lib;
  return lib;
}

export async function preparePdf(file: File) {
  const pdfjs = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const maxWidth = 640;
  const unscaledViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1, maxWidth / unscaledViewport.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvas, viewport }).promise;

  const posterBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("PDF poster generation failed")),
      "image/webp",
      0.82,
    );
  });

  return {
    posterBlob,
    width: viewport.width,
    height: viewport.height,
    originalName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    posterFileName: `${file.name.replace(/\.[^.]+$/, "")}-poster.webp`,
  };
}
