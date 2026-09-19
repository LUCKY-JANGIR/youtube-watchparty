"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import YouTube, {
  type YouTubeProps,
  type YouTubePlayer as YTPlayer,
} from "react-youtube";

import type { Role } from "@/types";

import { Socket } from "socket.io-client";

interface Props {
  socket: Socket | null;

  roomId: string;

  videoId: string;

  userRole: Role;

  playbackState: "playing" | "paused";

  currentTime: number;

  serverTime: number;

  revision: number;

  isFullscreen: boolean;

  onToggleFullscreen: () => void;
}

const DRIFT_THRESHOLD_SEC = 1.25;

const SYNC_CHECK_INTERVAL_MS = 2000;

const DEFAULT_VOLUME = 80;

const VOLUME_STORAGE_KEY = "watchparty_volume";

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readSavedVolume() {
  if (typeof window === "undefined") {
    return DEFAULT_VOLUME;
  }

  const value = Number(localStorage.getItem(VOLUME_STORAGE_KEY));

  return Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : DEFAULT_VOLUME;
}

export default function YouTubePlayerComponent({
  socket,
  roomId,
  videoId,
  userRole,
  playbackState,
  currentTime,
  serverTime,
  revision,
  isFullscreen,
  onToggleFullscreen,
}: Props) {
  const playerRef = useRef<YTPlayer | null>(null);

  /*
   * TRUE only while WE are
   * changing the YouTube player
   * because of authoritative state.
   */
  const isRemoteAction = useRef(false);

  const remoteActionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const targetTimeRef = useRef(0);

  const targetStateRef = useRef<"playing" | "paused">("paused");

  const lastSyncTimestampRef = useRef(Date.now());

  const serverClockOffsetRef = useRef(0);

  const previousVideoIdRef = useRef(videoId);

  const lastRevisionRef = useRef(-1);

  const pendingAutoplayRef = useRef(false);

  const autoplayAttemptedRef = useRef(false);

  const volumeRef = useRef(DEFAULT_VOLUME);

  const mutedRef = useRef(false);

  const [duration, setDuration] = useState(0);

  const [progress, setProgress] = useState(0);

  const [volume, setVolume] = useState(DEFAULT_VOLUME);

  const [muted, setMuted] = useState(false);

  const [isSeeking, setSeeking] = useState(false);

  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const [playerError, setPlayerError] = useState("");

  const [hasEnded, setHasEnded] = useState(false);

  const isHostOrMod = userRole === "Host" || userRole === "Moderator";

  /*
   * Keep latest role available
   * to callbacks.
   */
  const roleRef = useRef(userRole);

  useEffect(() => {
    roleRef.current = userRole;
  }, [userRole]);

  /*
   * Keep latest playback state.
   */
  const playbackStateRef = useRef(playbackState);

  useEffect(() => {
    playbackStateRef.current = playbackState;

    targetStateRef.current = playbackState;
  }, [playbackState]);

  /*
   * Local volume.
   */
  useEffect(() => {
    const saved = readSavedVolume();

    volumeRef.current = saved;

    mutedRef.current = saved === 0;

    setVolume(saved);

    setMuted(saved === 0);
  }, []);

  /*
   * Helper used to protect the player
   * from accidentally treating our own
   * programmatic action as a user action.
   */
  const protectRemoteAction = useCallback((duration = 700) => {
    isRemoteAction.current = true;

    if (remoteActionTimerRef.current) {
      clearTimeout(remoteActionTimerRef.current);
    }

    remoteActionTimerRef.current = setTimeout(() => {
      isRemoteAction.current = false;
    }, duration);
  }, []);

  /*
   * Cleanup timer.
   */
  useEffect(() => {
    return () => {
      if (remoteActionTimerRef.current) {
        clearTimeout(remoteActionTimerRef.current);
      }
    };
  }, []);

  /*
   * Expected position based on
   * authoritative server state.
   */
  const getExpectedCurrentTime = useCallback(() => {
    const base = Math.max(0, finite(targetTimeRef.current, 0));

    if (targetStateRef.current !== "playing") {
      return base;
    }

    const estimatedServerNow = Date.now() + serverClockOffsetRef.current;

    const elapsed =
      Math.max(0, estimatedServerNow - lastSyncTimestampRef.current) / 1000;

    return base + elapsed;
  }, []);

  /*
   * Apply authoritative room state.
   *
   * This is the ONLY place where
   * synchronization commands manipulate
   * the YouTube player.
   */
  const applyRemoteState = useCallback(
    (time: number, state: "playing" | "paused") => {
      const player = playerRef.current;

      if (!player) {
        return;
      }

      const target = Math.max(0, finite(time, 0));

      const local = Math.max(0, finite(player.getCurrentTime?.(), 0));

      targetTimeRef.current = target;

      targetStateRef.current = state;

      lastSyncTimestampRef.current = Date.now();

      protectRemoteAction(900);

      /*
       * A playing state means this
       * is not an ended video.
       */
      if (state === "playing") {
        setHasEnded(false);
      }

      /*
       * Only correct meaningful drift.
       */
      if (Math.abs(local - target) > DRIFT_THRESHOLD_SEC) {
        player.seekTo(target, true);
      }

      if (state === "playing") {
        player.playVideo();

        setAutoplayBlocked(false);
      } else {
        player.pauseVideo();
      }
    },
    [protectRemoteAction],
  );

  /*
   * SINGLE synchronization path:
   *
   * RoomPage receives sync_state and
   * passes the state here as props.
   *
   * This component intentionally
   * DOES NOT register socket.on("sync_state").
   */
  useEffect(() => {
    if (!Number.isFinite(revision)) {
      return;
    }

    /*
     * Reject stale state.
     */
    if (revision < lastRevisionRef.current) {
      return;
    }

    lastRevisionRef.current = revision;

    /*
     * Calculate server/client
     * clock difference.
     */
    if (Number.isFinite(serverTime)) {
      serverClockOffsetRef.current = serverTime - Date.now();

      lastSyncTimestampRef.current = serverTime;
    } else {
      lastSyncTimestampRef.current = Date.now();
    }

    targetTimeRef.current = Math.max(0, finite(currentTime, 0));

    targetStateRef.current = playbackState;

    /*
     * New video loading is handled
     * separately below.
     */
    if (previousVideoIdRef.current !== videoId) {
      return;
    }

    applyRemoteState(currentTime, playbackState);
  }, [
    videoId,
    playbackState,
    currentTime,
    serverTime,
    revision,
    applyRemoteState,
  ]);

  /*
   * Handle video ID changes.
   */
  useEffect(() => {
    if (previousVideoIdRef.current === videoId) {
      return;
    }

    previousVideoIdRef.current = videoId;

    targetTimeRef.current = 0;

    targetStateRef.current = playbackState;

    lastSyncTimestampRef.current = Number.isFinite(serverTime)
      ? serverTime
      : Date.now();

    setProgress(0);

    setDuration(0);

    setHasEnded(false);

    setAutoplayBlocked(false);

    setPlayerError("");

    pendingAutoplayRef.current = playbackState === "playing";

    autoplayAttemptedRef.current = false;

    protectRemoteAction(2000);
  }, [videoId, playbackState, serverTime, protectRemoteAction]);

  /*
   * Autoplay.
   */
  const attemptAutoplay = useCallback(
    (player: YTPlayer) => {
      if (autoplayAttemptedRef.current) {
        return;
      }

      autoplayAttemptedRef.current = true;

      if (mutedRef.current || volumeRef.current === 0) {
        player.mute();
      } else {
        player.unMute();

        player.setVolume(volumeRef.current);
      }

      protectRemoteAction(1200);

      player.playVideo();

      /*
       * Browser autoplay check.
       */
      window.setTimeout(() => {
        const state = player.getPlayerState?.();

        if (state === 1) {
          setAutoplayBlocked(false);

          return;
        }

        /*
         * Retry muted.
         */
        player.mute();

        mutedRef.current = true;

        setMuted(true);

        protectRemoteAction(1200);

        player.playVideo();

        window.setTimeout(() => {
          const retryState = player.getPlayerState?.();

          if (retryState !== 1) {
            setAutoplayBlocked(true);
          }
        }, 450);
      }, 600);
    },
    [protectRemoteAction],
  );

  /*
   * PLAYER READY
   */
  const onReady: YouTubeProps["onReady"] = (event) => {
    const player = event.target;

    playerRef.current = player;

    setPlayerError("");

    const savedVolume = readSavedVolume();

    volumeRef.current = savedVolume;

    mutedRef.current = savedVolume === 0;

    setVolume(savedVolume);

    setMuted(savedVolume === 0);

    player.setVolume(savedVolume);

    if (savedVolume === 0) {
      player.mute();
    } else {
      player.unMute();
    }

    targetTimeRef.current = Math.max(0, finite(currentTime, 0));

    targetStateRef.current = playbackState;

    lastSyncTimestampRef.current = Number.isFinite(serverTime)
      ? serverTime
      : Date.now();

    if (playbackState === "playing") {
      autoplayAttemptedRef.current = false;

      attemptAutoplay(player);
    } else {
      applyRemoteState(currentTime, "paused");
    }
  };

  /*
   * YouTube player state changes.
   *
   * CRITICAL:
   *
   * We NO LONGER send "pause"
   * whenever YouTube reports state 2.
   *
   * Only explicit UI actions send
   * play/pause commands.
   */
  const onStateChange: YouTubeProps["onStateChange"] = (event) => {
    const player = event.target;

    const state = event.data;

    /*
     * New video loading.
     */
    if (pendingAutoplayRef.current && (state === 5 || state === 3)) {
      pendingAutoplayRef.current = false;

      autoplayAttemptedRef.current = false;

      attemptAutoplay(player);

      return;
    }

    /*
     * New video successfully playing.
     */
    if (state === 1 && pendingAutoplayRef.current) {
      pendingAutoplayRef.current = false;

      autoplayAttemptedRef.current = true;

      return;
    }

    /*
     * Ignore state events generated
     * by our own programmatic actions.
     */
    if (isRemoteAction.current) {
      return;
    }

    /*
     * ENDED
     *
     * This is different from PAUSED.
     *
     * A genuine YouTube ended event
     * means the video reached its end.
     *
     * We allow Host/Moderator to
     * synchronize that state.
     */
    if (state === 0) {
      setHasEnded(true);

      targetStateRef.current = "paused";

      const duration = Math.max(0, finite(player.getDuration?.(), 0));

      const current = Math.max(0, finite(player.getCurrentTime?.(), 0));

      const time = duration > 0 ? duration : current;

      targetTimeRef.current = time;

      /*
       * Only the current Host/Mod
       * can publish the end state.
       *
       * IMPORTANT:
       *
       * state === 2 (pause) is NOT
       * handled here.
       */
      if (roleRef.current === "Host" || roleRef.current === "Moderator") {
        socket?.emit("pause", {
          roomId,
          time,
        });
      }

      return;
    }

    /*
     * IMPORTANT:
     *
     * State 2 = paused is deliberately
     * ignored.
     *
     * It may be caused by:
     *
     * - browser lifecycle
     * - iframe transitions
     * - loading
     * - visibility changes
     * - role changes
     * - programmatic operations
     *
     * None of those should pause
     * the entire room.
     */
    if (state === 2) {
      return;
    }

    /*
     * State 1 = playing is ALSO ignored
     * as a server command.
     *
     * The only source of play commands
     * is the explicit Play/Replay button.
     */
    if (state === 1) {
      return;
    }
  };

  const onError: YouTubeProps["onError"] = (event) => {
    setPlayerError(
      `YouTube player error (${event.data}). This video may not allow embedding.`,
    );
  };

  /*
   * EXPLICIT PLAY / PAUSE / REPLAY
   *
   * This is now the only place,
   * apart from video-ended handling,
   * that intentionally sends playback
   * commands to the server.
   */
  const playPause = () => {
    if (!socket || !isHostOrMod) {
      return;
    }

    /*
     * REPLAY
     */
    if (hasEnded) {
      targetTimeRef.current = 0;

      targetStateRef.current = "playing";

      lastSyncTimestampRef.current = Date.now();

      setHasEnded(false);

      socket.emit("play", {
        roomId,
        time: 0,
      });

      return;
    }

    const player = playerRef.current;

    if (!player) {
      return;
    }

    const time = Math.max(0, finite(player.getCurrentTime?.(), 0));

    if (playbackState === "playing") {
      socket.emit("pause", {
        roomId,
        time,
      });
    } else {
      socket.emit("play", {
        roomId,
        time,
      });
    }
  };

  /*
   * Explicit Host/Mod seek.
   */
  const commitSeek = (value: number) => {
    if (!socket || !isHostOrMod) {
      return;
    }

    const time = Math.max(0, finite(value, 0));

    if (duration > 0 && time < duration - 0.5) {
      setHasEnded(false);
    }

    targetTimeRef.current = time;

    targetStateRef.current = playbackState;

    lastSyncTimestampRef.current = Date.now();

    /*
     * Send only the authoritative
     * seek command.
     *
     * Do not manually seek first.
     *
     * The server response will perform
     * the authoritative local seek too.
     */
    socket.emit("seek", {
      roomId,
      time,
    });
  };

  /*
   * Local volume.
   */
  const updateVolume = (nextVolume: number) => {
    const player = playerRef.current;

    const next = Math.min(100, Math.max(0, finite(nextVolume, DEFAULT_VOLUME)));

    setVolume(next);

    volumeRef.current = next;

    localStorage.setItem(VOLUME_STORAGE_KEY, String(next));

    if (!player) {
      return;
    }

    player.setVolume(next);

    if (next === 0) {
      player.mute();

      mutedRef.current = true;

      setMuted(true);
    } else {
      player.unMute();

      mutedRef.current = false;

      setMuted(false);
    }
  };

  const toggleMute = () => {
    const player = playerRef.current;

    if (!player) {
      return;
    }

    if (muted || player.isMuted?.()) {
      const next = volume > 0 ? volume : DEFAULT_VOLUME;

      player.unMute();

      player.setVolume(next);

      volumeRef.current = next;

      mutedRef.current = false;

      setVolume(next);

      setMuted(false);
    } else {
      player.mute();

      mutedRef.current = true;

      setMuted(true);
    }
  };

  const retryAutoplay = () => {
    const player = playerRef.current;

    if (!player) {
      return;
    }

    const next = volume > 0 ? volume : DEFAULT_VOLUME;

    player.unMute();

    player.setVolume(next);

    volumeRef.current = next;

    mutedRef.current = false;

    setVolume(next);

    setMuted(false);

    localStorage.setItem(VOLUME_STORAGE_KEY, String(next));

    protectRemoteAction(1200);

    player.playVideo();

    setAutoplayBlocked(false);
  };

  /*
   * Progress + participant drift correction.
   */
  useEffect(() => {
    const interval = window.setInterval(() => {
      const player = playerRef.current;

      if (!player) {
        return;
      }

      const current = Math.max(0, finite(player.getCurrentTime?.(), 0));

      const total = Math.max(0, finite(player.getDuration?.(), 0));

      if (!isSeeking) {
        setProgress(current);
      }

      setDuration(total);

      /*
       * Host/Moderator should not
       * be force-corrected.
       */
      if (isHostOrMod) {
        return;
      }

      /*
       * Participants follow the
       * authoritative room state.
       */
      if (targetStateRef.current !== "playing") {
        return;
      }

      const expected = getExpectedCurrentTime();

      if (!isSeeking && Math.abs(current - expected) > DRIFT_THRESHOLD_SEC) {
        protectRemoteAction(500);

        player.seekTo(expected, true);
      }
    }, SYNC_CHECK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [getExpectedCurrentTime, isHostOrMod, isSeeking, protectRemoteAction]);

  const opts: YouTubeProps["opts"] = {
    height: "100%",
    width: "100%",
    playerVars: {
      autoplay: 0,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      disablekb: 1,
      fs: 0,
      playsinline: 1,
    },
  };

  const safeDuration = Math.max(1, finite(duration, 1));
  const safeProgress = Math.min(
    safeDuration,
    Math.max(0, finite(progress, 0)),
  );

  return (
    <div
      className={`flex w-full overflow-hidden rounded-2xl border border-white/8 bg-black shadow-[0_25px_80px_rgba(0,0,0,0.35)] ${
        isFullscreen ? "h-full min-h-0 flex-col" : "flex-col"
      }`}
    >
      <div
        className={`relative w-full min-h-0 overflow-hidden bg-black ${
          isFullscreen ? "flex-1" : "aspect-video"
        }`}
      >
        <YouTube
          videoId={videoId}
          opts={opts}
          onReady={onReady}
          onStateChange={onStateChange}
          onError={onError}
          className="pointer-events-none h-full w-full"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />

        {autoplayBlocked && (
          <button
            type="button"
            onClick={retryAutoplay}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-xl border border-white/10 bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-xl shadow-indigo-950/30 transition hover:bg-indigo-400"
          >
            Click to enable audio
          </button>
        )}

        {playerError && (
          <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-rose-400/20 bg-rose-950/80 px-3 py-2.5 text-xs text-rose-200 backdrop-blur-md">
            {playerError}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/8 bg-[#0b0e14]/95 px-3 py-2.5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            disabled={!isHostOrMod}
            onClick={playPause}
            aria-label={
              isHostOrMod
                ? hasEnded
                  ? "Replay"
                  : playbackState === "playing"
                    ? "Pause"
                    : "Play"
                : "Playback is controlled by the Host or Moderator"
            }
            className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2.5 text-xs font-semibold transition ${
              isHostOrMod
                ? "bg-indigo-500 text-white hover:bg-indigo-400"
                : "cursor-default border border-white/8 bg-white/5 text-slate-500"
            }`}
          >
            {isHostOrMod
              ? hasEnded
                ? "Replay"
                : playbackState === "playing"
                  ? "Pause"
                  : "Play"
              : playbackState === "playing"
                ? "Playing"
                : hasEnded
                  ? "Ended"
                  : "Paused"}
          </button>

          <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-500">
            {formatTime(progress)}
          </span>

          <input
            type="range"
            min={0}
            max={safeDuration}
            step={0.5}
            value={safeProgress}
            disabled={duration <= 0 || !isHostOrMod}
            onPointerDown={() => {
              if (isHostOrMod) setSeeking(true);
            }}
            onChange={(event) => {
              if (!isHostOrMod) return;
              setProgress(Math.max(0, finite(Number(event.target.value), 0)));
            }}
            onPointerUp={(event) => {
              if (!isHostOrMod) return;
              setSeeking(false);
              commitSeek(Number(event.currentTarget.value));
            }}
            className={`min-w-0 flex-1 accent-indigo-500 ${
              isHostOrMod ? "cursor-pointer" : "cursor-default opacity-60"
            }`}
          />

          <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-500">
            {formatTime(duration)}
          </span>

          <button
            type="button"
            onClick={toggleMute}
            className="hidden h-9 rounded-lg border border-white/8 bg-white/5 px-2.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/10 sm:block"
          >
            {muted ? "Unmute" : "Mute"}
          </button>

          <input
            aria-label="Volume"
            type="range"
            min={0}
            max={100}
            value={Math.min(100, Math.max(0, volume))}
            onChange={(event) => updateVolume(Number(event.target.value))}
            className="hidden w-20 accent-indigo-500 md:block"
          />

          <button
            type="button"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/5 px-2.5 text-[10px] font-semibold text-slate-300 transition hover:bg-white/10"
          >
            {isFullscreen ? "Exit" : "Full"}
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between px-1">
          <span className="text-[9px] text-slate-600">
            {isHostOrMod ? "Room controls" : "Playback follows the Host/Moderator"}
          </span>
          <span className="text-[9px] text-slate-600">Volume is local</span>
        </div>
      </div>
    </div>
  );
}

function formatTime(value: number) {
  const safe = Math.max(0, Math.floor(finite(value, 0)));

  const hours = Math.floor(safe / 3600);

  const minutes = Math.floor((safe % 3600) / 60);

  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
