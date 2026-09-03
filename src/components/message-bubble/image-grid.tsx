import { cn } from "~/lib/utils";

type ImageAttachment = {
  id: number;
  originalName: string | null;
  mimeType: string;
  metadata: Record<string, unknown> | null;
  url?: string;
};

export function ImageGrid({
  attachments,
}: {
  attachments: Array<ImageAttachment>;
}) {
  const images = attachments.filter((attachment) =>
    attachment.mimeType.startsWith("image/"),
  );

  if (!images.length) return null;

  return (
    <div
      className={cn(
        images.length === 1 && "flex max-w-full flex-wrap gap-2",
        images.length > 1 && "grid grid-cols-2 gap-2",
        images.length > 2 && "grid grid-cols-3 gap-2",
        images.length > 9 && "grid grid-cols-4 gap-2",
      )}
    >
      {images.map((attachment) => {
        return (
          <img
            key={attachment.id}
            src={attachment.url}
            alt={attachment.originalName ?? "Image attachment"}
            loading="lazy"
            className={cn(
              images.length === 1 &&
                "max-h-96 max-w-full rounded-md object-contain",
              images.length > 1 &&
                "w-52 max-w-full h-auto aspect-square object-cover",
            )}
          />
        );
      })}
    </div>
  );
}
