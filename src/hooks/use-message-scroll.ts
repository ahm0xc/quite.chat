import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 96;

export function useMessageScroll(messageCount: number) {
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

  useEffect(() => {
    if (messageCount === 0) {
      prevCountRef.current = 0;
      return;
    }

    if (!hasInitializedScrollRef.current) {
      rowVirtualizer.scrollToIndex(messageCount - 1, { align: "end" });
      hasInitializedScrollRef.current = true;
      prevCountRef.current = messageCount;
      setHasNewMessages(false);
      return;
    }

    if (messageCount <= prevCountRef.current) {
      prevCountRef.current = messageCount;
      return;
    }
    prevCountRef.current = messageCount;

    if (isNearBottomRef.current) {
      rowVirtualizer.scrollToIndex(messageCount - 1, { align: "end" });
      setHasNewMessages(false);
    } else {
      setHasNewMessages(true);
    }
  }, [messageCount, rowVirtualizer]);

  const scrollToLatest = () => {
    if (messageCount > 0) {
      rowVirtualizer.scrollToIndex(messageCount - 1, {
        align: "end",
        behavior: "smooth",
      });
    }
    isNearBottomRef.current = true;
    setHasNewMessages(false);
  };

  return {
    hasNewMessages,
    messagesListRef,
    rowVirtualizer,
    scrollToLatest,
  };
}
