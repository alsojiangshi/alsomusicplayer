import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  direction?: 1 | -1;
  className?: string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  onReset: () => void;
}

export default function ResizeHandle({
  label,
  value,
  min,
  max,
  direction = 1,
  className = '',
  onChange,
  onCommit,
  onReset,
}: ResizeHandleProps) {
  const activePointerId = useRef<number | null>(null);
  const startX = useRef(0);
  const startValue = useRef(value);
  const currentValue = useRef(value);

  useEffect(() => {
    currentValue.current = value;
  }, [value]);

  useEffect(() => () => {
    document.body.classList.remove('is-resizing');
  }, []);

  const finishPointerResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    commit: boolean,
  ) => {
    if (activePointerId.current !== event.pointerId) {
      return;
    }

    activePointerId.current = null;
    document.body.classList.remove('is-resizing');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (commit) {
      onCommit(currentValue.current);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    activePointerId.current = event.pointerId;
    startX.current = event.clientX;
    startValue.current = value;
    currentValue.current = value;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    document.body.classList.add('is-resizing');
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) {
      return;
    }

    const nextValue = constrain(
      startValue.current + (event.clientX - startX.current) * direction,
      min,
      max,
    );
    currentValue.current = nextValue;
    onChange(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    const physicalDirection = event.key === 'ArrowRight' ? 1 : -1;
    const step = event.shiftKey ? 32 : 8;
    const nextValue = constrain(value + physicalDirection * direction * step, min, max);
    onChange(nextValue);
    onCommit(nextValue);
  };

  return (
    <div
      className={`resize-handle ${className}`.trim()}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} px`}
      title={label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishPointerResize(event, true)}
      onPointerCancel={event => finishPointerResize(event, true)}
      onLostPointerCapture={event => {
        if (activePointerId.current === event.pointerId) {
          finishPointerResize(event, true);
        }
      }}
      onDoubleClick={event => {
        event.preventDefault();
        onReset();
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

function constrain(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
