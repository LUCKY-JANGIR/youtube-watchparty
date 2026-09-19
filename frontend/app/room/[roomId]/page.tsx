"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useSocket } from "@/hooks/useSocket";
import YouTubePlayerComponent from "@/components/YouTubePlayer";
import ParticipantList from "@/components/ParticipantList";
import Chat from "@/components/Chat";
import { Participant, Role, SyncState, ChatMessage, RoomRequest } from "@/types";

export default function RoomPage() {
  const params = useParams();
  const roomId = String(params?.roomId || "").toUpperCase();
  const router = useRouter();
  const { socket, isConnected } = useSocket();

  const [username, setUsername] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [hasEnteredName, setHasEnteredName] = useState(false);
  const [hasReceivedSnapshot, setHasReceivedSnapshot] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);

  const [videoId, setVideoId] = useState("dQw4w9WgXcQ");
  const [urlInput, setUrlInput] = useState("");
  const [userRole, setUserRole] = useState<Role>("Participant");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [requests, setRequests] = useState<RoomRequest[]>([]);
  const [playbackState, setPlaybackState] = useState<"playing" | "paused">("paused");
  const [currentTime, setCurrentTime] = useState(0);
  const [serverTime, setServerTime] = useState(Date.now());
  const [revision, setRevision] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const roomShellRef = useRef<HTMLElement | null>(null);
  const lastRevisionRef = useRef(0);

  useEffect(() => {
    const storedUsername = localStorage.getItem("watchparty_username") || "";

    if (storedUsername) {
      setUsername(storedUsername);
      setNameInput(storedUsername);
      setHasEnteredName(true);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === roomShellRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (!socket || !isConnected || !hasEnteredName || !roomId || !username) {
      return;
    }

    const handleSyncState = (data: SyncState) => {
      const incomingRevision = Number.isFinite(data.revision) ? data.revision : 0;

      if (incomingRevision < lastRevisionRef.current) {
        return;
      }

      lastRevisionRef.current = incomingRevision;
      setHasReceivedSnapshot(true);
      setRoomNotFound(false);
      setVideoId(data.videoId);
      setPlaybackState(data.playbackState);
      setCurrentTime(Number.isFinite(data.currentTime) ? Math.max(0, data.currentTime) : 0);
      setServerTime(Number.isFinite(data.serverTime) ? data.serverTime : Date.now());
      setRevision(incomingRevision);
      setParticipants(Array.isArray(data.participants) ? data.participants : []);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setUserRole(data.role);
      setErrorMessage(null);
    };

    const handleChatMessage = (message: ChatMessage) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) return current;
        return [...current, message].slice(-100);
      });
    };

    const handleRequestResolved = (data: {
      requestId: string;
      approved: boolean;
      message: string;
    }) => {
      setNotice(data.message);
      window.setTimeout(() => setNotice(null), 2500);
    };

    const handleKicked = (message: string) => {
      window.alert(message);
      router.replace("/");
    };

    const handleError = (message: string) => {
      const isMissingRoom = message.toLowerCase().includes("room not found");

      if (isMissingRoom) {
        setRoomNotFound(true);
        setHasReceivedSnapshot(false);
      }

      setErrorMessage(message);
      window.setTimeout(() => setErrorMessage(null), 4000);
    };

    socket.on("sync_state", handleSyncState);
    socket.on("chat_message", handleChatMessage);
    socket.on("request_resolved", handleRequestResolved);
    socket.on("kicked", handleKicked);
    socket.on("error_message", handleError);

    socket.emit("join_room", { roomId, username });

    return () => {
      socket.off("sync_state", handleSyncState);
      socket.off("chat_message", handleChatMessage);
      socket.off("request_resolved", handleRequestResolved);
      socket.off("kicked", handleKicked);
      socket.off("error_message", handleError);
    };
  }, [socket, isConnected, hasEnteredName, roomId, username, router]);

  const handleJoinSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = nameInput.trim().slice(0, 30);
    if (!trimmed) return;

    localStorage.setItem("watchparty_username", trimmed);
    setUsername(trimmed);
    setHasEnteredName(true);
  };

  const handleChangeVideo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!socket || !urlInput.trim()) return;

    socket.emit("change_video", { roomId, videoId: urlInput.trim() });
    setUrlInput("");
  };

  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Room link copied.");
      window.setTimeout(() => setNotice(null), 2200);
    } catch {
      setErrorMessage("Could not copy the room URL.");
    }
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setNotice("Room code copied.");
      window.setTimeout(() => setNotice(null), 2200);
    } catch {
      setErrorMessage("Could not copy the room code.");
    }
  };

  const leaveRoom = () => {
    socket?.emit("leave_room", { roomId });
    router.replace("/");
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await roomShellRef.current?.requestFullscreen();
    } catch {
      setErrorMessage("Fullscreen is not available in this browser.");
    }
  };

  const isHostOrMod = userRole === "Host" || userRole === "Moderator";

  if (!hasEnteredName) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#07090e] px-4 py-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/8 bg-white/[0.035] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
          <div className="mb-6 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-indigo-300">
              Watch Party
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Join room {roomId}</h1>
            <p className="mt-2 text-xs text-slate-500">Choose the name everyone will see.</p>
          </div>

          <form onSubmit={handleJoinSubmit} className="space-y-3">
            <input
              type="text"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              maxLength={30}
              placeholder="Your display name"
              className="w-full rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-indigo-400/50"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold transition hover:bg-indigo-400"
            >
              Join Party
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (roomNotFound) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#07090e] px-4 text-white">
        <div className="w-full max-w-sm rounded-3xl border border-white/8 bg-white/[0.035] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-400/15 bg-rose-400/10 text-sm text-rose-300">
            !
          </div>
          <h1 className="mt-4 text-xl font-bold">Room not found</h1>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Room <span className="font-mono text-slate-400">{roomId}</span> doesn&apos;t exist or has expired.
          </p>
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mt-5 w-full rounded-xl bg-white/8 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/12"
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  if (!isConnected || !hasReceivedSnapshot) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#07090e] px-4 text-white">
        <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-6 py-5 text-center shadow-xl backdrop-blur-xl">
          <div className="mx-auto mb-3 h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
          <h1 className="text-sm font-semibold">Connecting to room...</h1>
          <p className="mt-1 font-mono text-[10px] text-slate-600">{roomId}</p>
          {errorMessage && <p className="mt-3 text-xs text-rose-300">{errorMessage}</p>}
        </div>
      </main>
    );
  }

  return (
    <main
      ref={roomShellRef}
      className={`bg-[#07090e] text-white ${
        isFullscreen
          ? "h-dvh w-full overflow-hidden p-3 lg:p-4"
          : "min-h-dvh px-3 py-3 md:px-5 md:py-4"
      }`}
    >
      <div className={`mx-auto flex min-h-0 max-w-[1500px] flex-col ${isFullscreen ? "h-full" : "min-h-[calc(100dvh-24px)]"}`}>
        <header className="flex shrink-0 items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="hidden h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300 sm:flex">
                ◉
              </div>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-300">
                YouTube Watch Party
              </p>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="font-mono text-base font-bold tracking-wider sm:text-lg">{roomId}</h1>
              <span className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[9px] text-slate-400">
                {userRole}
              </span>
              <span className={`hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] sm:flex ${isConnected ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300" : "border-amber-400/15 bg-amber-400/5 text-amber-300"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-amber-400"}`} />
                {isConnected ? "Connected" : "Reconnecting"}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={copyRoomCode}
              className="rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-2 text-[10px] font-semibold text-slate-300 transition hover:bg-white/[0.07] sm:px-3"
            >
              Copy Code
            </button>
            <button
              type="button"
              onClick={copyRoomLink}
              className="hidden rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold text-slate-300 transition hover:bg-white/[0.07] sm:block"
            >
              Copy Link
            </button>
            <button
              type="button"
              onClick={leaveRoom}
              className="rounded-lg border border-rose-400/15 bg-rose-400/5 px-2.5 py-2 text-[10px] font-semibold text-rose-300 transition hover:bg-rose-400/10 sm:px-3"
            >
              Leave
            </button>
          </div>
        </header>

        {notice && (
          <div className="fixed left-1/2 top-4 z-[120] -translate-x-1/2 rounded-full border border-indigo-400/15 bg-[#111722]/90 px-4 py-2 text-[10px] font-medium text-indigo-200 shadow-xl backdrop-blur-xl">
            {notice}
          </div>
        )}

        {errorMessage && !roomNotFound && (
          <div className="fixed left-1/2 top-4 z-[121] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-rose-400/15 bg-[#190e13]/95 px-4 py-2 text-[10px] font-medium text-rose-200 shadow-xl backdrop-blur-xl">
            {errorMessage}
          </div>
        )}

        <div
          className={`min-h-0 flex-1 gap-3 ${
            isFullscreen
              ? "grid grid-cols-[minmax(0,1fr)_minmax(280px,330px)] overflow-hidden"
              : "lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:h-[calc(100dvh-86px)]"
          }`}
        >
          <section className="flex min-h-0 flex-col gap-3">
            <div className="min-h-0 flex-1">
              <YouTubePlayerComponent
                socket={socket}
                roomId={roomId}
                videoId={videoId}
                userRole={userRole}
                playbackState={playbackState}
                currentTime={currentTime}
                serverTime={serverTime}
                revision={revision}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            </div>

            {isHostOrMod && (
              <form
                onSubmit={handleChangeVideo}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] p-2 backdrop-blur-xl"
              >
                <input
                  type="text"
                  placeholder="Paste YouTube URL or video ID..."
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-200 outline-none placeholder:text-slate-600"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-indigo-500 px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-indigo-400"
                >
                  Change Video
                </button>
              </form>
            )}
          </section>

          <aside
            className={`mt-3 grid min-w-0 grid-rows-[minmax(0,0.78fr)_minmax(0,1.45fr)] gap-3 lg:mt-0 ${
              isFullscreen ? "min-h-0" : "min-h-[620px] lg:min-h-0"
            }`}
          >
            <ParticipantList
              socket={socket}
              roomId={roomId}
              participants={participants}
              currentUserId={socket?.id || ""}
              currentUserRole={userRole}
            />

            <Chat
              socket={socket}
              roomId={roomId}
              currentUserId={socket?.id || ""}
              currentUserRole={userRole}
              messages={messages}
              requests={requests}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}
