import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useTRPC } from "~/integrations/trpc/react";
import { localDb } from "~/lib/local-db";
import { cn } from "~/lib/utils";

type ImageAttachment = {
  id: number;
  messageId?: number;
  originalName: string | null;
  mimeType: string;
  metadata: Record<string, unknown> | null;
  url?: string;
  willExpireAt?: Date | string;
};

function isExpired(willExpireAt?: Date | string) {
  if (!willExpireAt) return false;
  return Date.now() > new Date(willExpireAt).getTime();
}

function ExpiringImage({
  attachment,
  className,
  single,
}: {
  attachment: ImageAttachment;
  className?: string;
  single?: boolean;
}) {
  const trpc = useTRPC();
  const isBlob = attachment.url?.startsWith("blob:");
  const isTemp = attachment.id < 0;
  // server now sends willExpireAt; missing only for old cache -> refresh once
  const expired =
    !isBlob &&
    !isTemp &&
    (!attachment.willExpireAt || isExpired(attachment.willExpireAt));

  const refresh = useQuery({
    ...trpc.conversations.refreshAttachmentUrl.queryOptions({
      attachmentId: attachment.id,
    }),
    enabled: expired,
    staleTime: Infinity,
  });

  const [displayUrl, setDisplayUrl] = useState(attachment.url);
  const [loaded, setLoaded] = useState(false);

  // keep displayUrl in sync with attachment.url (initial/server) — not with refresh
  useEffect(() => {
    if (!refresh.data?.url) setDisplayUrl(attachment.url);
  }, [attachment.url, refresh.data?.url]);

  // preload refreshed url, then swap without showing placeholder again
  useEffect(() => {
    const newUrl = refresh.data?.url;
    if (!newUrl || newUrl === displayUrl) return;
    const img = new window.Image();
    img.src = newUrl;
    const swap = () => setDisplayUrl(newUrl);
    if (img.complete) swap();
    else {
      img.onload = swap;
      img.onerror = swap;
    }
  }, [refresh.data?.url, displayUrl]);

  useEffect(() => {
    if (!refresh.data?.url || !attachment.messageId) return;
    const newUrl = refresh.data.url;
    const newWillExpireAt =
      (refresh.data as { willExpireAt?: Date }).willExpireAt ??
      new Date(Date.now() + 15 * 60 * 1000);
    void (async () => {
      const msg = await localDb.messages.get(attachment.messageId as number);
      if (!msg?.attachments) return;
      await localDb.messages.update(attachment.messageId as number, {
        attachments: msg.attachments.map((a) =>
          a.id === attachment.id
            ? { ...a, url: newUrl, willExpireAt: newWillExpireAt }
            : a,
        ),
      });
    })();
  }, [refresh.data?.url, attachment.id, attachment.messageId]);

  if (!displayUrl) return null;

  const meta = attachment.metadata as {
    width?: number;
    height?: number;
  } | null;
  const w = meta?.width;
  const h = meta?.height;
  const hasRatio = Boolean(single && w && h);
  const ratioStyle = hasRatio ? { aspectRatio: `${w} / ${h}` } : undefined;

  return (
    <div
      style={ratioStyle}
      className={cn(
        "bg-muted relative overflow-hidden rounded-md",
        single && hasRatio && "max-h-96 max-w-full",
        single && !hasRatio && "aspect-[4/3] w-72 max-w-full",
        !single && "aspect-square w-52 max-w-full",
        !loaded && "animate-pulse",
        className,
      )}
    >
      <img
        src={displayUrl}
        alt={attachment.originalName ?? "Image attachment"}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full transition-opacity duration-200",
          single ? "object-contain" : "object-cover",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

export function ImageGrid({
  attachments,
}: {
  attachments: Array<ImageAttachment>;
  conversationId?: number;
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
      {images.map((attachment) => (
        <ExpiringImage
          key={attachment.id}
          attachment={attachment}
          single={images.length === 1}
        />
      ))}
    </div>
  );
}
