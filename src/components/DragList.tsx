import { useRef, useState, type HTMLAttributes, type ReactNode } from 'react';

interface Drag {
  from: number;
  to: number;
  dy: number;
  startY: number;
  /** 시작 시 각 행의 가운데 (문서 좌표) */
  mids: number[];
  height: number;
}

export type HandleProps = HTMLAttributes<HTMLElement>;

/**
 * 손가락(또는 마우스)으로 끌어서 한 번에 원하는 위치로 옮기는 목록.
 * render 가 받은 handleProps 를 붙인 요소를 잡고 끌면 된다. 키보드는 ↑/↓.
 */
export function DragList<T>({
  items,
  keyOf,
  render,
  onMove,
  className = 'space-y-1.5',
  label,
}: {
  items: T[];
  keyOf: (item: T) => string;
  render: (item: T, index: number, handleProps: HandleProps, dragging: boolean) => ReactNode;
  onMove: (from: number, to: number) => void;
  className?: string;
  label?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const raf = useRef<number | null>(null);
  const lastClientY = useRef(0);

  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const moveTo = (clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = clientY + window.scrollY - d.startY;
    // 끌고 있는 행의 가운데보다 위에 있는 (다른) 행의 개수 = 놓일 위치
    const center = d.mids[d.from]! + dy;
    const to = d.mids.filter((m, i) => i !== d.from && m < center).length;
    update({ ...d, dy, to });
  };

  const stopScroll = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  // 화면 위/아래 끝에 가까우면 자동 스크롤 → 긴 목록도 한 번에 옮김
  const autoScroll = () => {
    if (!dragRef.current) return stopScroll();
    const y = lastClientY.current;
    const edge = 80;
    const speed = y < edge ? -(edge - y) / 4 : y > window.innerHeight - edge ? (y - (window.innerHeight - edge)) / 4 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      moveTo(y);
    }
    raf.current = requestAnimationFrame(autoScroll);
  };

  const start = (index: number, e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rows = [...(listRef.current?.children ?? [])] as HTMLElement[];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const me = rects[index];
    if (!me) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 실패해도 끌기는 계속 */
    }
    const gap = rects.length > 1 ? rects[1]!.top - rects[0]!.bottom : 0;
    lastClientY.current = e.clientY;
    update({
      from: index,
      to: index,
      dy: 0,
      startY: e.clientY + window.scrollY,
      mids: rects.map((r) => (r.top + r.bottom) / 2 + window.scrollY),
      height: me.height + gap,
    });
    stopScroll();
    raf.current = requestAnimationFrame(autoScroll);
  };

  const end = () => {
    const d = dragRef.current;
    stopScroll();
    update(null);
    if (d && d.to !== d.from) onMove(d.from, d.to);
  };

  const handleFor = (index: number): HandleProps => ({
    role: 'button',
    tabIndex: 0,
    'aria-roledescription': '끌어서 순서 변경',
    style: { touchAction: 'none', cursor: drag ? 'grabbing' : 'grab' },
    onPointerDown: (e) => start(index, e),
    onPointerMove: (e) => {
      if (!dragRef.current) return;
      lastClientY.current = e.clientY;
      moveTo(e.clientY);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: (e) => {
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault();
        onMove(index, index - 1);
      } else if (e.key === 'ArrowDown' && index < items.length - 1) {
        e.preventDefault();
        onMove(index, index + 1);
      }
    },
  });

  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.height;
    if (drag.from > drag.to && i < drag.from && i >= drag.to) return drag.height;
    return 0;
  };

  return (
    <ol ref={listRef} aria-label={label} className={`${className} select-none`}>
      {items.map((item, i) => {
        const dragging = drag?.from === i;
        return (
          <li
            key={keyOf(item)}
            style={{
              transform: `translateY(${dragging ? drag!.dy : shift(i)}px)`,
              transition: dragging || !drag ? 'none' : 'transform 150ms ease',
              position: 'relative',
              zIndex: dragging ? 10 : undefined,
            }}
            className={dragging ? 'rounded-xl shadow-lg ring-2 shadow-black/50 ring-emerald-400' : ''}
          >
            {render(item, i, handleFor(i), dragging)}
          </li>
        );
      })}
    </ol>
  );
}
