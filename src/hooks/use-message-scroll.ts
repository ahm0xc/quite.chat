import { useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 96;

export function useMessageScroll(messageCount: number) {
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const messagesListRef = useRef<HTMLUListElement>(null);
  const messagesEndRef = useRef<HTMLLIElement>(null);
  const isNearBottomRef = useRef(true);
  const hasInitializedScrollRef = useRef(false);

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
    if (messageCount === 0) return;

    if (!hasInitializedScrollRef.current || isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      hasInitializedScrollRef.current = true;
      setHasNewMessages(false);
    } else {
      setHasNewMessages(true);
    }
  }, [messageCount]);

  const scrollToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    isNearBottomRef.current = true;
    setHasNewMessages(false);
  };

  return {
    hasNewMessages,
    messagesEndRef,
    messagesListRef,
    scrollToLatest,
  };
}
