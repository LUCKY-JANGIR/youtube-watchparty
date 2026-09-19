"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

function extractYouTubeId(input: string) {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      const queryId = url.searchParams.get("v");
      if (queryId && /^[A-Za-z0-9_-]{11}$/.test(queryId)) return queryId;

      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[1];
      if (["shorts", "embed", "live"].includes(parts[0] ?? "") && id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
        return id;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const saveUsername = (name: string) => {
    localStorage.setItem("watchparty_username", name);
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const name = username.trim();
    const videoId = extractYouTubeId(videoUrl);

    if (!name) {
      setError("Enter your display name.");
      return;
    }

    if (!videoId) {
      setError("Enter a valid YouTube URL or video ID.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      const data = await response.json();
      if (!response.ok || !data.roomId) {
        throw new Error(data.message || "Could not create room.");
      }

      saveUsername(name);
      router.push(`/room/${data.roomId}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create room.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const name = username.trim();
    const roomId = joinCode.trim().toUpperCase();

    if (!name) {
      setError("Enter your display name.");
      return;
    }

    if (!/^[A-Z0-9]{6}$/.test(roomId)) {
      setError("Room code must be 6 letters or numbers.");
      return;
    }

    saveUsername(name);
    router.push(`/room/${roomId}`);
  };

  return (
    <main className="relative flex min-h-dvh items-center overflow-hidden bg-[#07090e] px-4 py-8 text-white sm:px-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-cyan-400/[0.045] blur-3xl" />

      <div className="relative mx-auto w-full max-w-5xl">
        <header className="mx-auto mb-8 max-w-2xl text-center">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-300 backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            YouTube Watch Party
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
            Watch together.<br />
            <span className="text-slate-500">Stay in sync.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-500">
            Create a private room, invite your friends, and watch YouTube together with synchronized playback and live chat.
          </p>
        </header>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/8 bg-white/[0.035] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">Start a party</p>
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Create a room</h2>
                <p className="mt-1 text-xs text-slate-600">You become the Host.</p>
              </div>
              <span className="rounded-xl border border-indigo-400/10 bg-indigo-400/5 px-2.5 py-2 text-[10px] text-indigo-300">HOST</span>
            </div>

            <form onSubmit={handleCreateRoom} className="mt-6 space-y-2.5">
              <input
                type="text"
                placeholder="Display name"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={30}
                className="w-full rounded-xl border border-white/8 bg-black/15 px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-indigo-400/40"
              />
              <input
                type="text"
                placeholder="YouTube URL or video ID"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                className="w-full rounded-xl border border-white/8 bg-black/15 px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-indigo-400/40"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Watch Party"}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-white/8 bg-white/[0.025] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Have an invite?</p>
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Join a room</h2>
                <p className="mt-1 text-xs text-slate-600">Use the 6-character room code.</p>
              </div>
              <span className="rounded-xl border border-cyan-400/10 bg-cyan-400/5 px-2.5 py-2 text-[10px] text-cyan-300">JOIN</span>
            </div>

            <form onSubmit={handleJoinRoom} className="mt-6 space-y-2.5">
              <input
                type="text"
                placeholder="Display name"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={30}
                className="w-full rounded-xl border border-white/8 bg-black/15 px-4 py-3 text-sm outline-none placeholder:text-slate-700 focus:border-cyan-400/40"
              />
              <input
                type="text"
                placeholder="ABC123"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                maxLength={6}
                className="w-full rounded-xl border border-white/8 bg-black/15 px-4 py-3 font-mono text-sm uppercase tracking-[0.18em] outline-none placeholder:text-slate-700 focus:border-cyan-400/40"
              />
              <button
                type="submit"
                className="w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.09]"
              >
                Join Watch Party
              </button>
            </form>
          </section>
        </div>

        {error && (
          <div className="mx-auto mt-4 max-w-2xl rounded-xl border border-rose-400/15 bg-rose-400/[0.05] px-4 py-3 text-center text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] text-slate-700">
          <span>Real-time sync</span>
          <span>•</span>
          <span>Role-based controls</span>
          <span>•</span>
          <span>Live chat</span>
        </div>
      </div>
    </main>
  );
}
