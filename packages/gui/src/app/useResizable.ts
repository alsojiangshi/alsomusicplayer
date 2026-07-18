import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseResizableOptions {
  defaultValue: number;
  min: number;
  max: number;
  storageKey: string;
}

export interface ResizableValue {
  value: number;
  min: number;
  max: number;
  setValue: (value: number) => void;
  commitValue: (value?: number) => void;
  reset: () => void;
}

export function useResizable({
  defaultValue,
  min,
  max,
  storageKey,
}: UseResizableOptions): ResizableValue {
  const safeMax = Math.max(min, max);
  const [preferredValue, setPreferredValue] = useState(() =>
    readStoredValue(storageKey, defaultValue),
  );
  const value = useMemo(
    () => clamp(preferredValue, min, safeMax),
    [min, preferredValue, safeMax],
  );

  const setValue = useCallback(
    (nextValue: number) => {
      setPreferredValue(clamp(nextValue, min, safeMax));
    },
    [min, safeMax],
  );

  const commitValue = useCallback(
    (nextValue = value) => {
      const constrainedValue = clamp(nextValue, min, safeMax);
      setPreferredValue(constrainedValue);
      writeStoredValue(storageKey, constrainedValue);
    },
    [min, safeMax, storageKey, value],
  );

  const reset = useCallback(() => {
    setPreferredValue(defaultValue);
    removeStoredValue(storageKey);
  }, [defaultValue, storageKey]);

  return {
    value,
    min,
    max: safeMax,
    setValue,
    commitValue,
    reset,
  };
}

export function useViewportWidth(): number {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    let frame = 0;
    const handleResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewportWidth(window.innerWidth);
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return viewportWidth;
}

function readStoredValue(storageKey: string, fallback: number): number {
  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (rawValue === null) {
      return fallback;
    }
    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(storageKey: string, value: number): void {
  try {
    window.localStorage.setItem(storageKey, String(Math.round(value)));
  } catch {
    // Local storage can be unavailable in hardened webviews; resizing still works in memory.
  }
}

function removeStoredValue(storageKey: string): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Keep the in-memory default when local storage is unavailable.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
