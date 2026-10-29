// 様相モデル（クリプキ構造） M = (S, R, V)

export interface MState {
  id: string;
  label: string;
  x: number;
  y: number;
  props: string[]; // この状態で真になる命題変数
}

export interface MEdge { from: string; to: string }

export interface Model {
  states: MState[];
  edges: MEdge[];
  props: string[];      // 命題変数の一覧
  initial: string | null;
}

export const successors = (m: Model, s: string): string[] =>
  m.edges.filter((e) => e.from === s).map((e) => e.to);

export const stateLabel = (m: Model, id: string): string =>
  m.states.find((s) => s.id === id)?.label ?? id;

export function emptyModel(): Model {
  return { states: [], edges: [], props: [], initial: null };
}
