import { Model, MState } from '../logic/model';

export const R = 26;

export interface EdgeGeom { from: string; to: string; d: string; mid: { x: number; y: number }; self: boolean }

export function edgeGeometry(model: Model): EdgeGeom[] {
  const byId = new Map(model.states.map((s) => [s.id, s]));
  const pairs = new Set(model.edges.map((e) => `${e.from}>${e.to}`));
  return model.edges.flatMap((e): EdgeGeom[] => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return [];
    if (e.from === e.to) return [selfLoop(a, e.from)];
    const bend = pairs.has(`${e.to}>${e.from}`) ? 30 : 0;
    return [quad(a, b, bend)];
  });
}

function selfLoop(a: MState, id: string): EdgeGeom {
  const d = `M ${a.x - 13},${a.y - R + 4} C ${a.x - 54},${a.y - 84} ${a.x + 54},${a.y - 84} ${a.x + 13},${a.y - R + 4}`;
  return { from: id, to: id, d, mid: { x: a.x, y: a.y - 66 }, self: true };
}

function quad(a: MState, b: MState, bend: number): EdgeGeom {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * bend;
  const cy = my + py * bend;

  const sv = norm(cx - a.x, cy - a.y);
  const ev = norm(cx - b.x, cy - b.y);
  const sx = a.x + sv.x * R;
  const sy = a.y + sv.y * R;
  const ex = b.x + ev.x * (R + 8);
  const ey = b.y + ev.y * (R + 8);

  return {
    from: a.id, to: b.id, self: false,
    d: `M ${sx},${sy} Q ${cx},${cy} ${ex},${ey}`,
    mid: { x: (sx + 2 * cx + ex) / 4, y: (sy + 2 * cy + ey) / 4 },
  };
}

function norm(x: number, y: number) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number, vbW: number, vbH: number) {
  const r = svg.getBoundingClientRect();
  return { x: ((clientX - r.left) / r.width) * vbW, y: ((clientY - r.top) / r.height) * vbH };
}
