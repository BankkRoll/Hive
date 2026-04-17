"use client";

import { useCallback, useRef, useState, useEffect } from "react";

interface UsePullRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number; // Distance in px to trigger refresh
  disabled?: boolean;
}

interface UsePullRefreshReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
}

export function usePullRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullRefreshOptions): UsePullRefreshReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing) return;

      const container = containerRef.current;
      if (!container) return;

      // Only start pull if at top of scroll
      if (container.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    },
    [disabled, isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isPulling || disabled || isRefreshing) return;

      const container = containerRef.current;
      if (!container) return;

      currentY.current = e.touches[0].clientY;
      const distance = Math.max(0, currentY.current - startY.current);

      // Apply resistance as you pull further
      const resistedDistance = Math.min(distance * 0.5, threshold * 1.5);
      setPullDistance(resistedDistance);

      // Prevent default scrolling when pulling
      if (distance > 0 && container.scrollTop === 0) {
        e.preventDefault();
      }
    },
    [isPulling, disabled, isRefreshing, threshold]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;

    setIsPulling(false);

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
  }, [isPulling, pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    pullDistance,
    isRefreshing,
    isPulling,
  };
}
