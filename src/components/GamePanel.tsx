import { useCallback, useEffect, useMemo, useState } from 'react';
import { Formula, keyOf, nodeTex, subformulaTex, getAt } from '../logic/formula';
import { Model, stateLabel } from '../logic/model';
import {
  Ctx, MoveOption, Position, Side, analyze, chooseMove, makeCtx, posKey, sideName, solveGame,
} from '../logic/game';
import { FormulaTree } from './FormulaTree';
import { ModelView } from './ModelView';
import { K } from './Katex';

interface Step { pos: Position; via: MoveOption | null }

type Result =
  | { kind: 'terminal'; winner: Side; reason: string }
  | { kind: 'loop'; winner: Side; loopStart: number; vars: string[]; decisive: string; binder: 'mu' | 'nu' };

interface Props { root: Formula; model: Model }

const AUTO_DELAY = 320;
const CPU_DELAY = 620;

export function GamePanel({ root, model }: Props) {
  const ctx: Ctx = useMemo(() => makeCtx(root, model), [root, model]);
  const solved = useMemo(() => solveGame(ctx), [ctx]);

  const [userSide, setUserSide] = useState<Side>('V');
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState<Step[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [autoRun, setAutoRun] = useState(true);

  const initial = model.initial;
  const truthWinner: Side | null = initial
    ? (solved.solution.w0.has(posKey({ state: initial, path: [] })) ? 'V' : 'F')
    : null;

  const current = history.length ? history[history.length - 1] : null;
  const info = current ? analyze(ctx, current.pos) : null;

  const start = (side: Side) => {
    if (!initial) return;
    setUserSide(side);
    setStarted(true);
    setResult(null);
    setHistory([{ pos: { state: initial, path: [] }, via: null }]);
  };

  const reset = () => { setStarted(false); setHistory([]); setResult(null); };

  const apply = useCallback((move: MoveOption) => {
    const key = posKey(move.to);
    const idx = history.findIndex((s) => posKey(s.pos) === key);
    const next = [...history, { pos: move.to, via: move }];
    setHistory(next);
    if (idx < 0) return;

    // ループ確定: 区間 [idx, next.length-1] を無限回繰り返すとみなす。
    const vars = next
      .slice(idx + 1)
      .map((s) => s.via)
      .filter((m): m is MoveOption => !!m && m.kind === 'jump' && !!m.v)
      .map((m) => m.v!);
    const uniq = Array.from(new Set(vars));
    if (uniq.length === 0) return; // 変数を通らない閉路は存在しないはずだが念のため

    let decisive = uniq[0];
    for (const v of uniq) {
      if ((ctx.prio.get(v) ?? 0) > (ctx.prio.get(decisive) ?? 0)) decisive = v;
    }
    const binder = ctx.bmap.get(decisive)!.kind;
    setResult({
      kind: 'loop',
      winner: binder === 'nu' ? 'V' : 'F',
      loopStart: idx, vars: uniq, decisive, binder,
    });
  }, [ctx, history]);

  // 自動手（μ/ν の展開と変数の巻き戻し）とコンピュータの手を進める。
  useEffect(() => {
    if (!started || result || !current || !info) return;
    if (info.turn === 'end') {
      setResult({ kind: 'terminal', winner: info.winner ?? 'F', reason: info.reason ?? '' });
      return;
    }
    if (info.turn === 'auto') {
      const t = setTimeout(() => apply(info.moves[0]), AUTO_DELAY);
      return () => clearTimeout(t);
    }
    if (info.turn !== userSide) {
      if (!autoRun) return;
      const visited = new Set(history.map((s) => posKey(s.pos)));
      const cpu: Side = userSide === 'V' ? 'F' : 'V';
      const mv = chooseMove(ctx, solved.solution, cpu, current.pos, info.moves, visited);
      const t = setTimeout(() => apply(mv), CPU_DELAY);
      return () => clearTimeout(t);
    }
    return;
  }, [started, result, current, info, userSide, autoRun, history, ctx, solved, apply]);

  const stepCpuOnce = () => {
    if (!current || !info || result || info.turn === 'end' || info.turn === 'auto') return;
    const visited = new Set(history.map((s) => posKey(s.pos)));
    const cpu: Side = userSide === 'V' ? 'F' : 'V';
    apply(chooseMove(ctx, solved.solution, cpu, current.pos, info.moves, visited));
  };

  const undo = () => {
    setResult(null);
    setHistory((h) => {
      // 自動手はまとめて巻き戻す（ユーザーの選択地点まで戻す）。
      let i = h.length - 1;
      while (i > 0) {
        const cut = h.slice(0, i);
        const last = cut[cut.length - 1];
        const inf = analyze(ctx, last.pos);
        if (inf.turn === userSide) return cut;
        i--;
      }
      return h.slice(0, 1);
    });
  };

  const myTurn = !!info && info.turn === userSide && !result;
  const candStates = myTurn ? info!.moves.filter((m) => m.kind === 'trans').map((m) => m.toState!) : [];
  const candKeys = myTurn ? info!.moves.filter((m) => m.kind === 'child').map((m) => keyOf(m.to.path)) : [];

  const varTable = Array.from(ctx.bmap.values())
    .slice()
    .sort((a, b) => (ctx.prio.get(b.v) ?? 0) - (ctx.prio.get(a.v) ?? 0));

  if (!initial) {
    return <p className="hint">初期状態が設定されていません。上のモデルのセクションで状態を作り、初期状態を選んでください。</p>;
  }

  return (
    <div className="play-grid">
      <div className="scorecard">
        <h3>評価ゲーム</h3>

        <div className="verdict">
          <span className={truthWinner === 'V' ? 'badge v' : 'badge f'}>
            初期位置では{sideName(truthWinner ?? 'F')}に必勝戦略あり
          </span>
          <span className="truth">
            ⇒ この式は {stateLabel(model, initial)} で <b>{truthWinner === 'V' ? '真' : '偽'}</b>
          </span>
        </div>

        {!started ? (
          <div className="rolebox">
            <p className="hint">どちらを担当しますか？</p>
            <div className="rolebtns">
              <button className="big v" onClick={() => start('V')}>肯定者で始める</button>
              <button className="big f" onClick={() => start('F')}>否定者で始める</button>
            </div>
          </div>
        ) : (
          <>
            <div className="statusbar">
              <span className={userSide === 'V' ? 'badge v' : 'badge f'}>あなた: {sideName(userSide)}</span>
              <span className="status-state">状態: <b>{stateLabel(model, current!.pos.state)}</b></span>
              <span className="status-node">
                式: <K tex={subformulaTex(root, current!.pos.path)} />
              </span>
              <label className="auto">
                <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
                相手を自動で動かす
              </label>
              <button className="mini" onClick={undo} disabled={history.length <= 1}>1手戻す</button>
              <button className="mini warn" onClick={reset}>やり直す</button>
            </div>

            {result ? (
              <ResultBox result={result} ctx={ctx} />
            ) : info && info.turn === 'auto' ? (
              <div className="turnbox auto">自動手: {info.moves[0].detail}</div>
            ) : myTurn ? (
              <div className="turnbox mine">
                <div className="turnhead">
                  あなた（{sideName(userSide)}）の手番 —{' '}
                  {info!.node.kind === 'and' && '∧ なので一方の部分式を選びます'}
                  {info!.node.kind === 'or' && '∨ なので一方の部分式を選びます'}
                  {info!.node.kind === 'box' && '□ なので遷移先を選びます'}
                  {info!.node.kind === 'dia' && '◇ なので遷移先を選びます'}
                </div>
                <div className="movebtns">
                  {info!.moves.map((m, i) => (
                    <button key={i} className="movebtn" onClick={() => apply(m)}>
                      <span className="mv-label">{m.label}</span>
                      {m.previewTex && <K tex={m.previewTex} className="mv-preview" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="turnbox theirs">
                相手（{sideName(userSide === 'V' ? 'F' : 'V')}）の手番
                {!autoRun && <button className="mini" onClick={stepCpuOnce}>相手を1手進める</button>}
              </div>
            )}
          </>
        )}

        <h3 className="subhead">優先度（外側の束縛ほど高い）</h3>
        <table className="val-table small">
          <thead><tr><th>変数</th><th>束縛子</th><th>優先度</th><th>ループで最高なら</th></tr></thead>
          <tbody>
            {varTable.map((b) => (
              <tr key={b.v}>
                <td><K tex={b.v} /></td>
                <td><K tex={b.kind === 'mu' ? '\\mu' : '\\nu'} /></td>
                <td>{ctx.prio.get(b.v)}</td>
                <td className={b.kind === 'nu' ? 'win-v' : 'win-f'}>{b.kind === 'nu' ? '肯定者の勝ち' : '否定者の勝ち'}</td>
              </tr>
            ))}
            {varTable.length === 0 && <tr><td colSpan={4} className="muted">不動点変数はありません。</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="board-wrap">
        <h3>盤面</h3>
        <div className="board-surface">
          <div>
            <h4>状態駒</h4>
            <ModelView
              model={model}
              current={current?.pos.state ?? null}
              candidates={candStates}
              onPick={(id) => {
                const m = info?.moves.find((x) => x.kind === 'trans' && x.toState === id);
                if (m && myTurn) apply(m);
              }}
            />
          </div>
          <div>
            <h4>論理式駒</h4>
            <FormulaTree
              root={root}
              currentKey={current ? keyOf(current.pos.path) : null}
              highlightKeys={candKeys}
              onSelect={(p) => {
                const m = info?.moves.find((x) => x.kind === 'child' && keyOf(x.to.path) === keyOf(p));
                if (m && myTurn) apply(m);
              }}
            />
          </div>
        </div>
      </div>

      <div className="history-wrap">
        <h3>棋譜</h3>
        <ol className="history notepad-strip">
          {history.map((s, i) => {
            const inLoop = result?.kind === 'loop' && i >= result.loopStart;
            const isJump = s.via?.kind === 'jump';
            const node = getAt(root, s.pos.path);
            return (
              <li
                key={i}
                className={[
                  inLoop ? 'loop' : '',
                  result?.kind === 'loop' && i === result.loopStart ? 'loop-start' : '',
                  i === history.length - 1 ? 'last' : '',
                ].join(' ')}
              >
                <span className="h-idx">{i}</span>
                <span className="h-state">{stateLabel(model, s.pos.state)}</span>
                <span className="h-node"><K tex={node ? nodeTex(node) : '?'} /></span>
                <span className="h-sub"><K tex={subformulaTex(root, s.pos.path)} /></span>
                {s.via && (
                  <span className={isJump ? 'h-via jump' : 'h-via'}>
                    ← {s.via.detail}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {result?.kind === 'loop' && (
          <p className="hint">
            網掛けの区間（{result.loopStart} 手目 〜 {history.length - 1} 手目）が、同じ位置
            （状態 <b>{stateLabel(model, history[result.loopStart].pos.state)}</b>・式{' '}
            <K tex={subformulaTex(root, history[result.loopStart].pos.path)} />）
            に戻ってできたループです。
          </p>
        )}
      </div>
    </div>
  );
}

function ResultBox({ result, ctx }: { result: Result; ctx: Ctx }) {
  if (result.kind === 'terminal') {
    return (
      <div className={`resultbox ${result.winner === 'V' ? 'v' : 'f'}`}>
        <div className="r-title">{sideName(result.winner)}の勝ち</div>
        <div className="r-reason">{result.reason}</div>
      </div>
    );
  }
  return (
    <div className={`resultbox ${result.winner === 'V' ? 'v' : 'f'}`}>
      <div className="r-title">{sideName(result.winner)}の勝ち（無限プレイ）</div>
      <div className="r-reason">
        位置が 2 度目に現れたのでループ確定。この区間を無限に繰り返すとみなします。
      </div>
      <dl className="r-detail">
        <dt>区間内でジャンプした変数</dt>
        <dd>
          {result.vars.map((v) => (
            <span key={v} className={v === result.decisive ? 'chip pick' : 'chip'}>
              <K tex={`${ctx.bmap.get(v)?.kind === 'mu' ? '\\mu' : '\\nu'}\\,${v}`} />
              <span className="prio-note">（優先度 {ctx.prio.get(v)}）</span>
            </span>
          ))}
        </dd>
        <dt>決め手</dt>
        <dd>
          <K tex={result.decisive} /> — 最も外側で束縛され優先度が最高。
          束縛子は <K tex={`${result.binder === 'mu' ? '\\mu' : '\\nu'}\\,${result.decisive}`} /> なので
          {result.binder === 'mu' ? '否定者' : '肯定者'}の勝ち。
        </dd>
      </dl>
    </div>
  );
}
