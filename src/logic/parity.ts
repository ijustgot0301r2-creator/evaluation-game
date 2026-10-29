// パリティゲームと Zielonka の再帰アルゴリズム。
// プレイヤー 0 = 肯定者（Verifier, 偶数が勝ち）, プレイヤー 1 = 否定者（Falsifier, 奇数が勝ち）。
// アリーナは「行き止まりなし（total）」であることを前提にする（game.ts 側でシンクを足して保証する）。

export type Player = 0 | 1;

export interface Arena {
  nodes: string[];
  owner: Map<string, Player>;
  prio: Map<string, number>;
  succ: Map<string, string[]>;
  pred: Map<string, string[]>;
}

export interface Solution {
  w0: Set<string>;
  w1: Set<string>;
  s0: Map<string, string>; // 肯定者の記憶なし勝利戦略（w0 上で定義）
  s1: Map<string, string>; // 否定者の記憶なし勝利戦略（w1 上で定義）
}

export function makeArena(
  entries: { id: string; owner: Player; prio: number; succ: string[] }[],
): Arena {
  const owner = new Map<string, Player>();
  const prio = new Map<string, number>();
  const succ = new Map<string, string[]>();
  const pred = new Map<string, string[]>();
  const nodes = entries.map((e) => e.id);
  for (const e of entries) {
    owner.set(e.id, e.owner);
    prio.set(e.id, e.prio);
    succ.set(e.id, Array.from(new Set(e.succ)));
    if (!pred.has(e.id)) pred.set(e.id, []);
  }
  for (const e of entries) {
    for (const t of succ.get(e.id)!) {
      if (!pred.has(t)) pred.set(t, []);
      pred.get(t)!.push(e.id);
    }
  }
  for (const [k, v] of pred) pred.set(k, Array.from(new Set(v)));
  return { nodes, owner, prio, succ, pred };
}

function setDiff(a: Set<string>, b: Set<string>): Set<string> {
  const r = new Set<string>();
  for (const x of a) if (!b.has(x)) r.add(x);
  return r;
}

/** region 内で player が target へ到達を強制できるノード集合と、そのための戦略。 */
function attractor(a: Arena, player: Player, target: Set<string>, region: Set<string>) {
  const A = new Set(target);
  const strat = new Map<string, string>();
  const remaining = new Map<string, number>();
  for (const v of region) {
    remaining.set(v, (a.succ.get(v) ?? []).filter((x) => region.has(x)).length);
  }
  const stack = [...target];
  while (stack.length) {
    const v = stack.pop()!;
    for (const u of a.pred.get(v) ?? []) {
      if (!region.has(u) || A.has(u)) continue;
      if (a.owner.get(u) === player) {
        A.add(u);
        strat.set(u, v);
        stack.push(u);
      } else {
        const c = (remaining.get(u) ?? 0) - 1;
        remaining.set(u, c);
        if (c <= 0) { A.add(u); stack.push(u); }
      }
    }
  }
  return { A, strat };
}

function empty(): Solution {
  return { w0: new Set(), w1: new Set(), s0: new Map(), s1: new Map() };
}

function pack(p: Player, wp: Set<string>, sp: Map<string, string>, wq: Set<string>, sq: Map<string, string>): Solution {
  return p === 0
    ? { w0: wp, s0: sp, w1: wq, s1: sq }
    : { w1: wp, s1: sp, w0: wq, s0: sq };
}

function zielonka(a: Arena, V: Set<string>): Solution {
  if (V.size === 0) return empty();

  let d = 0;
  for (const v of V) { const p = a.prio.get(v) ?? 0; if (p > d) d = p; }
  const p = (d % 2) as Player;
  const q = (1 - p) as Player;

  const U = new Set<string>();
  for (const v of V) if ((a.prio.get(v) ?? 0) === d) U.add(v);

  const { A, strat: attrA } = attractor(a, p, U, V);
  const r1 = zielonka(a, setDiff(V, A));
  const wq1 = q === 0 ? r1.w0 : r1.w1;

  if (wq1.size === 0) {
    // p が V 全体で勝つ。
    const sp = new Map(p === 0 ? r1.s0 : r1.s1); // V \ A 上
    for (const [k, v] of attrA) sp.set(k, v);    // A \ U 上（+ U の一部）
    for (const u of U) {
      if (a.owner.get(u) === p && !sp.has(u)) {
        const t = (a.succ.get(u) ?? []).find((x) => V.has(x));
        if (t) sp.set(u, t);
      }
    }
    return pack(p, new Set(V), sp, new Set(), new Map());
  }

  const { A: B, strat: attrB } = attractor(a, q, wq1, V);
  const r2 = zielonka(a, setDiff(V, B));
  const wp2 = p === 0 ? r2.w0 : r2.w1;
  const wq2 = q === 0 ? r2.w0 : r2.w1;

  const sq = new Map<string, string>();
  for (const [k, v] of (q === 0 ? r1.s0 : r1.s1)) sq.set(k, v); // wq1 上
  for (const [k, v] of attrB) sq.set(k, v);                     // B \ wq1 上
  for (const [k, v] of (q === 0 ? r2.s0 : r2.s1)) sq.set(k, v); // wq2 上
  const sp = new Map(p === 0 ? r2.s0 : r2.s1);

  const wq = new Set<string>([...wq2, ...B]);
  return pack(p, wp2, sp, wq, sq);
}

export function solveParity(a: Arena): Solution {
  return zielonka(a, new Set(a.nodes));
}
