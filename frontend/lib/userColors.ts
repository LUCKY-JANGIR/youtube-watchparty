const USER_COLORS = [
  "#60a5fa",
  "#a78bfa",
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#f472b6",
  "#c084fc",
  "#2dd4bf",
  "#38bdf8",
];

export function getUserColor(identifier: string) {
  let hash = 0;

  for (let index = 0; index < identifier.length; index += 1) {
    hash = (hash * 31 + identifier.charCodeAt(index)) | 0;
  }

  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}
