"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Socket } from "socket.io-client";

import { ChatMessage, RequestType, Role, RoomRequest } from "@/types";
import { getUserColor } from "@/lib/userColors";

interface Props {
  socket: Socket | null;
  roomId: string;
  currentUserId: string;
  currentUserRole: Role;
  messages: ChatMessage[];
  requests: RoomRequest[];
}

const YOUTUBE_URL_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}(?:[?&][^\s]*)?|youtu\.be\/[A-Za-z0-9_-]{11}(?:\?[^\s]*)?|youtube\.com\/shorts\/[A-Za-z0-9_-]{11}(?:\?[^\s]*)?|youtube\.com\/live\/[A-Za-z0-9_-]{11}(?:\?[^\s]*)?)/gi;

function cleanUrl(value: string) {
  return value.replace(/[.,!?;:)}\]]+$/, "");
}

function extractYouTubeId(text: string): string | null {
  const raw = cleanUrl(text);
  let value = raw;

  if (!value.startsWith("http")) {
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      const queryId = url.searchParams.get("v");
      if (queryId) return queryId;

      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0] ?? "")) {
        return parts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function copyToClipboard(value: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to textarea fallback.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

function renderMessageParts(
  text: string,
  canPlayInParty: boolean,
  onPlayVideo: (videoId: string) => void,
  onCopyVideo: (url: string, messageId: string) => void,
  messageId: string,
) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(YOUTUBE_URL_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const rawUrl = match[0];
    const url = cleanUrl(rawUrl);
    const videoId = extractYouTubeId(url);

    if (videoId) {
      const href = url.startsWith("http") ? url : `https://${url}`;

      parts.push(
        <span
          key={`${messageId}-${match.index}-${videoId}`}
          className="inline-flex max-w-full flex-wrap items-center gap-2"
        >
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="break-all text-indigo-300 underline decoration-indigo-400/40 underline-offset-2 hover:text-indigo-200"
          >
            YouTube Video
          </a>

          {canPlayInParty && (
            <>
              <button
                type="button"
                onClick={() => onPlayVideo(videoId)}
                className="rounded-md bg-indigo-500/15 px-2 py-1 text-[11px] font-semibold text-indigo-300 transition hover:bg-indigo-500/25"
              >
                Play in party
              </button>

              <button
                type="button"
                onClick={() => onCopyVideo(href, messageId)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
              >
                Copy link
              </button>
            </>
          )}
        </span>,
      );
    } else {
      parts.push(url);
    }

    lastIndex = match.index + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
}

const REQUEST_LABELS: Record<RequestType, string> = {
  play: "Play video",
  pause: "Pause video",
  seek: "Jump to time",
  change_video: "Change video",
};

function requestDescription(request: RoomRequest) {
  if (request.type === "seek") {
    return `Jump to ${formatTime(request.time ?? 0)}`;
  }

  if (request.type === "change_video") {
    return "Change the current YouTube video";
  }

  return REQUEST_LABELS[request.type];
}

function formatTime(value: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Chat({
  socket,
  roomId,
  currentUserId,
  currentUserRole,
  messages,
  requests,
}: Props) {
  const [activeTab, setActiveTab] = useState<"chat" | "requests">("chat");
  const [text, setText] = useState("");
  const [requestType, setRequestType] = useState<RequestType>("play");
  const [requestValue, setRequestValue] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isApprover = currentUserRole === "Host" || currentUserRole === "Moderator";
  const pendingCount = isApprover
    ? requests.length
    : requests.filter((request) => request.socketId === currentUserId).length;

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages],
  );

  const visibleRequests = useMemo(() => {
    if (isApprover) return requests;
    return requests.filter((request) => request.socketId === currentUserId);
  }, [currentUserId, isApprover, requests]);

  useEffect(() => {
    if (activeTab === "chat") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeTab, messages.length]);

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = text.trim();

    if (!value || !socket) return;

    socket.emit("send_chat", { roomId, text: value });
    setText("");
  };

  const submitRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!socket || isApprover) return;

    const payload: {
      roomId: string;
      type: RequestType;
      time?: number;
      videoId?: string;
    } = { roomId, type: requestType };

    if (requestType === "seek") {
      const parsed = Number(requestValue);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setRequestNotice("Enter a valid time in seconds.");
        return;
      }
      payload.time = parsed;
    }

    if (requestType === "change_video") {
      if (!requestValue.trim()) {
        setRequestNotice("Paste a YouTube URL or video ID.");
        return;
      }
      payload.videoId = requestValue.trim();
    }

    socket.emit("create_request", payload);
    setRequestValue("");
    setRequestNotice("Request sent to the Host/Moderator.");
    window.setTimeout(() => setRequestNotice(null), 2200);
  };

  const resolveRequest = (requestId: string, approved: boolean) => {
    socket?.emit("resolve_request", {
      roomId,
      requestId,
      approved,
    });
  };

  const playVideoInParty = (videoId: string) => {
    if (!socket || !isApprover) return;
    socket.emit("change_video", { roomId, videoId });
  };

  const copyVideo = async (url: string, messageId: string) => {
    const success = await copyToClipboard(url);
    if (!success) return;

    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, 1800);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035] text-white shadow-[0_20px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/8 px-3 py-2">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === "chat"
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
        >
          Chat
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`relative rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === "requests"
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
        >
          Requests
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[9px] text-white">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "chat" ? (
        <>
          <div className="flex shrink-0 items-center justify-between px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Room chat</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Messages and YouTube suggestions
              </p>
            </div>
            <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-[10px] text-slate-500">
              {messages.length} messages
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3 pr-2">
            {sortedMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center px-5 text-center text-xs text-slate-600">
                No messages yet. Start the conversation.
              </div>
            ) : (
              sortedMessages.map((message) => {
                const nameColor = getUserColor(message.socketId || message.username);

                return (
                  <div
                    key={message.id}
                    className="rounded-xl border border-white/6 bg-black/10 px-3 py-2.5"
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span
                        className="truncate text-xs font-semibold"
                        style={{ color: nameColor }}
                      >
                        {message.username}
                      </span>
                      <span className="shrink-0 text-[9px] text-slate-600">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-300">
                      {renderMessageParts(
                        message.text,
                        isApprover,
                        playVideoInParty,
                        copyVideo,
                        message.id,
                      )}
                    </div>

                    {copiedMessageId === message.id && (
                      <p className="mt-1.5 text-[10px] font-medium text-emerald-400">
                        Link copied
                      </p>
                    )}
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={sendMessage} className="shrink-0 border-t border-white/8 p-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 p-1.5 focus-within:border-indigo-400/40">
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={500}
                placeholder="Message or paste a YouTube link..."
                className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs text-white outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!isApprover ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-indigo-400/10 bg-indigo-500/[0.06] p-3">
                <p className="text-xs font-semibold text-slate-200">Request a change</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Your request goes to the Host or Moderator for approval before anything changes for the room.
                </p>
              </div>

              <form onSubmit={submitRequest} className="space-y-2.5">
                <select
                  value={requestType}
                  onChange={(event) => setRequestType(event.target.value as RequestType)}
                  className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-indigo-400/40"
                >
                  <option value="play">Play video</option>
                  <option value="pause">Pause video</option>
                  <option value="seek">Jump to time</option>
                  <option value="change_video">Change video</option>
                </select>

                {requestType === "seek" && (
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={requestValue}
                    onChange={(event) => setRequestValue(event.target.value)}
                    placeholder="Time in seconds (e.g. 90)"
                    className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-400/40"
                  />
                )}

                {requestType === "change_video" && (
                  <input
                    type="text"
                    value={requestValue}
                    onChange={(event) => setRequestValue(event.target.value)}
                    placeholder="YouTube URL or video ID"
                    className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-400/40"
                  />
                )}

                <button
                  type="submit"
                  disabled={requests.some((request) => request.socketId === currentUserId)}
                  className="w-full rounded-xl bg-indigo-500 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {requests.some((request) => request.socketId === currentUserId)
                    ? "Request pending"
                    : "Send request"}
                </button>
              </form>

              {requestNotice && (
                <p className="rounded-lg border border-white/6 bg-white/[0.03] px-3 py-2 text-[10px] text-slate-400">
                  {requestNotice}
                </p>
              )}

              <div className="space-y-2">
                {visibleRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-white/6 bg-black/10 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate text-xs font-semibold"
                        style={{ color: getUserColor(request.socketId || request.username) }}
                      >
                        {request.username}
                      </span>
                      <span className="text-[9px] text-slate-600">Pending</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {requestDescription(request)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="mb-3 rounded-xl border border-amber-400/10 bg-amber-400/[0.05] p-3">
                <p className="text-xs font-semibold text-slate-200">Pending approvals</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">
                  Approving a request applies the same server-authoritative action as your normal controls.
                </p>
              </div>

              {visibleRequests.length === 0 ? (
                <div className="flex min-h-[180px] items-center justify-center text-center text-xs text-slate-600">
                  No pending requests.
                </div>
              ) : (
                visibleRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-xl border border-white/7 bg-black/10 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="truncate text-xs font-semibold"
                          style={{ color: getUserColor(request.socketId || request.username) }}
                        >
                          {request.username}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-300">
                          {requestDescription(request)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[9px] text-slate-600">
                        {new Date(request.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {request.type === "change_video" && request.videoId && (
                      <p className="mt-2 truncate rounded-lg bg-white/[0.03] px-2 py-1.5 font-mono text-[9px] text-slate-500">
                        {request.videoId}
                      </p>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => resolveRequest(request.id, false)}
                        className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-2 text-[10px] font-semibold text-slate-300 transition hover:bg-white/[0.07]"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveRequest(request.id, true)}
                        className="rounded-lg bg-emerald-500/15 px-2 py-2 text-[10px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
