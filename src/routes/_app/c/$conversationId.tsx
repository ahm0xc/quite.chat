import { useAuth } from "@clerk/tanstack-react-start";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { PhoneIcon } from "@phosphor-icons/react/dist/csr/Phone";
import { PushPinIcon } from "@phosphor-icons/react/dist/csr/PushPin";
import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import * as React from "react";
import type { DragEvent } from "react";

import { Composer } from "~/components/composer";
import { GroupAvatar } from "~/components/group-avatar";
import { MessageBubble } from "~/components/message-bubble";
import type { UIMessage } from "~/components/message-bubble";
import { useSecondaryPanel } from "~/components/secondary-panel";
import { Button } from "~/components/ui/button";
import { UserAvatar } from "~/components/user-avatar";
import { useConversationRealtime } from "~/hooks/use-conversation-realtime";
import { useMessageScroll } from "~/hooks/use-message-scroll";
import { useIsMobile } from "~/hooks/use-mobile";
import { PRESENCE_META, usePresenceOf } from "~/hooks/use-presence";
import { useTRPC } from "~/integrations/trpc/react";
import { prepareImage, prepareVideo } from "~/lib/image-processing";
import {
  localDb,
  markLocalMessageDeleted,
  upsertMessages,
  upsertUsers,
} from "~/lib/local-db";
import type { LocalMessage } from "~/lib/local-db";
import { syncMessages } from "~/lib/local-sync";
import { preparePdf } from "~/lib/pdf-processing";
import { pusherClient } from "~/lib/pusher-client";
import { cn } from "~/lib/utils";
import { isTranscodeSupported, transcodeToMp4 } from "~/lib/video-transcode";

export const Route = createFileRoute("/_app/c/$conversationId")({
  component: ConversationPage,
});

type PendingAttachment = {
  id: string;
  kind: "image" | "video" | "pdf";
  status: "processing" | "ready" | "failed";
  previewUrl: string;
  prepared?: Awaited<ReturnType<typeof prepareImage>>;
  videoFile?: File;
  videoMeta?: Awaited<ReturnType<typeof prepareVideo>>;
  pdfFile?: File;
  pdfMeta?: Awaited<ReturnType<typeof preparePdf>>;
  originalName?: string;
  thumbnailBlob?: Blob;
  thumbnailUrl?: string;
  progress?: number;
  error?: string;
};

function isSupportedFile(file: File) {
  return (
    effectiveFileType(file).startsWith("image/") ||
    effectiveFileType(file) === "application/pdf" ||
    [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-matroska",
      "video/mkv",
    ].includes(effectiveFileType(file))
  );
}

function isBasicVideoFile(file: File) {
  return ["video/quicktime", "video/x-matroska", "video/mkv"].includes(
    effectiveFileType(file),
  );
}

const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const PDF_MAX_BYTES = 25 * 1024 * 1024;

function effectiveFileType(file: File) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".mkv")) return "video/x-matroska";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "";
}

function ConversationPage() {
  const [body, setBody] = React.useState("");
  const [pendingAttachments, setPendingAttachments] = React.useState<
    Array<PendingAttachment>
  >([]);
  const [isDraggingFiles, setIsDraggingFiles] = React.useState(false);
  const [optimisticMessages, setOptimisticMessages] = React.useState<
    Array<UIMessage>
  >([]);
  const [optimisticallyDeletedIds, setOptimisticallyDeletedIds] =
    React.useState<Set<number>>(new Set());
  const dragDepth = React.useRef(0);
  const latestMessageRef = React.useRef<HTMLLIElement>(null);
  const pendingAttachmentsRef = React.useRef<Array<PendingAttachment>>([]);

  const { conversationId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();

  const me = useQuery({
    ...trpc.users.me.queryOptions(),
    enabled: isLoaded && isSignedIn === true,
  });
  const convoId = Number(conversationId);
  const [prevConvoId, setPrevConvoId] = React.useState(convoId);

  // stale optimistic state bleeds across SPA navigations without this
  if (prevConvoId !== convoId) {
    setPrevConvoId(convoId);
    setOptimisticMessages([]);
    setOptimisticallyDeletedIds(new Set());
  }

  const messages = useQuery({
    ...trpc.conversations.messages.queryOptions({ conversationId: convoId }),
    enabled: isLoaded && isSignedIn === true,
  });
  const handleRemovedFromGroup = React.useCallback(() => {
    void navigate({ to: "/" });
  }, [navigate]);
  React.useEffect(() => {
    if (
      messages.error &&
      String(messages.error.message).includes("Not a member")
    ) {
      void localDb.conversations.delete(convoId);
      void localDb.messages.where("conversationId").equals(convoId).delete();
      void navigate({ to: "/" });
    }
  }, [messages.error, convoId, navigate]);
  React.useEffect(() => {
    const channel = pusherClient.subscribe("presence-global");
    const handler = (data: { conversationId?: number }) => {
      if (data.conversationId !== convoId) return;
      void queryClient.invalidateQueries(
        trpc.conversations.details.queryOptions({ conversationId: convoId }),
      );
      void queryClient.invalidateQueries(
        trpc.conversations.messages.queryOptions({ conversationId: convoId }),
      );
    };
    channel.bind("conversations.refresh", handler);
    return () => {
      channel.unbind("conversations.refresh", handler);
    };
  }, [convoId, queryClient, trpc]);
  const { mutate: markRead } = useMutation(
    trpc.conversations.markRead.mutationOptions(),
  );

  // stale optimistic state is reset during render above (prevConvoId check)

  const localMessages = useLiveQuery(
    () =>
      localDb.messages
        .where("conversationId")
        .equals(convoId)
        .sortBy("createdAt"),
    [convoId],
  );
  const cachedUsers = useLiveQuery(() => localDb.users.toArray(), []);
  const usernames = [
    ...new Set(
      [...(localMessages ?? []), ...(messages.data ?? [])]
        .map((message) => message.username)
        .filter((username): username is string => Boolean(username)),
    ),
  ];
  const missingUsernames = usernames.filter(
    (username) => !cachedUsers?.some((user) => user.username === username),
  );
  const usersByUsername = useQuery({
    ...trpc.users.getByUsernames.queryOptions({ usernames: missingUsernames }),
    enabled: isLoaded && isSignedIn === true && missingUsernames.length > 0,
  });
  React.useEffect(() => {
    if (usersByUsername.data?.length) void upsertUsers(usersByUsername.data);
  }, [usersByUsername.data]);
  React.useEffect(() => {
    if (messages.data) {
      const data = messages.data as Array<
        (typeof messages.data)[number] & {
          attachments?: Array<{ url?: string; willExpireAt?: Date }>;
        }
      >;
      void syncMessages(
        data.map((message) => ({
          ...message,
          conversationId: convoId,
          attachments: (
            message.attachments as Array<{ url?: string; willExpireAt?: Date }>
          ).map((a) =>
            a.url && !(a as { willExpireAt?: Date }).willExpireAt
              ? { ...a, willExpireAt: new Date(Date.now() + 15 * 60 * 1000) }
              : a,
          ),
        })) as unknown as Array<LocalMessage>,
      );
    }
  }, [messages.data, convoId]);
  useConversationRealtime(
    convoId,
    me.data?.id,
    me.data?.presenceStatus === "dnd",
    handleRemovedFromGroup,
  );

  const send = useMutation(
    trpc.conversations.sendMessage.mutationOptions({
      onSuccess: (message) => {
        queryClient.setQueryData(
          trpc.conversations.messages.queryKey({ conversationId: convoId }),
          (current) => {
            if (!current?.some((item) => item.id === message.id)) {
              return [...(current ?? []), message];
            }
            return current;
          },
        );
        void upsertMessages([
          {
            ...message,
            conversationId: convoId,
            attachments: (
              message.attachments as Array<{
                url?: string;
                willExpireAt?: Date;
              }>
            ).map((a) =>
              a.url && !a.willExpireAt
                ? {
                    ...a,
                    willExpireAt: new Date(Date.now() + 15 * 60 * 1000),
                  }
                : a,
            ),
          },
        ] as unknown as Array<LocalMessage>);
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
      },
      onError: () => {
        void queryClient.invalidateQueries(
          trpc.conversations.messages.queryOptions({
            conversationId: convoId,
          }),
        );
      },
    }),
  );
  const uploadUrl = useMutation(
    trpc.conversations.createUploadUrl.mutationOptions(),
  );

  const deleteMessage = useMutation(
    trpc.conversations.deleteMessage.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries({
          queryKey: trpc.conversations.messages.queryKey({
            conversationId: convoId,
          }),
        });
        const previousMessages = queryClient.getQueryData(
          trpc.conversations.messages.queryKey({ conversationId: convoId }),
        );
        const previousOptimistic = [...optimisticMessages];
        const previousDeletedIds = new Set(optimisticallyDeletedIds);
        const localPrevPromise = localDb.messages.get(variables.messageId);
        const deletedAt = new Date();
        setOptimisticallyDeletedIds((prev) => {
          const next = new Set(prev);
          next.add(variables.messageId);
          return next;
        });
        queryClient.setQueryData(
          trpc.conversations.messages.queryKey({ conversationId: convoId }),
          (current) =>
            current?.map((m) =>
              m.id === variables.messageId ? { ...m, deletedAt, body: "" } : m,
            ) ?? current,
        );
        setOptimisticMessages((current) =>
          current.map((m) =>
            m.id === variables.messageId ? { ...m, deletedAt, body: "" } : m,
          ),
        );
        void markLocalMessageDeleted(variables.messageId);
        const localPrev = await localPrevPromise;
        return {
          previousMessages,
          previousOptimistic,
          previousDeletedIds,
          localPrev,
        };
      },
      onError: (_error, _variables, context) => {
        if (context?.previousMessages) {
          queryClient.setQueryData(
            trpc.conversations.messages.queryKey({ conversationId: convoId }),
            context.previousMessages,
          );
        }
        if (context?.previousOptimistic) {
          setOptimisticMessages(context.previousOptimistic);
        }
        if (context?.previousDeletedIds) {
          setOptimisticallyDeletedIds(context.previousDeletedIds);
        }
        if (context?.localPrev) {
          void localDb.messages.put(context.localPrev);
        }
      },
      onSettled: () => {
        void queryClient.invalidateQueries(
          trpc.conversations.list.queryOptions(),
        );
      },
    }),
  );

  const queueFiles = (incoming: Array<File>) => {
    const accepted = incoming.filter(
      (file) =>
        isSupportedFile(file) &&
        (effectiveFileType(file).startsWith("video/")
          ? file.size <= VIDEO_MAX_BYTES
          : effectiveFileType(file) === "application/pdf"
            ? file.size <= PDF_MAX_BYTES
            : true),
    );
    if (!accepted.length) return;
    const queued: Array<PendingAttachment> = accepted.map((file) => ({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `pending-${Math.random().toString(36).slice(2)}`,
      kind: effectiveFileType(file).startsWith("image/")
        ? "image"
        : effectiveFileType(file) === "application/pdf"
          ? "pdf"
          : "video",
      status: "processing",
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingAttachments((current) => [...current, ...queued]);
    for (let index = 0; index < accepted.length; index++) {
      const file = accepted[index];
      const queuedItem = queued[index];
      if (queuedItem.kind === "image") {
        void prepareImage(file).then(
          (prepared) => {
            const preparedUrl = URL.createObjectURL(prepared.blob);
            setPendingAttachments((current) => {
              if (!current.some((item) => item.id === queuedItem.id)) {
                URL.revokeObjectURL(preparedUrl);
                return current;
              }
              return current.map((item) =>
                item.id === queuedItem.id
                  ? {
                      ...item,
                      status: "ready",
                      prepared,
                      previewUrl: preparedUrl,
                    }
                  : item,
              );
            });
            URL.revokeObjectURL(queuedItem.previewUrl);
          },
          () => {
            setPendingAttachments((current) =>
              current.map((item) =>
                item.id === queuedItem.id
                  ? { ...item, status: "failed", error: "Failed to process" }
                  : item,
              ),
            );
          },
        );
      } else if (queuedItem.kind === "pdf") {
        void preparePdf(file).then(
          (meta) => {
            const thumbnailUrl = URL.createObjectURL(meta.posterBlob);
            setPendingAttachments((current) => {
              if (!current.some((item) => item.id === queuedItem.id)) {
                URL.revokeObjectURL(thumbnailUrl);
                return current;
              }
              URL.revokeObjectURL(queuedItem.previewUrl);
              return current.map((item) =>
                item.id === queuedItem.id
                  ? {
                      ...item,
                      status: "ready",
                      pdfFile: file,
                      originalName: file.name,
                      pdfMeta: meta,
                      thumbnailBlob: meta.posterBlob,
                      thumbnailUrl,
                    }
                  : item,
              );
            });
          },
          () => {
            setPendingAttachments((current) =>
              current.map((item) =>
                item.id === queuedItem.id
                  ? { ...item, status: "failed", error: "Failed to process" }
                  : item,
              ),
            );
          },
        );
      } else {
        void (async () => {
          const shouldTranscode = isBasicVideoFile(file);
          const canTranscode =
            shouldTranscode && (await isTranscodeSupported());
          const videoFile = canTranscode
            ? await transcodeToMp4(file, {
                onProgress: (progress) => {
                  setPendingAttachments((current) =>
                    current.map((item) =>
                      item.id === queuedItem.id ? { ...item, progress } : item,
                    ),
                  );
                },
              })
            : file;
          if (videoFile.size > VIDEO_MAX_BYTES) {
            throw new Error("Converted video is larger than 100 MB");
          }
          try {
            const meta = await prepareVideo(videoFile);
            const thumbnailUrl = URL.createObjectURL(meta.thumbnailBlob);
            const videoPreviewUrl = URL.createObjectURL(videoFile);
            setPendingAttachments((current) => {
              if (!current.some((item) => item.id === queuedItem.id)) {
                URL.revokeObjectURL(thumbnailUrl);
                URL.revokeObjectURL(videoPreviewUrl);
                return current;
              }
              URL.revokeObjectURL(queuedItem.previewUrl);
              return current.map((item) =>
                item.id === queuedItem.id
                  ? {
                      ...item,
                      status: "ready",
                      previewUrl: videoPreviewUrl,
                      videoFile,
                      originalName: file.name,
                      videoMeta: meta,
                      thumbnailBlob: meta.thumbnailBlob,
                      thumbnailUrl,
                    }
                  : item,
              );
            });
          } catch {
            // mov/mkv often can't be parsed by this browser (but may play
            // elsewhere), so let them send without a thumbnail instead of
            // blocking; mp4/webm failures stay blocked as likely corrupt.
            if (!isBasicVideoFile(file) || canTranscode) {
              setPendingAttachments((current) =>
                current.map((item) =>
                  item.id === queuedItem.id
                    ? { ...item, status: "failed", error: "Failed to process" }
                    : item,
                ),
              );
              return;
            }
            setPendingAttachments((current) =>
              current.map((item) =>
                item.id === queuedItem.id
                  ? {
                      ...item,
                      status: "ready",
                      videoFile: file,
                      originalName: file.name,
                    }
                  : item,
              ),
            );
          }
        })().catch(() => {
          setPendingAttachments((current) =>
            current.map((item) =>
              item.id === queuedItem.id
                ? { ...item, status: "failed", error: "Failed to process" }
                : item,
            ),
          );
        });
      }
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        if (target.thumbnailUrl) URL.revokeObjectURL(target.thumbnailUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  };

  const handleSend = (value = body) => {
    const messageBody = value.trim();
    if (pendingAttachments.some((item) => item.status === "processing")) return;
    const readyItems = pendingAttachments.filter(
      (item) =>
        item.status === "ready" &&
        ((item.kind === "image" && item.prepared) ||
          (item.kind === "video" && item.videoFile) ||
          (item.kind === "pdf" && item.pdfFile)),
    );
    if (!messageBody && !readyItems.length) return;
    const snapshot = readyItems.map((item) => ({
      kind: item.kind,
      prepared: item.prepared,
      videoFile: item.videoFile,
      originalName: item.originalName,
      videoMeta: item.videoMeta,
      thumbnailBlob: item.thumbnailBlob,
      pdfFile: item.pdfFile,
      pdfMeta: item.pdfMeta,
    }));
    const pendingUrls = pendingAttachments.flatMap((item) =>
      item.thumbnailUrl
        ? [item.previewUrl, item.thumbnailUrl]
        : [item.previewUrl],
    );
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    setPendingAttachments([]);
    for (const url of pendingUrls) URL.revokeObjectURL(url);
    setBody("");
    void (async () => {
      const optimisticImages = snapshot
        .filter((item) => item.kind === "image" && item.prepared)
        .map((item) => item.prepared as NonNullable<typeof item.prepared>);
      const optimisticVideos = snapshot.filter(
        (item) => item.kind === "video" && item.videoFile,
      );
      const optimisticPdfs = snapshot.filter(
        (item) => item.kind === "pdf" && item.pdfFile,
      );
      const optimisticImageUrls = optimisticImages.map((p) =>
        URL.createObjectURL(p.blob),
      );
      const optimisticVideoUrls = optimisticVideos.map((item) => ({
        url: URL.createObjectURL(item.videoFile as File),
        posterUrl: item.thumbnailBlob
          ? URL.createObjectURL(item.thumbnailBlob)
          : undefined,
      }));
      const optimisticPdfUrls = optimisticPdfs.map((item) => ({
        url: URL.createObjectURL(item.pdfFile as File),
        posterUrl: item.thumbnailBlob
          ? URL.createObjectURL(item.thumbnailBlob)
          : undefined,
      }));
      setOptimisticMessages((current) => [
        ...current,
        {
          id: tempId,
          conversationId: convoId,
          body: messageBody,
          senderId: me.data?.id ?? 0,
          kind: "user" as const,
          metadata: null,
          createdAt: new Date(),
          username: me.data?.username ?? null,
          status: "sending",
          deletedAt: null,
          uploadProgress: 0,
          attachments: [
            ...optimisticImages.map((prepared, index) => ({
              id: -(index + 1),
              messageId: 0,
              originalName: prepared.originalName,
              mimeType: prepared.mimeType,
              sizeBytes: prepared.blob.size,
              metadata: {
                width: prepared.width,
                height: prepared.height,
              },
              url: optimisticImageUrls[index],
            })),
            ...optimisticVideos.map((item, index) => ({
              id: -(optimisticImages.length + index + 1),
              messageId: 0,
              originalName:
                item.originalName ?? item.videoFile?.name ?? "video",
              mimeType:
                item.videoMeta?.mimeType ??
                effectiveFileType(item.videoFile as File),
              sizeBytes: item.videoFile?.size ?? 0,
              metadata: {
                width: item.videoMeta?.width,
                height: item.videoMeta?.height,
                duration: item.videoMeta?.duration,
              },
              url: optimisticVideoUrls[index].url,
              posterUrl: optimisticVideoUrls[index].posterUrl,
            })),
            ...optimisticPdfs.map((item, index) => ({
              id: -(
                optimisticImages.length +
                optimisticVideos.length +
                index +
                1
              ),
              messageId: 0,
              originalName:
                item.originalName ?? item.pdfFile?.name ?? "document",
              mimeType: "application/pdf",
              sizeBytes: item.pdfFile?.size ?? 0,
              metadata: {
                width: item.pdfMeta?.width,
                height: item.pdfMeta?.height,
              },
              url: optimisticPdfUrls[index].url,
              posterUrl: optimisticPdfUrls[index].posterUrl,
            })),
          ],
        } as unknown as UIMessage,
      ]);
      const uploadBlob = (
        fileName: string,
        mimeType: string,
        sizeBytes: number,
        blob: Blob,
        onProgress: (percent: number) => void,
      ): Promise<string> => {
        const doUpload = async () => {
          const upload = await uploadUrl.mutateAsync({
            conversationId: convoId,
            fileName,
            mimeType,
            sizeBytes,
          });
          return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (event) => {
              if (event.lengthComputable) {
                onProgress(Math.round((event.loaded / event.total) * 100));
              }
            });
            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(upload.objectKey);
              } else {
                reject(new Error("File upload failed"));
              }
            });
            xhr.addEventListener("error", () =>
              reject(new Error("File upload failed")),
            );
            xhr.open("PUT", upload.uploadUrl);
            xhr.setRequestHeader("Content-Type", mimeType);
            xhr.send(blob);
          });
        };
        return doUpload();
      };

      const updateProgress = (percent: number) => {
        setOptimisticMessages((current) =>
          current.map((item) =>
            item.id === tempId ? { ...item, uploadProgress: percent } : item,
          ),
        );
      };

      try {
        const totalAttachments = snapshot.length;
        const attachments = [];
        for (let i = 0; i < snapshot.length; i++) {
          const item = snapshot[i];
          const baseProgress = (i / totalAttachments) * 100;
          const weight = 100 / totalAttachments;
          if (item.kind === "image" && item.prepared) {
            const prepared = item.prepared;
            const objectKey = await uploadBlob(
              prepared.fileName,
              prepared.mimeType,
              prepared.blob.size,
              prepared.blob,
              (percent) =>
                updateProgress(baseProgress + (percent / 100) * weight),
            );
            attachments.push({
              objectKey,
              originalName: prepared.originalName,
              mimeType: prepared.mimeType,
              sizeBytes: prepared.blob.size,
              metadata: {
                width: prepared.width,
                height: prepared.height,
                originalMimeType: prepared.originalMimeType,
                originalSizeBytes: prepared.originalSizeBytes,
              },
            });
          } else if (item.kind === "video" && item.videoFile) {
            const file = item.videoFile;
            const meta = item.videoMeta;
            const mimeType = meta?.mimeType ?? effectiveFileType(file);
            let posterKey: string | undefined;
            if (meta && item.thumbnailBlob) {
              posterKey = await uploadBlob(
                meta.posterFileName,
                "image/webp",
                item.thumbnailBlob.size,
                item.thumbnailBlob,
                (percent) =>
                  updateProgress(baseProgress + (percent / 100) * weight * 0.1),
              );
            }
            const videoKey = await uploadBlob(
              file.name,
              mimeType,
              file.size,
              file,
              (percent) =>
                updateProgress(
                  baseProgress + weight * 0.1 + (percent / 100) * weight * 0.9,
                ),
            );
            attachments.push({
              objectKey: videoKey,
              originalName: item.originalName ?? file.name,
              mimeType,
              sizeBytes: file.size,
              metadata: {
                width: meta?.width,
                height: meta?.height,
                duration: meta?.duration,
                ...(posterKey ? { posterKey } : {}),
              },
            });
          } else if (item.kind === "pdf" && item.pdfFile) {
            const file = item.pdfFile;
            const meta = item.pdfMeta;
            let posterKey: string | undefined;
            if (meta && item.thumbnailBlob) {
              posterKey = await uploadBlob(
                meta.posterFileName,
                "image/webp",
                item.thumbnailBlob.size,
                item.thumbnailBlob,
                (percent) =>
                  updateProgress(baseProgress + (percent / 100) * weight * 0.1),
              );
            }
            const pdfKey = await uploadBlob(
              file.name,
              "application/pdf",
              file.size,
              file,
              (percent) =>
                updateProgress(
                  baseProgress + weight * 0.1 + (percent / 100) * weight * 0.9,
                ),
            );
            attachments.push({
              objectKey: pdfKey,
              originalName: item.originalName ?? file.name,
              mimeType: "application/pdf",
              sizeBytes: file.size,
              metadata: {
                width: meta?.width,
                height: meta?.height,
                ...(posterKey ? { posterKey } : {}),
              },
            });
          }
        }
        await send.mutateAsync({
          conversationId: convoId,
          body: messageBody,
          attachments,
        });
        // remove optimistic by tempId (more reliable than body match for image-only messages)
        setOptimisticMessages((current) =>
          current.filter((item) => item.id !== tempId),
        );
      } catch {
        setOptimisticMessages((current) =>
          current.map((item) =>
            item.id === tempId
              ? { ...item, status: "failed", uploadProgress: undefined }
              : item,
          ),
        );
      }
    })();
  };

  const addDroppedFiles = (fileList: FileList | null) => {
    queueFiles(Array.from(fileList ?? []));
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current += 1;
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingFiles(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDraggingFiles(false);
    addDroppedFiles(event.dataTransfer.files);
  };

  const baseMessages = (
    messages.data?.length ? messages.data : (localMessages ?? [])
  ).map((m) =>
    optimisticallyDeletedIds.has(m.id)
      ? { ...m, deletedAt: new Date(), body: "" }
      : m,
  );
  const renderedMessages = [...baseMessages, ...optimisticMessages];
  const users = [...(cachedUsers ?? []), ...(usersByUsername.data ?? [])];
  const isProcessingAttachments = pendingAttachments.some(
    (item) => item.status === "processing",
  );
  const hasReadyAttachments = pendingAttachments.some(
    (item) => item.status === "ready",
  );
  const canSubmit =
    Boolean(body.trim() || hasReadyAttachments) && !isProcessingAttachments;
  const latestMessage = [...renderedMessages]
    .reverse()
    .find((message) => typeof message.id === "number");
  const { hasNewMessages, messagesListRef, rowVirtualizer, scrollToLatest } =
    useMessageScroll(renderedMessages.length, convoId);

  React.useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  React.useEffect(
    () => () => {
      for (const item of pendingAttachmentsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
        if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
      }
    },
    [],
  );

  React.useEffect(() => {
    const message = latestMessage;
    const element = latestMessageRef.current;
    const list = messagesListRef.current;
    if (!message || !element || !list) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && isLoaded && isSignedIn === true) {
          markRead({
            conversationId: convoId,
            messageId: message.id as number,
          });
        }
      },
      { root: list, threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [convoId, isLoaded, isSignedIn, latestMessage, markRead, messagesListRef]);

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFiles && (
        <div className="bg-background/80 pointer-events-none absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="border-primary bg-primary/10 rounded-lg border-2 border-dashed px-8 py-6 text-center">
            <p className="text-lg font-medium">Drop files to attach</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Images, videos, and PDFs are supported
            </p>
          </div>
        </div>
      )}
      <ConvoHeader conversationId={conversationId} />

      <ul
        ref={messagesListRef}
        className="relative min-h-0 w-full flex-1 overflow-y-scroll pt-4"
      >
        <div
          className="relative min-h-full w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const msg = renderedMessages[virtualRow.index];
            return (
              <li
                key={msg.id}
                data-index={virtualRow.index}
                ref={(element) => {
                  rowVirtualizer.measureElement(element);
                  if (msg.id === latestMessage?.id)
                    latestMessageRef.current = element;
                }}
                className={cn(
                  "absolute top-0 left-0 flex w-full pb-8",
                  "justify-start",
                )}
                style={{
                  top: `max(0px, calc(100% - ${rowVirtualizer.getTotalSize()}px))`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <MessageBubble
                  message={msg}
                  sender={users.find((user) => user.id === msg.senderId)}
                  isOwnMessage={me.data?.id === msg.senderId}
                  conversationId={convoId}
                  onDelete={(messageId) =>
                    deleteMessage.mutate({
                      conversationId: convoId,
                      messageId,
                    })
                  }
                />
              </li>
            );
          })}
        </div>
      </ul>

      <div className="relative border-t">
        {hasNewMessages && (
          <Button
            type="button"
            variant="secondary"
            className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 gap-2 rounded-full shadow-md"
            onClick={scrollToLatest}
          >
            <ArrowDownIcon />
            New messages
          </Button>
        )}

        {pendingAttachments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-3">
            {pendingAttachments.map((item) => (
              <div
                key={item.id}
                className="bg-muted relative h-20 w-20 shrink-0 overflow-hidden rounded-md border"
              >
                {item.status === "processing" ? (
                  <div
                    aria-label="Processing attachment"
                    className="flex h-full w-full items-center justify-center"
                  >
                    {item.kind === "video" ? (
                      <video
                        src={item.previewUrl}
                        aria-hidden="true"
                        muted
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 h-full w-full object-cover opacity-50"
                      />
                    ) : item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 h-full w-full object-cover opacity-50"
                      />
                    ) : null}
                    <span
                      aria-hidden="true"
                      className="border-muted-foreground/30 border-t-foreground relative h-6 w-6 animate-spin rounded-full border-2"
                    />
                    {item.progress !== undefined && (
                      <div className="absolute right-1 bottom-1 left-1 h-1 overflow-hidden rounded-full bg-black/30">
                        <div
                          className="bg-primary h-full transition-[width] duration-150"
                          style={{ width: `${item.progress * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                ) : item.status === "ready" ? (
                  item.kind === "video" ? (
                    item.thumbnailUrl ? (
                      <video
                        src={item.previewUrl}
                        poster={item.thumbnailUrl}
                        aria-label="Video attachment preview"
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        aria-label="Video attachment preview"
                        className="text-muted-foreground flex h-full w-full items-center justify-center overflow-hidden px-1 text-center text-[10px] break-all"
                      >
                        {item.videoFile?.name ?? "video"}
                      </div>
                    )
                  ) : item.kind === "pdf" ? (
                    item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        aria-label="PDF attachment preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        aria-label="PDF attachment preview"
                        className="text-muted-foreground flex h-full w-full items-center justify-center overflow-hidden px-1 text-center text-[10px] break-all"
                      >
                        {item.pdfFile?.name ?? "document"}
                      </div>
                    )
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )
                ) : (
                  <div
                    aria-label="Attachment failed to process"
                    className="text-destructive flex h-full w-full items-center justify-center px-1 text-center text-xs"
                  >
                    Failed
                  </div>
                )}
                <button
                  type="button"
                  aria-label={
                    item.status === "processing"
                      ? "Remove processing attachment"
                      : "Remove attachment"
                  }
                  className="bg-background/90 absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none shadow"
                  onClick={() => removePendingAttachment(item.id)}
                >
                  ×{" "}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="px-3 pt-3 pb-3">
          <Composer
            onChange={setBody}
            onSubmit={handleSend}
            canSubmit={canSubmit}
            onFilesSelected={queueFiles}
          />
        </div>
      </div>
    </div>
  );
}

function ConvoHeader({ conversationId }: { conversationId: string }) {
  const trpc = useTRPC();
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setView } = useSecondaryPanel();
  const details = useQuery({
    ...trpc.conversations.details.queryOptions({
      conversationId: Number(conversationId),
    }),
    enabled: isLoaded && isSignedIn === true,
  });
  React.useEffect(() => {
    if (
      details.error &&
      String(details.error.message).includes("Not a member")
    ) {
      void localDb.conversations.delete(Number(conversationId));
      void localDb.messages
        .where("conversationId")
        .equals(Number(conversationId))
        .delete();
      void navigate({ to: "/" });
    }
  }, [details.error, conversationId, navigate]);

  const isGroup = details.data?.type === "group";
  const user = details.data?.otherUser;
  const presence = usePresenceOf(user?.id, user?.presenceStatus ?? "offline");
  const members =
    (
      details.data as
        | {
            members?: Array<{
              userId?: number;
              username?: string | null;
              displayName?: string | null;
              avatarUrl: string | null;
            }>;
          }
        | undefined
    )?.members ?? [];

  const handleOpenGroupInfo = () => {
    if (isMobile) {
      void navigate({
        to: "/c/info/$conversationId",
        params: { conversationId },
      });
    } else {
      setView("group-info", { conversationId: Number(conversationId) });
    }
  };

  if (isGroup) {
    return (
      <>
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground md:hidden"
          >
            <CaretLeftIcon className="h-5 w-5" />
          </Link>
          <button
            type="button"
            onClick={handleOpenGroupInfo}
            className="flex items-center gap-3 text-left"
          >
            <GroupAvatar
              title={details.data?.title}
              members={members}
              size="sm"
            />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium">
                {details.data?.title ?? "Group"}
              </h1>
              <p className="text-muted-foreground text-xs">
                {members.length} members
              </p>
            </div>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Group info"
              onClick={handleOpenGroupInfo}
            >
              <MagnifyingGlassIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Pinned messages">
              <PushPinIcon />
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-14 items-center gap-3 border-b px-4">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground md:hidden"
      >
        <CaretLeftIcon className="h-5 w-5" />
      </Link>
      <UserAvatar
        userId={user?.id}
        username={user?.username}
        showPresence
        size="sm"
      />
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium">
          {user?.displayName ?? user?.username ?? "Unknown"}
        </h1>
        <p className="text-muted-foreground text-xs">
          {PRESENCE_META[presence].label}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Voice call">
          <PhoneIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Video call">
          <VideoCameraIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Pinned messages">
          <PushPinIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Search messages">
          <MagnifyingGlassIcon />
        </Button>
      </div>
    </div>
  );
}
