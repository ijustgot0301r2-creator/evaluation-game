// 評価ゲーム（evaluation game / model checking game）。
// 位置 = (状態, 論理式の木のノード)。肯定者 = Verifier(0), 否定者 = Falsifier(1)。

import {
  Formula, Path, Binder, binderMap, priorities, getAt, keyOf, walk, nodeTex, formulaToTex,
} from './formula';
import { Model, successors, stateLabel } from './model';
import { Arena, Solution, makeArena, solveParity, Player } from './parity';

export const WIN_V = '#WIN_V'; // 肯定者勝ちのシンク
export const WIN_F = '#WIN_F'; // 否定者勝ちのシンク

export interface Position { state: string; path: Path }
export const posKey = (p: Position): string => `${p.state}@${keyOf(p.path)}`;

export type Side = 'V' | 'F';
export const sideOf = (pl: Player): Side => (pl === 0 ? 'V' : 'F');
export const playerOf = (s: Side): Player => (s === 'V' ? 0 : 1);
export const sideName = (s: Side): string => (s === 'V' ? '肯定者' : '否定者');

export interface Ctx {
  root: Formula;
  model: Model;
  bmap: Map<string, Binder>;
  prio: Map<string, number>;
  paths: Path[];
}

export function makeCtx(root: Formula, model: Model): Ctx {
  const paths: Path[] = [];
  walk(root, (_n, p) => paths.push(p));
  return { root, model, bmap: binderMap(root), prio: priorities(root), paths };
}

export type MoveKind = 'child' | 'trans' | 'auto' | 'jump';

export interface MoveOption {
  to: Position;
  kind: MoveKind;
  label: string;         // ボタン表示（日本語の短い説明）
  detail: string;        // 履歴表示用の説明
  previewTex?: string;   // child のときの遷移先の部分式（KaTeX 表示用）
  v?: string;            // jump のときの変数名
  toState?: string;      // trans のときの遷移先
}

export type Turn = Side | 'auto' | 'end';

export interface PosInfo {
  node: Formula;
  turn: Turn;
  winner?: Side;
  reason?: string;
  moves: MoveOption[];
}

export function analyze(ctx: Ctx, pos: Position): PosInfo {
  const node = getAt(ctx.root, pos.path);
  if (!node) return { node: { kind: 'hole', children: [] }, turn: 'end', reason: '不正な位置', moves: [] };

  const down = (i: number): Position => ({ state: pos.state, path: [...pos.path, i] });
  const st = ctx.model.states.find((s) => s.id === pos.state);

  switch (node.kind) {
    case 'true':
      return { node, turn: 'end', winner: 'V', reason: '⊤ に到達した。', moves: [] };
    case 'false':
      return { node, turn: 'end', winner: 'F', reason: '⊥ に到達した。', moves: [] };
    case 'lit': {
      const holds = !!st?.props.includes(node.prop ?? '');
      const truth = node.neg ? !holds : holds;
      const lit = (node.neg ? '¬' : '') + node.prop;
      return {
        node, turn: 'end', winner: truth ? 'V' : 'F',
        reason: `リテラル ${lit} は状態 ${stateLabel(ctx.model, pos.state)} で${truth ? '真' : '偽'}。`,
        moves: [],
      };
    }
    case 'and':
    case 'or': {
      const side: Side = node.kind === 'and' ? 'F' : 'V';
      return {
        node, turn: side,
        moves: [0, 1].map((i) => ({
          to: down(i), kind: 'child' as const,
          label: i === 0 ? '左の部分式' : '右の部分式',
          detail: `${node.kind === 'and' ? '∧' : '∨'} の${i === 0 ? '左' : '右'}へ`,
          previewTex: formulaToTex(node.children[i]),
        })),
      };
    }
    case 'box':
    case 'dia': {
      const side: Side = node.kind === 'box' ? 'F' : 'V';
      const succ = successors(ctx.model, pos.state);
      if (succ.length === 0) {
        const winner: Side = node.kind === 'box' ? 'V' : 'F';
        return {
          node, turn: 'end', winner,
          reason: `状態 ${stateLabel(ctx.model, pos.state)} から遷移できないので、${node.kind === 'box' ? '否定者' : '肯定者'}が動けない。`,
          moves: [],
        };
      }
      return {
        node, turn: side,
        moves: succ.map((t) => ({
          to: { state: t, path: [...pos.path, 0] },
          kind: 'trans' as const,
          label: stateLabel(ctx.model, t),
          detail: `${node.kind === 'box' ? '□' : '◇'} で ${stateLabel(ctx.model, pos.state)} → ${stateLabel(ctx.model, t)}`,
          toState: t,
        })),
      };
    }
    case 'mu':
    case 'nu':
      return {
        node, turn: 'auto',
        moves: [{ to: down(0), kind: 'auto', label: '展開', detail: '本体へ（自動）', previewTex: nodeTex(node) }],
      };
    case 'var': {
      const b = ctx.bmap.get(node.v ?? '');
      if (!b) return { node, turn: 'end', reason: `変数 ${node.v} の束縛子が見つからない`, moves: [] };
      return {
        node, turn: 'auto',
        moves: [{
          to: { state: pos.state, path: [...b.path, 0] },
          kind: 'jump', v: node.v,
          label: '巻き戻し',
          detail: `変数 ${node.v} から ${b.kind === 'mu' ? 'μ' : 'ν'}${node.v} の本体へジャンプ（自動）`,
        }],
      };
    }
    case 'hole':
      return { node, turn: 'end', reason: '未入力の穴に到達した。', moves: [] };
  }
}

// ---------------------------------------------------------------- アリーナ

export function buildArena(ctx: Ctx): Arena {
  const entries: { id: string; owner: Player; prio: number; succ: string[] }[] = [];
  entries.push({ id: WIN_V, owner: 0, prio: 0, succ: [WIN_V] }); // 偶数の自己ループ → 肯定者勝ち
  entries.push({ id: WIN_F, owner: 1, prio: 1, succ: [WIN_F] }); // 奇数の自己ループ → 否定者勝ち

  for (const s of ctx.model.states) {
    for (const path of ctx.paths) {
      const pos: Position = { state: s.id, path };
      const info = analyze(ctx, pos);
      const node = info.node;
      const id = posKey(pos);
      const prio = node.kind === 'var' ? (ctx.prio.get(node.v ?? '') ?? 0) : 0;

      if (info.turn === 'end') {
        entries.push({ id, owner: 0, prio, succ: [info.winner === 'F' ? WIN_F : WIN_V] });
      } else {
        const owner: Player = info.turn === 'F' ? 1 : 0;
        entries.push({ id, owner, prio, succ: info.moves.map((m) => posKey(m.to)) });
      }
    }
  }
  return makeArena(entries);
}

export interface Solved { arena: Arena; solution: Solution }

export function solveGame(ctx: Ctx): Solved {
  const arena = buildArena(ctx);
  return { arena, solution: solveParity(arena) };
}

export function winnerAt(sol: Solution, pos: Position): Side {
  return sol.w0.has(posKey(pos)) ? 'V' : 'F';
}

/**
 * コンピュータの着手。勝ち領域にいれば Zielonka の記憶なし勝利戦略に従う。
 * 負けている場合は「即負けを避ける／未訪問の位置を選ぶ」という粘りのヒューリスティック。
 */
export function chooseMove(
  ctx: Ctx, sol: Solution, me: Side, pos: Position, moves: MoveOption[], visited: Set<string>,
): MoveOption {
  const myWin = me === 'V' ? sol.w0 : sol.w1;
  const myStrat = me === 'V' ? sol.s0 : sol.s1;
  if (myWin.has(posKey(pos))) {
    const target = myStrat.get(posKey(pos));
    const m = moves.find((x) => posKey(x.to) === target);
    if (m) return m;
  }
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const k = posKey(m.to);
    let score = 0;
    if (myWin.has(k)) score += 1000;
    if (!visited.has(k)) score += 10;
    const inf = analyze(ctx, m.to);
    if (inf.turn === 'end') score += inf.winner === me ? 500 : -500;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}
