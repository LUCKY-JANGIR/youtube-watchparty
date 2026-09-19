const ROOM_ID_PATTERN = /^[A-Z0-9]{6}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_USERNAME_LENGTH = 30;
const MAX_CHAT_LENGTH = 500;
const MAX_TIME_SECONDS = 24 * 60 * 60;

export function normalizeRoomId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const roomId = value.trim().toUpperCase();
  return ROOM_ID_PATTERN.test(roomId) ? roomId : null;
}

export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const username = value.trim().slice(0, MAX_USERNAME_LENGTH);
  return username.length > 0 ? username : null;
}

export function normalizeChatMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim().slice(0, MAX_CHAT_LENGTH);
  return text.length > 0 ? text : null;
}

export function normalizeTime(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_TIME_SECONDS) return null;
  return value;
}

export function extractYouTubeId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const input = value.trim();
  if (!input) return null;

  if (VIDEO_ID_PATTERN.test(input)) return input;

  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      const queryId = url.searchParams.get("v");
      if (queryId && VIDEO_ID_PATTERN.test(queryId)) return queryId;

      const parts = url.pathname.split("/").filter(Boolean);
      const type = parts[0];
      const id = parts[1];

      if ((type === "embed" || type === "shorts" || type === "v") && id && VIDEO_ID_PATTERN.test(id)) {
        return id;
      }
    }
  } catch {
    return null;
  }

  return null;
}
