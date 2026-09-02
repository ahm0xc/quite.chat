import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const BOTTOM_THRESHOLD = 96;

export function useMessageScroll(
  messageCount: number,
  conversationKey?: string | number,
) {
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const messagesListRef = useRef<HTMLUListElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: messageCount,
    getScrollElement: () => messagesListRef.current,
    estimateSize: () => 72,
    getItemKey: (index) => index,
    overscan: 8,
  });
  const isNearBottomRef = useRef(true);
  const hasInitializedScrollRef = useRef(false);
  const prevCountRef = useRef(0);
  const prevKeyRef = useRef(conversationKey);

  if (prevKeyRef.current !== conversationKey) {
    prevKeyRef.current = conversationKey;
    hasInitializedScrollRef.current = false;
    prevCountRef.current = 0;
    isNearBottomRef.current = true;
  }

  useEffect(() => {
    setHasNewMessages(false);
  }, [conversationKey]);

  useEffect(() => {
    const list = messagesListRef.current;
    if (!list) return;

    const updateScrollPosition = () => {
      const distanceFromBottom =
        list.scrollHeight - list.scrollTop - list.clientHeight;
      isNearBottomRef.current = distanceFromBottom <= BOTTOM_THRESHOLD;
    };

    updateScrollPosition();
    list.addEventListener("scroll", updateScrollPosition, { passive: true });
    return () => list.removeEventListener("scroll", updateScrollPosition);
  }, []);

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const list = messagesListRef.current;
      if (!list || messageCount === 0) return;
      rowVirtualizer.scrollToIndex(messageCount - 1, {
        align: "end",
        behavior: smooth ? "smooth" : "auto",
      });
      const maxTop = list.scrollHeight - list.clientHeight;
      if (maxTop > 0) {
        if (smooth) {
          list.scrollTo({ top: maxTop, behavior: "smooth" });
        } else {
          list.scrollTop = maxTop;
        }
      }
    },
    [messageCount, rowVirtualizer],
  );

  const scheduleBottomScroll = useCallback(() => {
    scrollToBottom(false);
    const raf1 = requestAnimationFrame(() => {
      scrollToBottom(false);
      requestAnimationFrame(() => scrollToBottom(false));
    });
    const t1 = setTimeout(() => scrollToBottom(false), 50);
    const t2 = setTimeout(() => scrollToBottom(false), 250);
    return () => {
      cancelAnimationFrame(raf1);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    if (messageCount === 0) {
      prevCountRef.current = 0;
      hasInitializedScrollRef.current = false;
      return;
    }

    if (messageCount < prevCountRef.current) {
      hasInitializedScrollRef.current = false;
    }

    if (!hasInitializedScrollRef.current) {
      hasInitializedScrollRef.current = true;
      prevCountRef.current = messageCount;
      setHasNewMessages(false);
      return scheduleBottomScroll();
    }

    if (messageCount <= prevCountRef.current) {
      prevCountRef.current = messageCount;
      return;
    }
    prevCountRef.current = messageCount;

    if (isNearBottomRef.current) {
      return scheduleBottomScroll();
    } else {
      setHasNewMessages(true);
    }
  }, [messageCount, rowVirtualizer, scheduleBottomScroll]);

  // Re-assert bottom when virtualizer re-measures (estimate 72 -> actual) or mobile dvh settles.
  // Without this, first scroll can land a few items above bottom when heights were still estimated.
  const totalSize = rowVirtualizer.getTotalSize();
  useLayoutEffect(() => {
    if (
      hasInitializedScrollRef.current &&
      isNearBottomRef.current &&
      messageCount > 0
    ) {
      const list = messagesListRef.current;
      if (!list) return;
      const maxTop = list.scrollHeight - list.clientHeight;
      // if we drifted > 16px from bottom (estimate error), correct it
      if (maxTop > 0 && Math.abs(list.scrollTop - maxTop) > 16) {
        scrollToBottom(false);
      }
    }
  }, [totalSize, messageCount, scrollToBottom]);

  const scrollToLatest = useCallback(() => {
    if (messageCount > 0) {
      scrollToBottom(true);
      requestAnimationFrame(() => scrollToBottom(true));
    }
    isNearBottomRef.current = true;
    setHasNewMessages(false);
  }, [messageCount, scrollToBottom]);

  return {
    hasNewMessages,
    messagesListRef,
    rowVirtualizer,
    scrollToLatest,
  };
}
