// 自己テスト: Zielonka で解いた評価ゲームの勝者が、
// 素朴な不動点計算による様相μ計算の意味論と一致するかを確かめる。
//   npm test

import { Formula, walk, validateFormula } from '../src/logic/formula';
import { Model, successors } from '../src/logic/model';
import { MoveOption, Position, Side, analyze, chooseMove, makeCtx, posKey, solveGame } from '../src/logic/game';

// ------------------------------------------------------------ 素朴な意味論

function denote(m: Model, f: Formula, env: Map<string, Set<string>>): Set<string> {
  const all = () => new Set(m.states.map((s) => s.id));
  switch (f.kind) {
    case 'true': return all();
    case 'false': return new Set();
    case 'lit': {
      const r = new Set<string>();
      for (const s of m.states) {
        const holds = s.props.includes(f.prop!);
        if (f.neg ? !holds : holds) r.add(s.id);
      }
      return r;
    }
    case 'var': return new Set(env.get(f.v!) ?? []);
    case 'and': {
      const a = denote(m, f.children[0], env);
      const b = denote(m, f.children[1], env);
      return new Set([...a].filter((x) => b.has(x)));
    }
    case 'or': {
      const a = denote(m, f.children[0], env);
      const b = denote(m, f.children[1], env);
      return new Set([...a, ...b]);
    }
    case 'box': {
      const a = denote(m, f.children[0], env);
      return new Set(m.states.filter((s) => successors(m, s.id).every((t) => a.has(t))).map((s) => s.id));
    }
    case 'dia': {
      const a = denote(m, f.children[0], env);
      return new Set(m.states.filter((s) => successors(m, s.id).some((t) => a.has(t))).map((s) => s.id));
    }
    case 'mu':
    case 'nu': {
      let cur = f.kind === 'mu' ? new Set<string>() : all();
      for (;;) {
        const next = denote(m, f.children[0], new Map(env).set(f.v!, cur));
        if (next.size === cur.size && [...next].every((x) => cur.has(x))) return cur;
        cur = next;
      }
    }
    case 'hole': throw new Error('hole in formula');
  }
}

// ------------------------------------------------------------ テスト材料

const lit = (prop: string, neg = false): Formula => ({ kind: 'lit', prop, neg, children: [] });
const v = (name: string): Formula => ({ kind: 'var', v: name, children: [] });
const and = (a: Formula, b: Formula): Formula => ({ kind: 'and', children: [a, b] });
const or = (a: Formula, b: Formula): Formula => ({ kind: 'or', children: [a, b] });
const box = (a: Formula): Formula => ({ kind: 'box', children: [a] });
const dia = (a: Formula): Formula => ({ kind: 'dia', children: [a] });
const mu = (x: string, a: Formula): Formula => ({ kind: 'mu', v: x, children: [a] });
const nu = (x: string, a: Formula): Formula => ({ kind: 'nu', v: x, children: [a] });

const FORMULAS: Formula[] = [
  lit('p'),
  lit('p', true),
  { kind: 'true', children: [] },
  { kind: 'false', children: [] },
  and(lit('p'), lit('q')),
  or(lit('p'), lit('q', true)),
  box(lit('p')),
  dia(lit('q')),
  box({ kind: 'false', children: [] }),
  dia({ kind: 'true', children: [] }),
  nu('X', and(lit('p'), box(v('X')))),                       // 常に p
  mu('X', or(lit('q'), dia(v('X')))),                        // いつか q
  mu('X', or(lit('q'), and(lit('p'), box(v('X'))))),         // p until q (全パス)
  nu('X', dia(v('X'))),                                      // 無限パスがある
  mu('X', box(v('X'))),                                      // 整礎（無限パスなし）
  nu('X', mu('Y', or(and(lit('q'), dia(v('X'))), dia(v('Y'))))), // q を無限回
  mu('X', nu('Y', and(or(lit('p'), v('X')), box(v('Y'))))),
  nu('X', and(box(v('X')), mu('Y', or(lit('q'), dia(v('Y')))))), // AG EF q
  and(nu('X', and(lit('p'), box(v('X')))), mu('Z', or(lit('q'), dia(v('Z'))))),
];

function makeModel(n: number, edgeBits: number, propBits: number): Model {
  const states = Array.from({ length: n }, (_, i) => ({
    id: `s${i}`, label: `s${i}`, x: 0, y: 0,
    props: [
      ...((propBits >> (2 * i)) & 1 ? ['p'] : []),
      ...((propBits >> (2 * i + 1)) & 1 ? ['q'] : []),
    ],
  }));
  const edges: { from: string; to: string }[] = [];
  let bit = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((edgeBits >> bit) & 1) edges.push({ from: `s${i}`, to: `s${j}` });
      bit++;
    }
  }
  return { states, edges, props: ['p', 'q'], initial: 's0' };
}

// ------------------------------------------------------------ 実行

let checks = 0;
let failures = 0;

for (const f of FORMULAS) {
  const errs = validateFormula(f, ['p', 'q']);
  if (errs.length) { console.error('論理式が不正:', errs); failures++; continue; }

  // n=2 の全グラフ(2^4) × 全付値(2^4) と、n=3 のランダム抽出。
  const models: Model[] = [];
  for (let e = 0; e < 16; e++) for (let p = 0; p < 16; p++) models.push(makeModel(2, e, p));
  for (let k = 0; k < 400; k++) {
    models.push(makeModel(3, Math.floor(Math.random() * 512), Math.floor(Math.random() * 64)));
  }

  for (const m of models) {
    const expected = denote(m, f, new Map());
    const ctx = makeCtx(f, m);
    const { solution } = solveGame(ctx);
    for (const s of m.states) {
      checks++;
      const gameSaysTrue = solution.w0.has(posKey({ state: s.id, path: [] }));
      if (gameSaysTrue !== expected.has(s.id)) {
        failures++;
        console.error('不一致:', JSON.stringify(f), 'model', JSON.stringify(m), 'state', s.id,
          'game=', gameSaysTrue, 'denotation=', expected.has(s.id));
      }
    }
  }
}

// 戦略の健全性: 勝ち領域の各ノードについて戦略の指す先が後続であり、
// かつ勝ち領域の中に留まることを確かめる。
{
  const m = makeModel(3, 0b010010001, 0b101010);
  for (const f of FORMULAS) {
    const ctx = makeCtx(f, m);
    const { arena, solution } = solveGame(ctx);
    for (const [player, w, strat] of [[0, solution.w0, solution.s0], [1, solution.w1, solution.s1]] as const) {
      for (const n of w) {
        if (arena.owner.get(n) !== player) continue;
        const t = strat.get(n);
        checks++;
        if (!t || !(arena.succ.get(n) ?? []).includes(t) || !w.has(t)) {
          failures++;
          console.error('戦略が不正:', player, n, '->', t);
        }
      }
    }
  }
}

// すべてのノードがちょうど片方の勝ち領域に属すること（決定性）。
{
  const m = makeModel(3, 0b011001100, 0b011011);
  for (const f of FORMULAS) {
    const ctx = makeCtx(f, m);
    const { arena, solution } = solveGame(ctx);
    for (const n of arena.nodes) {
      checks++;
      if (solution.w0.has(n) === solution.w1.has(n)) { failures++; console.error('決定性違反:', n); }
    }
  }
}

// 位置の総数が (状態数 × 部分式数) + シンク2 であること。
{
  const m = makeModel(3, 0b111000000, 0);
  const f = FORMULAS[FORMULAS.length - 1];
  let count = 0;
  walk(f, () => count++);
  const ctx = makeCtx(f, m);
  const { arena } = solveGame(ctx);
  checks++;
  if (arena.nodes.length !== m.states.length * count + 2) {
    failures++;
    console.error('アリーナのサイズが想定外:', arena.nodes.length);
  }
}

console.log(`${checks} 件の検査を実行、失敗 ${failures} 件`);
if (failures > 0) throw new Error(`${failures} 件の検査に失敗しました`);

// ------------------------------------------------------------
// 実プレイのシミュレーション:
//   「位置が 2 度目に現れたら打ち切り、区間内で巻き戻した変数のうち
//    優先度最高のものが ν なら肯定者・μ なら否定者の勝ち」
// という本アプリの規則が、パリティゲームの解と常に一致することを確かめる。
// 勝者側は Zielonka の記憶なし戦略、敗者側はランダムに指す。

function simulate(
  ctx: ReturnType<typeof makeCtx>,
  sol: ReturnType<typeof solveGame>['solution'],
  start: string,
  rnd: () => number,
): Side {
  const expected: Side = sol.w0.has(posKey({ state: start, path: [] })) ? 'V' : 'F';
  const hist: { pos: Position; jump?: string }[] = [{ pos: { state: start, path: [] } }];

  for (let step = 0; step < 100000; step++) {
    const pos = hist[hist.length - 1].pos;
    const info = analyze(ctx, pos);
    if (info.turn === 'end') return info.winner!;

    let mv: MoveOption;
    if (info.turn === 'auto') {
      mv = info.moves[0];
    } else if (info.turn === expected) {
      const visited = new Set(hist.map((h) => posKey(h.pos)));
      mv = chooseMove(ctx, sol, expected, pos, info.moves, visited);
    } else {
      mv = info.moves[Math.floor(rnd() * info.moves.length) % info.moves.length];
    }

    const key = posKey(mv.to);
    const idx = hist.findIndex((h) => posKey(h.pos) === key);
    hist.push({ pos: mv.to, jump: mv.kind === 'jump' ? mv.v : undefined });

    if (idx >= 0) {
      const vars = hist.slice(idx + 1).map((h) => h.jump).filter((x): x is string => !!x);
      if (vars.length === 0) throw new Error('変数を通らない閉路が生じた');
      let decisive = vars[0];
      for (const v2 of vars) if ((ctx.prio.get(v2) ?? 0) > (ctx.prio.get(decisive) ?? 0)) decisive = v2;
      return ctx.bmap.get(decisive)!.kind === 'nu' ? 'V' : 'F';
    }
  }
  throw new Error('シミュレーションが終了しなかった');
}

{
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const f of FORMULAS) {
    for (let trial = 0; trial < 60; trial++) {
      const m = makeModel(3, Math.floor(rnd() * 512), Math.floor(rnd() * 64));
      const ctx = makeCtx(f, m);
      const { solution } = solveGame(ctx);
      for (const s of m.states) {
        const expected: Side = solution.w0.has(posKey({ state: s.id, path: [] })) ? 'V' : 'F';
        for (let r = 0; r < 4; r++) {
          checks++;
          const got = simulate(ctx, solution, s.id, rnd);
          if (got !== expected) {
            failures++;
            console.error('プレイ結果が解と不一致:', JSON.stringify(f), JSON.stringify(m), s.id, got, expected);
          }
        }
      }
    }
  }
}

console.log(`シミュレーションを含めて合計 ${checks} 件、失敗 ${failures} 件`);
if (failures > 0) throw new Error('シミュレーションで失敗があります');
