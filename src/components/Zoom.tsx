import { useRef, useState, WheelEvent } from 'react';

const MIN = 0.5;
const MAX = 3;
const STEP_WHEEL = 0.12;
const STEP_BTN = 0.25;

const clamp = (s: number): number => Math.round(Math.min(MAX, Math.max(MIN, s)) * 100) / 100;

export function useZoom() {
  const [scale, setScale] = useState(1);
  const touching = useRef(false);

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    setScale((s) => clamp(s + (e.deltaY > 0 ? -STEP_WHEEL : STEP_WHEEL)));
  };

  // 2本指ピンチ（ブラウザは pinch を wheel+ctrlKey として伝える場合が多いが、
  // タッチデバイスでの素朴なピンチにも簡易対応する）。
  const pinchDist = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      touching.current = true;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchDist.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touching.current || e.touches.length !== 2) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinchDist.current > 0) setScale((s) => clamp(s * (d / pinchDist.current)));
    pinchDist.current = d;
  };
  const onTouchEnd = () => { touching.current = false; };

  const zoomIn = () => setScale((s) => clamp(s + STEP_BTN));
  const zoomOut = () => setScale((s) => clamp(s - STEP_BTN));
  const reset = () => setScale(1);

  return { scale, onWheel, onTouchStart, onTouchMove, onTouchEnd, zoomIn, zoomOut, reset };
}

export function ZoomControls({ scale, zoomIn, zoomOut, reset }: {
  scale: number; zoomIn: () => void; zoomOut: () => void; reset: () => void;
}) {
  return (
    <div className="zoom-controls">
      <button type="button" className="mini" onClick={zoomOut} disabled={scale <= MIN} title="縮小">−</button>
      <span className="zoom-pct">{Math.round(scale * 100)}%</span>
      <button type="button" className="mini" onClick={zoomIn} disabled={scale >= MAX} title="拡大">＋</button>
      {scale !== 1 && <button type="button" className="mini" onClick={reset} title="100%に戻す">リセット</button>}
    </div>
  );
}
