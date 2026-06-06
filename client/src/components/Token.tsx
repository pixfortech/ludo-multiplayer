import type { Token as TokenType } from "../types";

const COLOR_MAP: Record<string, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
};

interface Props {
  token: TokenType;
  selectable: boolean;
  onSelect: (id: number) => void;
}

export default function Token({ token, selectable, onSelect }: Props) {
  return (
    <button
      className={`w-6 h-6 rounded-full border-2 border-white ${COLOR_MAP[token.color]} ${
        selectable ? "ring-2 ring-white cursor-pointer" : "cursor-default opacity-80"
      }`}
      disabled={!selectable}
      onClick={() => onSelect(token.id)}
      title={`${token.color} token ${token.id} (${token.state})`}
    />
  );
}
