import { Model } from '../logic/model';
import { R, edgeGeometry } from './modelGeom';
import { katexHtml } from './Katex';
import { useZoom, ZoomControls } from './Zoom';

const VB_W = 680;
const VB_H = 380;

interface Props {
  model: Model;
  current?: string | null;
  candidates?: string[];
  onPick?: (id: string) => void;
}

export function ModelView({ model, current, candidates = [], onPick }: Props) {
  const geoms = edgeGeometry(model);
  const cand = new Set(candidates);
  const zoom = useZoom();

  return (
    <div className="zoombox">
      <div
        className="zoombox-scroll"
        onWheel={zoom.onWheel}
        onTouchStart={zoom.onTouchStart}
        onTouchMove={zoom.onTouchMove}
        onTouchEnd={zoom.onTouchEnd}
      >
        <svg
          className="model-svg view"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: VB_W * zoom.scale, height: VB_H * zoom.scale }}
        >
          <defs>
            <marker id="arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#5b6478" />
            </marker>
            <marker id="arrow2hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--hot)" />
            </marker>
          </defs>
          <rect x={0} y={0} width={VB_W} height={VB_H} className="model-bg" />

          {geoms.map((g, i) => {
            const hot = g.from === current && cand.has(g.to);
            return (
              <path
                key={i}
                d={g.d}
                className={hot ? 'edge-line hot' : 'edge-line'}
                markerEnd={hot ? 'url(#arrow2hot)' : 'url(#arrow2)'}
              />
            );
          })}

          {model.states.map((s) => (
            <g
              key={s.id}
              className={[
                'model-state',
                model.initial === s.id ? 'initial' : '',
                s.id === current ? 'current' : '',
                cand.has(s.id) ? 'cand' : '',
                cand.has(s.id) && onPick ? 'pointer' : '',
              ].join(' ')}
              onClick={() => { if (onPick && cand.has(s.id)) onPick(s.id); }}
            >
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
        </svg>
      </div>
      <ZoomControls scale={zoom.scale} zoomIn={zoom.zoomIn} zoomOut={zoom.zoomOut} reset={zoom.reset} />
    </div>
  );
}
