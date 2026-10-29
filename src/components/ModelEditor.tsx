import { useRef, useState } from 'react';
import { Model, MState } from '../logic/model';
import { R, edgeGeometry, svgPoint } from './modelGeom';
import { K, katexHtml } from './Katex';

const VB_W = 680;
const VB_H = 420;
const DRAG_THRESHOLD = 5; // viewBox 単位。これを超えて動いたら「クリック」ではなく「ドラッグ」とみなす。

interface Props { model: Model; setModel: (m: Model) => void }

export function ModelEditor({ model, setModel }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [newProp, setNewProp] = useState('');

  // ドラッグ検出用。再レンダーを急ぐ必要がないので ref に持つ。
  const dragRef = useRef<{ id: string; sx: number; sy: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(0);

  const geoms = edgeGeometry(model);

  const freshId = () => {
    let i = 0;
    while (model.states.some((s) => s.id === `s${i}`)) i++;
    return `s${i}`;
  };

  const addState = (x: number, y: number) => {
    const id = freshId();
    const st: MState = { id, label: id, x, y, props: [] };
    setModel({ ...model, states: [...model.states, st], initial: model.initial ?? id });
  };

  const removeState = (id: string) => {
    const states = model.states.filter((s) => s.id !== id);
    setModel({
      ...model,
      states,
      edges: model.edges.filter((e) => e.from !== id && e.to !== id),
      initial: model.initial === id ? (states[0]?.id ?? null) : model.initial,
    });
  };

  const toggleEdge = (from: string, to: string) => {
    const exists = model.edges.some((e) => e.from === from && e.to === to);
    setModel({
      ...model,
      edges: exists
        ? model.edges.filter((e) => !(e.from === from && e.to === to))
        : [...model.edges, { from, to }],
    });
  };

  const setProp = (stateId: string, prop: string, on: boolean) => {
    setModel({
      ...model,
      states: model.states.map((s) =>
        s.id !== stateId
          ? s
          : { ...s, props: on ? Array.from(new Set([...s.props, prop])) : s.props.filter((p) => p !== prop) }),
    });
  };

  const rename = (id: string, label: string) => {
    setModel({ ...model, states: model.states.map((s) => (s.id === id ? { ...s, label } : s)) });
  };

  const addProp = () => {
    const name = newProp.trim();
    if (!name || model.props.includes(name)) return;
    setModel({ ...model, props: [...model.props, name] });
    setNewProp('');
  };

  const removeProp = (p: string) => {
    setModel({
      ...model,
      props: model.props.filter((x) => x !== p),
      states: model.states.map((s) => ({ ...s, props: s.props.filter((x) => x !== p) })),
    });
  };

  /** 状態をクリックしたときの意味づけ：1回目は選択、2回目で辺を結ぶ（同じ状態なら自己ループ）。 */
  const onNodeClick = (id: string) => {
    if (pending === null) { setPending(id); return; }
    toggleEdge(pending, id);
    setPending(null);
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (Date.now() - justDraggedRef.current < 200) return; // ドラッグの直後の余分なクリックは無視
    if (!svgRef.current || (e.target as Element).tagName !== 'rect') return; // 背景以外は無視
    const pt = svgPoint(svgRef.current, e.clientX, e.clientY, VB_W, VB_H);
    addState(Math.round(pt.x), Math.round(pt.y));
    setPending(null);
  };

  const onNodePointerDown = (id: string, e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const pt = svgPoint(svgRef.current, e.clientX, e.clientY, VB_W, VB_H);
    dragRef.current = { id, sx: pt.x, sy: pt.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !svgRef.current) return;
    const pt = svgPoint(svgRef.current, e.clientX, e.clientY, VB_W, VB_H);
    if (!d.moved && Math.hypot(pt.x - d.sx, pt.y - d.sy) > DRAG_THRESHOLD) d.moved = true;
    if (!d.moved) return;
    const x = Math.max(R + 2, Math.min(VB_W - R - 2, Math.round(pt.x)));
    const y = Math.max(R + 2, Math.min(VB_H - R - 2, Math.round(pt.y)));
    setModel({ ...model, states: model.states.map((s) => (s.id === d.id ? { ...s, x, y } : s)) });
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) justDraggedRef.current = Date.now();
    else onNodeClick(d.id);
  };

  const deletePending = () => {
    if (pending) removeState(pending);
    setPending(null);
  };

  const pendingState = model.states.find((s) => s.id === pending);
  const newPropTaken = newProp.trim() !== '' && model.props.includes(newProp.trim());

  return (
    <>
      <div className="editor-grid model-grid">
        <div className="canvas-col">
          <p className="hint">
            何もない場所をクリックで状態を追加。状態をドラッグで移動、クリックしてから別の状態をクリックすると辺を結べます
            （同じ状態をもう一度クリックすると自己ループ、選択中はごみ箱アイコンで削除）。辺をクリックすると削除します。
          </p>

          <svg
            ref={svgRef}
            className="model-svg"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            onClick={onCanvasClick}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#5b6478" />
              </marker>
            </defs>
            <rect x={0} y={0} width={VB_W} height={VB_H} className="model-bg" />

            {geoms.map((g, i) => (
              <path
                key={i}
                d={g.d}
                className="edge-hit"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setModel({ ...model, edges: model.edges.filter((e) => !(e.from === g.from && e.to === g.to)) });
                }}
              />
            ))}
            {geoms.map((g, i) => (
              <path key={`v${i}`} d={g.d} className="edge-line" markerEnd="url(#arrow)" />
            ))}

            {model.states.map((s) => (
              <g
                key={s.id}
                className={[
                  'model-state',
                  model.initial === s.id ? 'initial' : '',
                  pending === s.id ? 'picked' : '',
                  'draggable',
                ].join(' ')}
                onPointerDown={(e) => onNodePointerDown(s.id, e)}
              >
                {model.initial === s.id && (
                  <path d={`M ${s.x - R - 34},${s.y} L ${s.x - R - 6},${s.y}`} className="init-arrow" markerEnd="url(#arrow)" />
                )}
                <circle cx={s.x} cy={s.y} r={R} />
                <text x={s.x} y={s.y - 4} textAnchor="middle" className="st-label">{s.label}</text>
                {s.props.length === 0 ? (
                  <text x={s.x} y={s.y + 12} textAnchor="middle" className="st-props-empty">—</text>
                ) : (
                  <foreignObject x={s.x - R} y={s.y + 3} width={R * 2} height={16}>
                    <div
                      className="st-props-math"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: katexHtml(s.props.join(',\\,')) }}
                    />
                  </foreignObject>
                )}
              </g>
            ))}

            {pendingState && (
              <g
                className="trash-btn"
                transform={`translate(${pendingState.x + R * 0.78}, ${pendingState.y - R * 0.78})`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); deletePending(); }}
              >
                <circle r={11} />
                <path d="M -4,-4 L 4,4 M 4,-4 L -4,4" />
              </g>
            )}
          </svg>
        </div>

        <div className="side-col">
          <h3>命題変数</h3>
          <div className="proprow">
            <input
              value={newProp}
              placeholder="変数名を入力（例: p, q_1）"
              onChange={(e) => setNewProp(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addProp(); }}
            />
            {newProp.trim() !== '' && <span className="varpreview"><K tex={newProp.trim()} /></span>}
            <button onClick={addProp} disabled={newProp.trim() === '' || newPropTaken}>追加</button>
          </div>
          {newPropTaken && <div className="keynote warn-note">その変数名は既に使われています</div>}
          <div className="chips">
            {model.props.length === 0 && <span className="keynote">命題変数がありません。上の欄から追加してください。</span>}
            {model.props.map((p) => (
              <span key={p} className="chip">
                <K tex={p} /><button className="x" onClick={() => removeProp(p)} title="削除">×</button>
              </span>
            ))}
          </div>

          <h3>各状態での真偽値</h3>
          <div className="table-scroll">
            <table className="val-table">
              <thead>
                <tr>
                  <th>初期</th><th>状態</th>
                  {model.props.map((p) => <th key={p}><K tex={p} /></th>)}
                </tr>
              </thead>
              <tbody>
                {model.states.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="radio" name="initial" checked={model.initial === s.id}
                        onChange={() => setModel({ ...model, initial: s.id })}
                      />
                    </td>
                    <td><input className="namebox" value={s.label} onChange={(e) => rename(s.id, e.target.value)} /></td>
                    {model.props.map((p) => (
                      <td key={p}>
                        <input
                          type="checkbox" checked={s.props.includes(p)}
                          onChange={(e) => setProp(s.id, p, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {model.states.length === 0 && (
                  <tr><td colSpan={2 + model.props.length} className="muted">状態がありません。左のキャンバスで追加してください。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
