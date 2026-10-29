import { useMemo, useState } from 'react';
import { Formula, hole, validateFormula } from './logic/formula';
import { Model, emptyModel } from './logic/model';
import { FormulaEditor } from './components/FormulaEditor';
import { ModelEditor } from './components/ModelEditor';
import { GamePanel } from './components/GamePanel';

export default function App() {
  const [formula, setFormula] = useState<Formula>(hole());
  const [model, setModel] = useState<Model>(emptyModel());

  const errors = validateFormula(formula, model.props);
  const ready = errors.length === 0 && model.initial !== null;

  // 論理式やモデルの意味内容が変わったらゲームの進行状態を初期化する
  // （状態の位置をドラッグしただけではリセットしない）。
  const gameKey = useMemo(() => JSON.stringify([
    formula,
    model.initial,
    model.props,
    model.states.map((s) => [s.id, s.label, s.props]),
    model.edges,
  ]), [formula, model]);

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          <span className="title-wrap">
            評価ゲーム
            <svg className="scribble" viewBox="0 0 220 14" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3,8 C 30,2 55,12 80,6 C 108,-1 135,13 162,5 C 182,-1 200,9 217,4" />
            </svg>
          </span>
        </h1>
        <p className="subtitle">様相μ計算の評価ゲームを、実際に対局しながら理解する。</p>
      </header>

      <section className="board">
        <span className="pin" aria-hidden="true" />
        <h2 className="board-title"><span className="numeral n1">1</span>モデルを描く</h2>
        <ModelEditor model={model} setModel={setModel} />
      </section>

      <section className="board">
        <span className="pin" aria-hidden="true" />
        <h2 className="board-title"><span className="numeral n2">2</span>論理式を組み立てる</h2>
        <FormulaEditor root={formula} setRoot={setFormula} props={model.props} />
      </section>

      <section className="board">
        <span className="pin" aria-hidden="true" />
        <h2 className="board-title"><span className="numeral n3">3</span>評価ゲームを遊ぶ</h2>
        {ready ? (
          <GamePanel key={gameKey} root={formula} model={model} />
        ) : (
          <div className="sticky-note">
            <p>ここまで入力するとプレイできます。</p>
            <ul>
              {errors.length > 0 && errors.map((e, i) => <li key={i}>{e}</li>)}
              {model.initial === null && <li>上のモデルのセクションで初期状態を選んでください。</li>}
            </ul>
          </div>
        )}
      </section>

      <footer>
        <details>
          <summary>ルールのまとめ</summary>
          <ul>
            <li><b>∧</b>: 否定者が子を 1 つ選び、論理式駒を 1 つ下へ。</li>
            <li><b>∨</b>: 肯定者が子を 1 つ選び、論理式駒を 1 つ下へ。</li>
            <li><b>□</b>: 否定者が遷移を 1 回選ぶ（遷移できなければ肯定者の勝ち）。論理式駒も 1 つ下へ。</li>
            <li><b>◇</b>: 肯定者が遷移を 1 回選ぶ（遷移できなければ否定者の勝ち）。論理式駒も 1 つ下へ。</li>
            <li><b>μx / νx</b>: 一択なので自動で 1 つ下へ。</li>
            <li><b>束縛変数 x</b>: 自動で ηx の 1 つ下へ巻き戻す。</li>
            <li><b>リテラル・⊤・⊥</b>: 現在の状態で真なら肯定者、偽なら否定者の勝ちで終了。</li>
            <li>
              <b>無限プレイ</b>: 位置（状態, 論理式ノード）が履歴中で 2 度目に現れた時点でループ確定とし、
              その区間を無限回繰り返したとみなす。区間内で巻き戻した変数のうち優先度が最高（最も外側で束縛された）もの
              が ν なら肯定者、μ なら否定者の勝ち。パリティゲームの記憶なし決定性により、この打ち切りは元の無限ゲームと勝者が一致する。
            </li>
          </ul>
        </details>
      </footer>
    </div>
  );
}
