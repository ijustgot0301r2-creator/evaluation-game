import { useMemo } from 'react';
import katex from 'katex';

/**
 * 与えられた TeX 文字列を KaTeX でレンダリングした HTML を返す。
 * 失敗した場合は入力文字列をそのままエラー表示として返す（throwOnError: false）。
 * trust は既定の false のまま（\href や \url 等での不当なリンク埋め込みを許さない）。
 */
export function katexHtml(tex: string, displayMode = false): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      strict: 'ignore',
      maxExpand: 1000,
    });
  } catch {
    return katex.renderToString('\\text{?}', { throwOnError: false });
  }
}

interface KProps {
  tex: string;
  display?: boolean;
  className?: string;
}

/** TeX 文字列を描画するインライン（または別行立て）の数式スパン。 */
export function K({ tex, display = false, className }: KProps) {
  const html = useMemo(() => katexHtml(tex, display), [tex, display]);
  const cls = className ? `katex-wrap ${className}` : 'katex-wrap';
  // eslint-disable-next-line react/no-danger
  return <span className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 複数の TeX 片を区切り文字（既定: 読点）でつないで並べる。空配列なら「—」。 */
export function KRow({ items, sep = ',\\ ', empty = '—' }: { items: string[]; sep?: string; empty?: string }) {
  if (items.length === 0) return <span className="katex-wrap muted">{empty}</span>;
  return <K tex={items.join(sep)} />;
}
