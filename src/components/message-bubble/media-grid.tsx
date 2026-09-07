import {
  ArrowsOutIcon,
  DownloadSimpleIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { Button } from "~/components/ui/button";
import { useTRPC } from "~/integrations/trpc/react";
import { localDb } from "~/lib/local-db";
import { cn } from "~/lib/utils";

import { CircularProgress } from "./circular-progress";

type ImageAttachment = {
  id: number;
  messageId?: number;
  originalName: string | null;
  mimeType: string;
  metadata: Record<string, unknown> | null;
  url?: string;
  posterUrl?: string;
  willExpireAt?: Date | string;
};

function isExpired(willExpireAt?: Date | string) {
  if (!willExpireAt) return false;
  return Date.now() > new Date(willExpireAt).getTime();
}

export function isPlayableVideo(mimeType: string) {
  return mimeType === "video/mp4" || mimeType === "video/webm";
}

export function isPdf(mimeType: string) {
  return mimeType === "application/pdf";
}

export function MediaGridImage({
  attachment,
  className,
  single,
  uploadProgress,
}: {
  attachment: ImageAttachment;
  className?: string;
  single?: boolean;
  uploadProgress?: number;
}) {
  const [displayUrl, setDisplayUrl] = React.useState(attachment.url);
  const [loaded, setLoaded] = React.useState(false);
  const [prevServerUrl, setPrevServerUrl] = React.useState(attachment.url);

  const trpc = useTRPC();
  const isBlob = attachment.url?.startsWith("blob:");
  const isTemp = attachment.id < 0;
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

  const refreshedUrl = refresh.data?.url;
  const refreshedWillExpireAt = (
    refresh.data as { willExpireAt?: Date } | undefined
  )?.willExpireAt;

  // keep displayUrl in sync with attachment.url (initial/server) — not with refresh
  if (prevServerUrl !== attachment.url) {
    setPrevServerUrl(attachment.url);
    if (!refreshedUrl) setDisplayUrl(attachment.url);
  }

  // preload refreshed url, then swap without showing placeholder again
  React.useEffect(() => {
    if (!refreshedUrl || refreshedUrl === displayUrl) return;
    const img = new window.Image();
    img.src = refreshedUrl;
    const swap = () => setDisplayUrl(refreshedUrl);
    if (img.complete) swap();
    else {
      img.onload = swap;
      img.onerror = swap;
    }
  }, [refreshedUrl, displayUrl]);

  React.useEffect(() => {
    if (!refreshedUrl || !attachment.messageId) return;
    const newUrl = refreshedUrl;
    const newWillExpireAt =
      refreshedWillExpireAt ?? new Date(Date.now() + 15 * 60 * 1000);
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
  }, [
    refreshedUrl,
    refreshedWillExpireAt,
    attachment.id,
    attachment.messageId,
  ]);

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
        single && !hasRatio && "aspect-4/3 w-72 max-w-full",
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
      {uploadProgress !== undefined && uploadProgress < 100 && (
        <CircularProgress progress={uploadProgress} />
      )}
    </div>
  );
}

function formatVideoTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function VideoPlayer({
  src,
  poster,
  label,
  aspectRatio,
}: {
  src: string;
  poster?: string;
  label: string;
  aspectRatio?: string;
}) {
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [isMuted, setIsMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    if (!videoRef.current) return;
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const changeVolume = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    const video = videoRef.current;
    if (!video) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void video.parentElement?.requestFullscreen();
  };

  const startVideo = () => setIsLoaded(true);

  return (
    <div
      style={{ aspectRatio: aspectRatio ?? "4 / 3" }}
      className="group relative w-80 max-w-full overflow-hidden rounded-xl bg-black shadow-sm"
    >
      {isLoaded ? (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay
          playsInline
          preload="auto"
          aria-label={label}
          onClick={togglePlay}
          onLoadedMetadata={(event) =>
            setDuration(event.currentTarget.duration)
          }
          onTimeUpdate={(event) =>
            setCurrentTime(event.currentTarget.currentTime)
          }
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="h-full w-full object-contain"
        />
      ) : (
        <button
          type="button"
          onClick={startVideo}
          className="group/preview relative h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
          aria-label={`Play ${label}`}
        >
          {poster ? (
            <img src={poster} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="absolute inset-0 bg-linear-to-br from-zinc-700 to-zinc-950" />
          )}
          <span className="absolute inset-0 bg-black/10 transition-colors group-hover/preview:bg-black/25" />
          <span className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform group-hover/preview:scale-105">
            <PlayIcon className="ml-1 size-6" weight="fill" />
          </span>
        </button>
      )}
      {isLoaded && (
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/50 to-transparent px-3 pt-10 pb-2 text-white opacity-100 transition-opacity duration-200 sm:pointer-events-none sm:opacity-0 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100">
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={seek}
            aria-label="Seek video"
            className="pointer-events-auto mb-1 h-1 w-full accent-white"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-full p-1.5 hover:bg-white/15"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <PauseIcon weight="fill" />
              ) : (
                <PlayIcon weight="fill" />
              )}
            </button>
            <span className="min-w-18 text-xs tabular-nums">
              {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
            </span>
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-full p-1.5 hover:bg-white/15"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <SpeakerSlashIcon /> : <SpeakerHighIcon />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={changeVolume}
              aria-label="Volume"
              className="pointer-events-auto hidden w-16 accent-white sm:block"
            />
            <button
              type="button"
              onClick={toggleFullscreen}
              className="ml-auto rounded-full p-1.5 hover:bg-white/15"
              aria-label="Fullscreen"
            >
              <ArrowsOutIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MediaGridVideoItem({
  attachment,
  uploadProgress,
}: {
  attachment: ImageAttachment;
  uploadProgress?: number;
}) {
  const trpc = useTRPC();
  const isBlob = attachment.url?.startsWith("blob:");
  const isTemp = attachment.id < 0;
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

  const refreshedUrl = refresh.data?.url;
  const refreshedPosterUrl = refresh.data?.posterUrl;
  const refreshedWillExpireAt = (
    refresh.data as { willExpireAt?: Date } | undefined
  )?.willExpireAt;
  const displayUrl = refreshedUrl ?? attachment.url;
  const displayPosterUrl = refreshedPosterUrl ?? attachment.posterUrl;

  React.useEffect(() => {
    if (!refreshedUrl || !attachment.messageId) return;
    const newUrl = refreshedUrl;
    const newPosterUrl = refreshedPosterUrl;
    const newWillExpireAt =
      refreshedWillExpireAt ?? new Date(Date.now() + 15 * 60 * 1000);
    void (async () => {
      const msg = await localDb.messages.get(attachment.messageId as number);
      if (!msg?.attachments) return;
      await localDb.messages.update(attachment.messageId as number, {
        attachments: msg.attachments.map((a) =>
          a.id === attachment.id
            ? {
                ...a,
                url: newUrl,
                posterUrl: newPosterUrl,
                willExpireAt: newWillExpireAt,
              }
            : a,
        ),
      });
    })();
  }, [
    refreshedUrl,
    refreshedPosterUrl,
    refreshedWillExpireAt,
    attachment.id,
    attachment.messageId,
  ]);

  if (!displayUrl) return null;

  const meta = attachment.metadata as {
    width?: number;
    height?: number;
  } | null;
  const aspectRatio =
    meta?.width && meta.height ? `${meta.width} / ${meta.height}` : undefined;

  return (
    <div className="relative">
      <VideoPlayer
        src={displayUrl}
        poster={displayPosterUrl}
        label={attachment.originalName ?? "Video attachment"}
        aspectRatio={aspectRatio}
      />
      {uploadProgress !== undefined && uploadProgress < 100 && (
        <CircularProgress progress={uploadProgress} />
      )}
    </div>
  );
}

export function MediaGridPdfItem({
  attachment,
  uploadProgress,
}: {
  attachment: ImageAttachment;
  uploadProgress?: number;
}) {
  const trpc = useTRPC();
  const isBlob = attachment.url?.startsWith("blob:");
  const isTemp = attachment.id < 0;
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

  const refreshedUrl = refresh.data?.url;
  const refreshedPosterUrl = refresh.data?.posterUrl;
  const refreshedWillExpireAt = (
    refresh.data as { willExpireAt?: Date } | undefined
  )?.willExpireAt;
  const displayUrl = refreshedUrl ?? attachment.url;
  const displayPosterUrl = refreshedPosterUrl ?? attachment.posterUrl;

  React.useEffect(() => {
    if (!refreshedUrl || !attachment.messageId) return;
    const newUrl = refreshedUrl;
    const newPosterUrl = refreshedPosterUrl;
    const newWillExpireAt =
      refreshedWillExpireAt ?? new Date(Date.now() + 15 * 60 * 1000);
    void (async () => {
      const msg = await localDb.messages.get(attachment.messageId as number);
      if (!msg?.attachments) return;
      await localDb.messages.update(attachment.messageId as number, {
        attachments: msg.attachments.map((a) =>
          a.id === attachment.id
            ? {
                ...a,
                url: newUrl,
                posterUrl: newPosterUrl,
                willExpireAt: newWillExpireAt,
              }
            : a,
        ),
      });
    })();
  }, [
    refreshedUrl,
    refreshedPosterUrl,
    refreshedWillExpireAt,
    attachment.id,
    attachment.messageId,
  ]);

  const [downloadProgress, setDownloadProgress] = React.useState<number | null>(
    null,
  );

  const handleDownload = async () => {
    if (!displayUrl) return;
    setDownloadProgress(0);
    try {
      const response = await fetch(displayUrl);
      if (!response.ok) throw new Error("Download failed");
      const contentLength = response.headers.get("content-length");
      const total = contentLength ? Number.parseInt(contentLength, 10) : 0;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");
      const chunks: Array<BlobPart> = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          setDownloadProgress(Math.round((received / total) * 100));
        }
      }
      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.originalName ?? "document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silent
    } finally {
      setDownloadProgress(null);
    }
  };

  if (!displayUrl) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border">
      <div className="h-24">
        {displayPosterUrl ? (
          <img
            src={displayPosterUrl}
            alt={attachment.originalName ?? "PDF attachment"}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="bg-secondary flex h-full w-full items-center justify-center">
            <span className="text-muted-foreground text-xs">PDF</span>
          </div>
        )}
      </div>
      <div className="bg-secondary flex items-center gap-2 border-t px-3 py-1.5">
        <span className="text-secondary-foreground line-clamp-1 text-xs">
          {attachment.originalName ?? "document.pdf"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6 shrink-0"
          aria-label="Download PDF"
          disabled={downloadProgress !== null}
          onClick={handleDownload}
        >
          {downloadProgress !== null ? (
            <svg
              className="size-4 -rotate-90"
              viewBox="0 0 40 40"
              fill="none"
              aria-label={`Downloading ${downloadProgress}%`}
              role="progressbar"
              aria-valuenow={downloadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <circle
                cx="20"
                cy="20"
                r="18"
                stroke="currentColor"
                strokeWidth="3"
                opacity={0.25}
              />
              <circle
                cx="20"
                cy="20"
                r="18"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={
                  2 * Math.PI * 18 - (downloadProgress / 100) * 2 * Math.PI * 18
                }
                className="transition-[stroke-dashoffset] duration-150"
              />
            </svg>
          ) : (
            <DownloadSimpleIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
      {uploadProgress !== undefined && uploadProgress < 100 && (
        <CircularProgress progress={uploadProgress} />
      )}
    </div>
  );
}

export function MediaGrid({
  attachments,
  uploadProgress,
}: {
  attachments: Array<ImageAttachment>;
  conversationId?: number;
  uploadProgress?: number;
}) {
  const images = attachments.filter((attachment) =>
    attachment.mimeType.startsWith("image/"),
  );
  const videos = attachments.filter(
    (attachment) =>
      attachment.mimeType.startsWith("video/") &&
      isPlayableVideo(attachment.mimeType),
  );
  const pdfs = attachments.filter((attachment) => isPdf(attachment.mimeType));

  if (!images.length && !videos.length && !pdfs.length) return null;

  return (
    <div className="flex max-w-full flex-col gap-2">
      {videos.map((attachment) => (
        <MediaGridVideoItem
          key={attachment.id}
          attachment={attachment}
          uploadProgress={uploadProgress}
        />
      ))}
      {pdfs.map((attachment) => (
        <MediaGridPdfItem
          key={attachment.id}
          attachment={attachment}
          uploadProgress={uploadProgress}
        />
      ))}
      {images.length > 0 && (
        <div
          className={cn(
            images.length === 1 && "flex max-w-full flex-wrap gap-2",
            images.length > 1 && "grid grid-cols-2 gap-2",
            images.length > 2 && "grid grid-cols-3 gap-2",
            images.length > 9 && "grid grid-cols-4 gap-2",
          )}
        >
          {images.map((attachment) => (
            <MediaGridImage
              key={attachment.id}
              attachment={attachment}
              single={images.length === 1}
              uploadProgress={uploadProgress}
            />
          ))}
        </div>
      )}
    </div>
  );
}
