import { useAuth } from "@clerk/tanstack-react-start";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { PhoneIcon } from "@phosphor-icons/react/dist/csr/Phone";
import { PushPinIcon } from "@phosphor-icons/react/dist/csr/PushPin";
import { VideoCameraIcon } from "@phosphor-icons/react/dist/csr/VideoCamera";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import * as React from "react";
import type { DragEvent } from "react";

import { Composer } from "~/components/composer";
import { MessageBubble } from "~/components/message-bubble";
import type { UIMessage } from "~/components/message-bubble";
import { Button } from "~/components/ui/button";
import { useConversationRealtime } from "~/hooks/use-conversation-realtime";
import { useMessageScroll } from "~/hooks/use-message-scroll";
import { useTRPC } from "~/integrations/trpc/react";
import { prepareImage } from "~/lib/image-processing";
import {
  localDb,
  markLocalMessageDeleted,
  upsertMessages,
  upsertUsers,
} from "~/lib/local-db";
import type { LocalMessage } from "~/lib/local-db";
import { syncMessages } from "~/lib/local-sync";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/_app/c/$conversationId")({
  component: ConversationPage,
});

function ConversationPage() {
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<Array<File>>([]);
  const [isDraggingFiles, setIsDraggingFiles] = React.useState(false);
  const [optimisticMessages, setOptimisticMessages] = React.useState<
    Array<UIMessage>
  >([]);
  const [optimisticallyDeletedIds, setOptimisticallyDeletedIds] =
    React.useState<Set<number>>(new Set());
  const dragDepth = React.useRef(0);
  const latestMessageRef = React.useRef<HTMLLIElement>(null);
  const filePreviews = React.useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );

  const { conversationId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
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
  const { mutate: markRead } = useMutation(
    trpc.conversations.markRead.mutationOptions(),
  );

  React.useEffect(
    () => () => {
      for (const preview of filePreviews) URL.revokeObjectURL(preview.url);
    },
    [filePreviews],
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
          attachments: message.attachments?.map((a) =>
            a.url && !(a as { willExpireAt?: Date }).willExpireAt
              ? { ...a, willExpireAt: new Date(Date.now() + 15 * 60 * 1000) }
              : a,
          ),
        })) as unknown as Array<LocalMessage>,
      );
    }
  }, [messages.data, convoId]);
  useConversationRealtime(convoId);

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

  const handleSend = (value = body) => {
    const messageBody = value.trim();
    if (!messageBody && !files.length) return;
    const selectedFiles = files;
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    setFiles([]);
    setBody("");
    void (async () => {
      // prepare first so pending preview uses same dimensions/compression as sent
      const preparedList: Array<Awaited<ReturnType<typeof prepareImage>>> = [];
      for (const file of selectedFiles) {
        preparedList.push(await prepareImage(file));
      }
      const optimisticUrls = preparedList.map((p) =>
        URL.createObjectURL(p.blob),
      );
      setOptimisticMessages((current) => [
        ...current,
        {
          id: tempId,
          conversationId: convoId,
          body: messageBody,
          senderId: me.data?.id ?? 0,
          createdAt: new Date(),
          username: me.data?.username ?? null,
          status: "sending",
          deletedAt: null,
          attachments: preparedList.map((prepared, index) => ({
            id: -(index + 1),
            messageId: 0,
            originalName: prepared.originalName,
            mimeType: prepared.mimeType,
            sizeBytes: prepared.blob.size,
            metadata: {
              width: prepared.width,
              height: prepared.height,
            },
            url: optimisticUrls[index],
          })),
        },
      ]);
      try {
        const attachments = [];
        for (const prepared of preparedList) {
          const upload = await uploadUrl.mutateAsync({
            conversationId: convoId,
            fileName: prepared.fileName,
            mimeType: prepared.mimeType,
            sizeBytes: prepared.blob.size,
          });
          const response = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": prepared.mimeType },
            body: prepared.blob,
          });
          if (!response.ok) throw new Error("File upload failed");
          attachments.push({
            objectKey: upload.objectKey,
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
            item.id === tempId ? { ...item, status: "failed" } : item,
          ),
        );
      }
    })();
  };

  const addDroppedFiles = (fileList: FileList | null) => {
    const droppedFiles = Array.from(fileList ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (droppedFiles.length)
      setFiles((current) => [...current, ...droppedFiles]);
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
  const latestMessage = [...renderedMessages]
    .reverse()
    .find((message) => typeof message.id === "number");
  const { hasNewMessages, messagesListRef, rowVirtualizer, scrollToLatest } =
    useMessageScroll(renderedMessages.length, convoId);
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
            <p className="text-lg font-medium">Drop images to attach</p>
            <p className="text-muted-foreground mt-1 text-sm">
              They will appear above the composer
            </p>
          </div>
        </div>
      )}
      <ConvoHeader conversationId={conversationId} />

      <ul
        ref={messagesListRef}
        className="relative min-h-0 w-full flex-1 overflow-y-scroll pt-4 pb-6"
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

        {filePreviews.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-3">
            {filePreviews.map((preview, index) => (
              <div
                key={`${preview.file.name}-${preview.file.lastModified}-${index}`}
                className="bg-muted relative h-20 w-20 shrink-0 overflow-hidden rounded-md border"
              >
                <img
                  src={preview.url}
                  alt={preview.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${preview.file.name}`}
                  className="bg-background/90 absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none shadow"
                  onClick={() =>
                    setFiles((current) => current.filter((_, i) => i !== index))
                  }
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
            canSubmit={Boolean(body.trim() || files.length)}
            onFilesSelected={(selected) =>
              setFiles((current) => [...current, ...selected])
            }
          />
        </div>
      </div>
    </div>
  );
}

function ConvoHeader({ conversationId }: { conversationId: string }) {
  const trpc = useTRPC();
  const { isLoaded, isSignedIn } = useAuth();
  const details = useQuery({
    ...trpc.conversations.details.queryOptions({
      conversationId: Number(conversationId),
    }),
    enabled: isLoaded && isSignedIn === true,
  });

  const user = details.data?.otherUser;

  return (
    <div className="flex h-14 items-center gap-3 border-b px-4">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground md:hidden"
      >
        <CaretLeftIcon className="h-5 w-5" />
      </Link>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium">
          {user?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
      )}
      <h1 className="text-sm font-medium">
        {user?.displayName ?? user?.username ?? "Unknown"}
      </h1>
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
