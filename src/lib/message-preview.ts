export function getMessagePreview(
  body: string,
  attachments: Array<{ mimeType: string }> = [],
) {
  if (body) return body;
  if (
    attachments.some((attachment) => attachment.mimeType.startsWith("image/"))
  ) {
    return "Sent an image";
  }
  if (
    attachments.some((attachment) => attachment.mimeType.startsWith("video/"))
  ) {
    return "Sent a video";
  }
  if (
    attachments.some((attachment) => attachment.mimeType === "application/pdf")
  ) {
    return "Sent a PDF";
  }
  if (attachments.length) return "Sent an attachment";
  return "";
}
