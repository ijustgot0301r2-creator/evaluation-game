import { useLayoutEffect, useRef, useState } from 'react';

// 「枠は固定、内側の内容だけ拡大縮小・パン」するビューア。
// 100% = 枠にぴたりと収まる大きさ（object-fit: contain と同じ考え方）。
// これより縮小する意味はないので、ユーザー操作によるズームは 1 倍を下限にする。

const MAX_SCALE = 4;
const WHEEL_SENS = 0.0018;
const BTN_FACTOR = 1.3;
const DRAG_THRESHOLD = 4;
const CLICK_SUPPRESS_MS = 150;

interface Size { w: number; h: number }

export interface ZoomPaneProps {
  /** コンテンツ本来の大きさ（SVG の viewBox と同じ単位）。 */
  naturalWidth: number;
  naturalHeight: number;
  className?: string;
  children: React.ReactNode;
}

export function ZoomPane({ naturalWidth, naturalHeight, className, children }: ZoomPaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Size>({ w: naturalWidth, h: naturalHeight });
  const [userScale, setUserScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<number | null>(null);
  const suppressClickUntil = useRef(0);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setContainer({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseFit = Math.min(container.w / naturalWidth, container.h / naturalHeight) || 1;
  const scale = baseFit * userScale;

  const clampPan = (p: { x: number; y: number }, s: number) => {
    const maxX = Math.max(0, (naturalWidth * s - container.w) / 2);
    const maxY = Math.max(0, (naturalHeight * s - container.h) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  };

  const applyScale = (next: number) => {
    const ns = Math.min(MAX_SCALE, Math.max(1, next));
    setUserScale(ns);
    setPan((p) => clampPan(p, baseFit * ns));
  };

  // ホイールとタッチのピンチは React の合成イベントだと passive 扱いになり
  // preventDefault が効かず、ページ本体のスクロールも一緒に走ってしまう。
  // そのためネイティブの addEventListener で passive:false にして登録する。
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyScale(userScale * Math.exp(-e.deltaY * WHEEL_SENS));
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        pinchRef.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      applyScale(userScale * (d / pinchRef.current));
      pinchRef.current = d;
    };
    const onTouchEnd = () => { pinchRef.current = null; };
    const onClickCapture = (e: MouseEvent) => {
      if (Date.now() < suppressClickUntil.current) { e.stopPropagation(); e.preventDefault(); }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('click', onClickCapture, { capture: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('click', onClickCapture, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userScale, baseFit, container.w, container.h, naturalWidth, naturalHeight]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
    if (d.moved) setPan(clampPan({ x: d.panX + dx, y: d.panY + dy }, scale));
  };
  const endDrag = () => {
    if (dragRef.current?.moved) suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
    dragRef.current = null;
  };

  const zoomIn = () => applyScale(userScale * BTN_FACTOR);
  const zoomOut = () => applyScale(userScale / BTN_FACTOR);
  const reset = () => { setUserScale(1); setPan({ x: 0, y: 0 }); };

  return (
    <div className="zoombox">
      <div
        ref={viewportRef}
        className={className ? `zoom-viewport ${className}` : 'zoom-viewport'}
        style={{ aspectRatio: `${naturalWidth} / ${naturalHeight}`, maxWidth: naturalWidth }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          className="zoom-content"
          style={{
            width: naturalWidth,
            height: naturalHeight,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
      <div className="zoom-controls">
        <button type="button" className="mini" onClick={zoomOut} disabled={userScale <= 1} title="縮小">−</button>
        <span className="zoom-pct">{Math.round(userScale * 100)}%</span>
        <button type="button" className="mini" onClick={zoomIn} disabled={userScale >= MAX_SCALE} title="拡大">＋</button>
        {userScale !== 1 && <button type="button" className="mini" onClick={reset} title="100%に戻す">リセット</button>}
      </div>
    </div>
  );
}
