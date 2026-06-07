import type { Token as TokenType } from "../types";
import { colorTokens } from "../theme";

interface Props {
  token: TokenType;
  selectable: boolean;
  onSelect: (id: number) => void;
}

export default function Token({ token, selectable, onSelect }: Props) {
  const c = colorTokens(token.color);
  return (
    <button
      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/80 text-[10px] font-bold text-white/90 shadow-md transition-all ${c.solid} ${
        selectable
          ? `cursor-pointer ring-2 ring-offset-2 ring-offset-slate-900 ${c.ring} hover:scale-110 animate-pulse`
          : "cursor-default opacity-90"
      }`}
      disabled={!selectable}
      onClick={() => onSelect(token.id)}
      title={`${token.color} token ${token.id} (${token.state})`}
    >
      {token.id + 1}
    </button>
  );
}
