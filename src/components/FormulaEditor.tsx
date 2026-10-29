import { useState } from 'react';
import {
  Formula, Path, keyOf, hole, replaceAt, holePaths, scopeAt, binders,
  formulaToTex, subformulaTex, validateFormula,
} from '../logic/formula';
import { FormulaTree } from './FormulaTree';
import { K } from './Katex';

interface Props {
  root: Formula;
  setRoot: (f: Formula) => void;
  props: string[];
}

export function FormulaEditor({ root, setRoot, props }: Props) {
  const [sel, setSel] = useState<Path>([]);
  const selKey = keyOf(sel);

  const used = new Set(binders(root).map((b) => b.v));
  const [newVar, setNewVar] = useState('');
  const trimmedVar = newVar.trim();
  const varTaken = trimmedVar !== '' && used.has(trimmedVar);
  const varOk = trimmedVar !== '' && !varTaken;

  const scope = scopeAt(root, sel);
  const errors = validateFormula(root, props);

  /** 挿入後、新ノード内の最初の穴（なければ式全体の最初の穴）へ選択を移す。 */
  const place = (nf: Formula) => {
    const next = replaceAt(root, sel, nf);
    setRoot(next);
    const inner = holePaths(nf).map((p) => [...sel, ...p]);
    if (inner.length > 0) { setSel(inner[0]); return; }
    const rest = holePaths(next);
    if (rest.length > 0) setSel(rest[0]);
  };

  const binary = (kind: 'and' | 'or') => place({ kind, children: [hole(), hole()] });
  const unary = (kind: 'box' | 'dia') => place({ kind, children: [hole()] });
  const fix = (kind: 'mu' | 'nu') => {
    if (!varOk) return;
    place({ kind, v: trimmedVar, children: [hole()] });
    setNewVar('');
  };

  const holes = holePaths(root);

  return (
    <>
      <p className="hint">
        木の中の穴（<span className="chip dashed hole-chip">▢</span>）を選んでから演算子ボタンを押すと、
        その穴が演算子とその子の穴に置き換わります。すでに埋まったノードを選んで押すと、そのノード以下が置き換わります。
      </p>

      <div className="selbar">
        <span className="selbar-label">選択中:</span>
        <code>{sel.length === 0 ? '根' : sel.join('→')}</code>
        <span className="selbar-sep">/</span>
        <span className="sub"><K tex={subformulaTex(root, sel)} /></span>
        <button className="mini" disabled={holes.length === 0}
          onClick={() => { if (holes.length) setSel(holes[0]); }}>
          次の穴へ
        </button>
      </div>

      <div className="editor-grid">
        <div className="keypad">
          <div className="keyrow">
            <span className="keylab">論理結合子</span>
            <button className="op op-f" onClick={() => binary('and')} title="否定者が1つ下へ"><K tex="\wedge" /></button>
            <button className="op op-v" onClick={() => binary('or')} title="肯定者が1つ下へ"><K tex="\vee" /></button>
          </div>
          <div className="keyrow">
            <span className="keylab">様相</span>
            <button className="op op-f" onClick={() => unary('box')} title="否定者が遷移を選ぶ"><K tex="\Box" /></button>
            <button className="op op-v" onClick={() => unary('dia')} title="肯定者が遷移を選ぶ"><K tex="\Diamond" /></button>
          </div>
          <div className="keyrow fixrow">
            <span className="keylab">不動点</span>
            <input
              className="varinput"
              value={newVar}
              placeholder="束縛する変数名"
              onChange={(e) => setNewVar(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && varOk) fix('nu'); }}
            />
            {trimmedVar !== '' && <span className="varpreview"><K tex={trimmedVar} /></span>}
            <button className="op op-fix" onClick={() => fix('mu')} disabled={!varOk}><K tex="\mu" /></button>
            <button className="op op-fix" onClick={() => fix('nu')} disabled={!varOk}><K tex="\nu" /></button>
            {varTaken && <span className="keynote warn-note">その変数名は既に使われています</span>}
          </div>
          <div className="keyrow">
            <span className="keylab">束縛変数</span>
            {scope.length === 0 && <span className="keynote">この位置でスコープに入っている変数はありません</span>}
            {scope.map((b) => (
              <button key={b.v} className="op op-var" onClick={() => place({ kind: 'var', v: b.v, children: [] })}>
                <K tex={b.v} />
              </button>
            ))}
          </div>
          <div className="keyrow">
            <span className="keylab">リテラル</span>
            {props.length === 0 && <span className="keynote">上のモデルのセクションで命題変数を追加してください</span>}
            {props.map((p) => (
              <button key={p} className="op op-lit" onClick={() => place({ kind: 'lit', prop: p, neg: false, children: [] })}>
                <K tex={p} />
              </button>
            ))}
            {props.map((p) => (
              <button key={`n${p}`} className="op op-lit neg"
                onClick={() => place({ kind: 'lit', prop: p, neg: true, children: [] })}>
                <K tex={`\\lnot ${p}`} />
              </button>
            ))}
          </div>
          <div className="keyrow">
            <span className="keylab">定数</span>
            <button className="op op-const" onClick={() => place({ kind: 'true', children: [] })}><K tex="\top" /></button>
            <button className="op op-const" onClick={() => place({ kind: 'false', children: [] })}><K tex="\bot" /></button>
          </div>
          <div className="keyrow">
            <span className="keylab">編集</span>
            <button className="warn" onClick={() => place(hole())}>選択を穴に戻す</button>
            <button className="warn" onClick={() => { setRoot(hole()); setSel([]); }}>全消去</button>
          </div>
        </div>

        <div className="tree-col">
          <p className="hint">
            クリックでそのノードを選択できます。紫の破線の矢印は束縛変数から対応する <K tex="\mu x" />/<K tex="\nu x" /> への巻き戻しを表します。
          </p>
          <FormulaTree root={root} selectedKey={selKey} onSelect={(p) => setSel(p)} />
        </div>
      </div>

      <div className="formula-line">
        <span className="keylab">現在の式</span>
        <div className="big"><K tex={formulaToTex(root)} display /></div>
      </div>

      {errors.length > 0 ? (
        <ul className="errors">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      ) : (
        <div className="ok">この論理式は妥当です（否定標準形・変数の多重束縛なし）。</div>
      )}
    </>
  );
}
