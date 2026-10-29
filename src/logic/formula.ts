// 否定標準形の様相μ計算の論理式。
// 否定は ¬p というリテラルの形でしか現れない。
// μ/ν が同じ変数を二度束縛することはない（エディタ側で保証する）。

export type FKind =
  | 'hole'   // 未入力の穴
  | 'true'   // ⊤
  | 'false'  // ⊥
  | 'lit'    // p / ¬p
  | 'and'    // ∧
  | 'or'     // ∨
  | 'box'    // □
  | 'dia'    // ◇
  | 'mu'     // μx.
  | 'nu'     // νx.
  | 'var';   // 束縛変数 x

export interface Formula {
  kind: FKind;
  prop?: string;   // lit
  neg?: boolean;   // lit
  v?: string;      // mu / nu / var
  children: Formula[];
}

export type Path = number[];

export const keyOf = (p: Path): string => p.join('.');

export const hole = (): Formula => ({ kind: 'hole', children: [] });

export function getAt(f: Formula, p: Path): Formula | null {
  let cur: Formula = f;
  for (const i of p) {
    const next = cur.children[i];
    if (!next) return null;
    cur = next;
  }
  return cur;
}

export function replaceAt(f: Formula, p: Path, nf: Formula): Formula {
  if (p.length === 0) return nf;
  const [i, ...rest] = p;
  const children = f.children.slice();
  children[i] = replaceAt(f.children[i], rest, nf);
  return { ...f, children };
}

export function walk(f: Formula, cb: (n: Formula, p: Path) => void, p: Path = []): void {
  cb(f, p);
  f.children.forEach((c, i) => walk(c, cb, [...p, i]));
}

export function holePaths(f: Formula): Path[] {
  const r: Path[] = [];
  walk(f, (n, p) => { if (n.kind === 'hole') r.push(p); });
  return r;
}

export const isComplete = (f: Formula): boolean => holePaths(f).length === 0;

export interface Binder { v: string; kind: 'mu' | 'nu'; path: Path }

export function binders(f: Formula): Binder[] {
  const r: Binder[] = [];
  walk(f, (n, p) => {
    if (n.kind === 'mu' || n.kind === 'nu') r.push({ v: n.v ?? '?', kind: n.kind, path: p });
  });
  return r;
}

export function binderMap(f: Formula): Map<string, Binder> {
  const m = new Map<string, Binder>();
  for (const b of binders(f)) if (!m.has(b.v)) m.set(b.v, b);
  return m;
}

/** path の真に上にある束縛子（外側から順）。 */
export function scopeAt(root: Formula, p: Path): Binder[] {
  const res: Binder[] = [];
  let cur: Formula | undefined = root;
  const acc: Path = [];
  for (const i of p) {
    if (!cur) break;
    if (cur.kind === 'mu' || cur.kind === 'nu') res.push({ v: cur.v ?? '?', kind: cur.kind, path: [...acc] });
    acc.push(i);
    cur = cur.children[i];
  }
  return res;
}

/**
 * 各束縛変数に優先度を割り当てる。
 * 束縛の入れ子で外側ほど大きい値 = 高優先度。偶数なら ν（肯定者）、奇数なら μ（否定者）。
 * 束縛子以外の位置の優先度は 0（偶数だが、変数を通らない閉路は存在しないので影響しない）。
 */
export function priorities(root: Formula): Map<string, number> {
  const bs = binders(root)
    .slice()
    .sort((a, b) => a.path.length - b.path.length || keyOf(a.path).localeCompare(keyOf(b.path)));
  const n = bs.length;
  const m = new Map<string, number>();
  bs.forEach((b, i) => m.set(b.v, 2 * (n - i) + (b.kind === 'mu' ? 1 : 0)));
  return m;
}

/**
 * 命題変数・束縛変数の名前はユーザーが自由入力した文字列で、
 * そのまま TeX の断片として扱う（KaTeX にそのまま渡す）。
 * 空文字列だけは安全側に倒して「?」に差し替える。
 */
const texVar = (name: string | undefined): string => (name && name.trim() ? name : '?');

/** そのノード自身の記号だけを表す TeX（子は含まない）。穴は構造的なプレースホルダなので対象外。 */
export function nodeTex(f: Formula): string {
  switch (f.kind) {
    case 'hole': return '';
    case 'true': return '\\top';
    case 'false': return '\\bot';
    case 'lit': return (f.neg ? '\\lnot ' : '') + texVar(f.prop);
    case 'and': return '\\wedge';
    case 'or': return '\\vee';
    case 'box': return '\\Box';
    case 'dia': return '\\Diamond';
    case 'mu': return `\\mu ${texVar(f.v)}`;
    case 'nu': return `\\nu ${texVar(f.v)}`;
    case 'var': return texVar(f.v);
  }
}

/** 論理式全体を 1 本の TeX 式として組み立てる（適宜括弧を補う）。 */
export function formulaToTex(f: Formula): string {
  const s = formulaToTex;
  switch (f.kind) {
    case 'hole': return '\\square';
    case 'true': return '\\top';
    case 'false': return '\\bot';
    case 'lit': return (f.neg ? '\\lnot ' : '') + texVar(f.prop);
    case 'var': return texVar(f.v);
    case 'and': return `(${s(f.children[0])} \\wedge ${s(f.children[1])})`;
    case 'or': return `(${s(f.children[0])} \\vee ${s(f.children[1])})`;
    case 'box': return `\\Box ${s(f.children[0])}`;
    case 'dia': return `\\Diamond ${s(f.children[0])}`;
    case 'mu': return `\\mu ${texVar(f.v)}.\\,${s(f.children[0])}`;
    case 'nu': return `\\nu ${texVar(f.v)}.\\,${s(f.children[0])}`;
  }
}

export function subformulaTex(root: Formula, p: Path): string {
  const n = getAt(root, p);
  return n ? formulaToTex(n) : '?';
}

/** 論理式の妥当性チェック。問題がなければ空配列。 */
export function validateFormula(root: Formula, props: string[]): string[] {
  const errs: string[] = [];
  if (!isComplete(root)) errs.push(`未入力の穴（▢）が ${holePaths(root).length} 個あります。`);

  const seen = new Set<string>();
  walk(root, (n) => {
    if (n.kind === 'mu' || n.kind === 'nu') {
      const v = n.v ?? '?';
      if (seen.has(v)) errs.push(`変数 ${v} が複数の束縛子で束縛されています（同一変数の多重束縛は不可）。`);
      seen.add(v);
    }
  });

  walk(root, (n, p) => {
    if (n.kind === 'var') {
      const inScope = scopeAt(root, p).some((b) => b.v === n.v);
      if (!inScope) errs.push(`変数 ${n.v} が束縛されていません（スコープ外）。`);
    }
    if (n.kind === 'lit' && n.prop && !props.includes(n.prop)) {
      errs.push(`命題変数 ${n.prop} がモデルに存在しません。`);
    }
  });

  return Array.from(new Set(errs));
}
