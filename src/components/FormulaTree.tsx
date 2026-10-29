import { Formula, Path, keyOf, nodeTex, binderMap } from '../logic/formula';
import { katexHtml } from './Katex';
import { useZoom, ZoomControls } from './Zoom';

interface LNode { path: Path; key: string; node: Formula; tex: string; x: number; y: number; w: number; h: number }

const H = 40;
const GAP_X = 26;
const GAP_Y = 76;
const PAD = 22;

// KaTeX の実測幅は分からないので、TeX のソース長から控えめに広めの見積もりを作る。
// 見積もりが外れても foreignObject 自体を少し広めに取り、中身は中央寄せのため
// 多少あふれても左右対称にはみ出すだけで大きく崩れない。
const widthOf = (tex: string): number => {
  if (!tex) return 30; // 穴
  const n = tex.replace(/\\[a-zA-Z]+/g, 'M').length; // コマンド1つを概ね1文字分とみなす
  return Math.max(40, n * 15 + 24);
};

function layout(root: Formula) {
  const nodes: LNode[] = [];
  const edges: { from: string; to: string }[] = [];
  let cursor = PAD;

  const rec = (n: Formula, p: Path, depth: number): LNode => {
    const key = keyOf(p);
    const tex = nodeTex(n);
    const w = widthOf(tex);
    let x: number;
    if (n.children.length === 0) {
      x = cursor + w / 2;
      cursor += w + GAP_X;
    } else {
      const kids = n.children.map((c, i) => rec(c, [...p, i], depth + 1));
      x = (kids[0].x + kids[kids.length - 1].x) / 2;
      for (const k of kids) edges.push({ from: key, to: k.key });
    }
    const ln: LNode = { path: p, key, node: n, tex, x, y: PAD + depth * GAP_Y, w, h: H };
    nodes.push(ln);
    return ln;
  };

  rec(root, [], 0);
  const width = Math.max(...nodes.map((n) => n.x + n.w / 2)) + PAD;
  const height = Math.max(...nodes.map((n) => n.y + n.h)) + PAD;
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return { nodes, edges, width, height, byKey };
}

export interface FormulaTreeProps {
  root: Formula;
  selectedKey?: string | null;
  currentKey?: string | null;
  highlightKeys?: string[];
  onSelect?: (p: Path) => void;
  showJumps?: boolean;
}

export function FormulaTree({
  root, selectedKey, currentKey, highlightKeys = [], onSelect, showJumps = true,
}: FormulaTreeProps) {
  const { nodes, edges, width, height, byKey } = layout(root);
  const bmap = binderMap(root);
  const hi = new Set(highlightKeys);
  const zoom = useZoom();

  const jumps = showJumps
    ? nodes
        .filter((n) => n.node.kind === 'var')
        .map((n) => {
          const b = bmap.get(n.node.v ?? '');
          if (!b) return null;
          const t = byKey.get(keyOf(b.path));
          return t ? { from: n, to: t } : null;
        })
        .filter((x): x is { from: LNode; to: LNode } => x !== null)
    : [];

  return (
    <div className="zoombox">
      <div
        className="zoombox-scroll tree-wrap"
        onWheel={zoom.onWheel}
        onTouchStart={zoom.onTouchStart}
        onTouchMove={zoom.onTouchMove}
        onTouchEnd={zoom.onTouchEnd}
      >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="tree-svg"
        style={{ width: width * zoom.scale, height: height * zoom.scale }}
      >
        <defs>
          <marker id="tri" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--jump)" />
          </marker>
        </defs>

        {edges.map((e, i) => {
          const a = byKey.get(e.from)!;
          const b = byKey.get(e.to)!;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y + a.h} x2={b.x} y2={b.y}
              className={hi.has(b.key) ? 'tree-edge hot' : 'tree-edge'}
            />
          );
        })}

        {jumps.map((j, i) => {
          const x1 = j.from.x;
          const y1 = j.from.y + j.from.h / 2;
          const x2 = j.to.x;
          const y2 = j.to.y + j.to.h / 2;
          const bend = Math.max(60, Math.abs(y1 - y2) * 0.5);
          const side = x1 >= x2 ? 1 : -1;
          const cx = (x1 + x2) / 2 + side * bend;
          return (
            <path
              key={`j${i}`}
              d={`M ${x1} ${y1} Q ${cx} ${(y1 + y2) / 2} ${x2} ${y2}`}
              className="tree-jump" markerEnd="url(#tri)"
            />
          );
        })}

        {nodes.map((n) => {
          const cls = [
            'tree-node',
            `k-${n.node.kind}`,
            n.key === selectedKey ? 'selected' : '',
            n.key === currentKey ? 'current' : '',
            hi.has(n.key) ? 'hot' : '',
            onSelect ? 'clickable' : '',
          ].join(' ');
          const fw = n.w + 16;
          return (
            <g key={n.key} className={cls} onClick={onSelect ? () => onSelect(n.path) : undefined}>
              <rect x={n.x - n.w / 2} y={n.y} width={n.w} height={n.h} rx={10} />
              {n.node.kind === 'hole' ? (
                <text x={n.x} y={n.y + n.h / 2 + 1} textAnchor="middle" dominantBaseline="middle" className="hole-mark">
                  ▢
                </text>
              ) : (
                <foreignObject x={n.x - fw / 2} y={n.y} width={fw} height={n.h}>
                  <div
                    className="tree-math"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: katexHtml(n.tex) }}
                  />
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
      </div>
      <ZoomControls scale={zoom.scale} zoomIn={zoom.zoomIn} zoomOut={zoom.zoomOut} reset={zoom.reset} />
    </div>
  );
}
