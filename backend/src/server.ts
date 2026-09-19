import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "node:http";

import { Server, Socket } from "socket.io";

import { roomManager } from "./roomManager";

import {
  AssignRolePayload,
  ChangeVideoPayload,
  JoinRoomPayload,
  PlaybackPayload,
  RemoveParticipantPayload,
  SendChatPayload,
  TransferHostPayload,
  CreateRequestPayload,
  ResolveRequestPayload,
} from "./types";

import {
  extractYouTubeId,
  normalizeChatMessage,
  normalizeRoomId,
  normalizeTime,
  normalizeUsername,
} from "./validation";

dotenv.config();

const app = express();

const server = http.createServer(app);

const PORT = Number(process.env.PORT ?? 5000);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
  }),
);

app.use(
  express.json({
    limit: "20kb",
  }),
);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,

    methods: ["GET", "POST"],
  },
});

function sendError(socket: Socket, message: string) {
  socket.emit("error_message", message);
}

function emitRoomState(roomId: string) {
  const snapshot = roomManager.getSnapshot(roomId);

  if (!snapshot) {
    return;
  }

  /*
   * One authoritative snapshot is
   * sent to every member.
   *
   * Role is personalized per socket.
   */
  for (const participant of snapshot.participants) {
    const participantSocket = io.sockets.sockets.get(participant.socketId);

    if (!participantSocket) {
      continue;
    }

    participantSocket.emit("sync_state", {
      ...snapshot,

      role: participant.role,
    });
  }
}

function requireMember(socket: Socket, rawRoomId: unknown): string | null {
  const roomId = normalizeRoomId(rawRoomId);

  if (!roomId) {
    sendError(socket, "Invalid room code.");

    return null;
  }

  if (
    socket.data.roomId !== roomId ||
    !roomManager.getParticipant(roomId, socket.id)
  ) {
    sendError(socket, "You are not a member of this room.");

    return null;
  }

  return roomId;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
  });
});

app.post("/api/rooms", (req, res) => {
  const videoId = extractYouTubeId(req.body?.videoId);

  if (!videoId) {
    return res.status(400).json({
      success: false,
      message: "Invalid YouTube video URL or ID.",
    });
  }

  const room = roomManager.createRoom(videoId);

  return res.status(201).json({
    success: true,
    roomId: room.roomId,
  });
});

app.get("/api/rooms/:roomId", (req, res) => {
  const roomId = normalizeRoomId(req.params.roomId);

  if (!roomId) {
    return res.status(400).json({
      success: false,
      message: "Invalid room code.",
    });
  }

  const room = roomManager.getSnapshot(roomId);

  if (!room) {
    return res.status(404).json({
      success: false,
      message: "Room not found.",
    });
  }

  return res.status(200).json({
    success: true,
    room,
  });
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.data.roomId = null;

  /*
   * JOIN
   */
  socket.on("join_room", (payload: JoinRoomPayload) => {
    const roomId = normalizeRoomId(payload?.roomId);

    const username = normalizeUsername(payload?.username);

    if (!roomId || !username) {
      return sendError(socket, "Invalid room code or username.");
    }

    if (!roomManager.getRoom(roomId)) {
      return sendError(socket, "Room not found. Check the room code.");
    }

    const currentRoomId = socket.data.roomId as string | null;

    /*
     * If this socket was already
     * inside another room, clean it
     * up first.
     */
    if (currentRoomId && currentRoomId !== roomId) {
      const previous = roomManager.removeParticipant(currentRoomId, socket.id);

      socket.leave(currentRoomId);

      socket.data.roomId = null;

      if (previous && !previous.roomEmpty) {
        emitRoomState(currentRoomId);
      }
    }

    const user = roomManager.addParticipant(roomId, socket.id, username);

    if (!user) {
      return sendError(socket, "Unable to join room.");
    }

    socket.join(roomId);

    socket.data.roomId = roomId;

    emitRoomState(roomId);
  });

  /*
   * PLAY
   *
   * ONLY explicit UI actions
   * should emit this.
   */
  socket.on("play", (payload: PlaybackPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host", "Moderator"])) {
      return sendError(socket, "Only Host or Moderator can play the video.");
    }

    const time = normalizeTime(payload?.time);

    if (time === null) {
      return sendError(socket, "Invalid playback time.");
    }

    roomManager.updatePlayback(roomId, "playing", time);

    emitRoomState(roomId);
  });

  /*
   * PAUSE
   *
   * ONLY explicit UI actions
   * should emit this.
   */
  socket.on("pause", (payload: PlaybackPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host", "Moderator"])) {
      return sendError(socket, "Only Host or Moderator can pause the video.");
    }

    const time = normalizeTime(payload?.time);

    if (time === null) {
      return sendError(socket, "Invalid playback time.");
    }

    roomManager.updatePlayback(roomId, "paused", time);

    emitRoomState(roomId);
  });

  /*
   * SEEK
   */
  socket.on("seek", (payload: PlaybackPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host", "Moderator"])) {
      return sendError(socket, "Only Host or Moderator can seek the video.");
    }

    const time = normalizeTime(payload?.time);

    if (time === null) {
      return sendError(socket, "Invalid seek time.");
    }

    const room = roomManager.getRoom(roomId);

    if (!room) {
      return;
    }

    /*
     * Seek preserves whether the
     * room was playing or paused.
     */
    roomManager.updatePlayback(roomId, room.playbackState, time);

    emitRoomState(roomId);
  });

  /*
   * CHANGE VIDEO
   */
  socket.on("change_video", (payload: ChangeVideoPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host", "Moderator"])) {
      return sendError(socket, "Only Host or Moderator can change the video.");
    }

    const videoId = extractYouTubeId(payload?.videoId);

    if (!videoId) {
      return sendError(socket, "Invalid YouTube video URL or ID.");
    }

    roomManager.updateVideo(roomId, videoId);

    emitRoomState(roomId);
  });

  /*
   * ROLE CHANGE
   *
   * This MUST NOT modify playback.
   */
  socket.on("assign_role", (payload: AssignRolePayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host"])) {
      return sendError(socket, "Only Host can assign roles.");
    }

    if (
      payload?.newRole !== "Moderator" &&
      payload?.newRole !== "Participant"
    ) {
      return sendError(
        socket,
        "Only Moderator or Participant roles can be assigned.",
      );
    }

    if (payload.targetSocketId === socket.id) {
      return sendError(socket, "You cannot change your own Host role.");
    }

    const room = roomManager.assignRole(
      roomId,
      payload.targetSocketId,
      payload.newRole,
    );

    if (!room) {
      return sendError(
        socket,
        "Participant not found or role change is not allowed.",
      );
    }

    /*
     * Only participant metadata changed.
     *
     * Playback state remains exactly
     * what it was.
     */
    emitRoomState(roomId);
  });

  /*
   * TRANSFER HOST
   */
  socket.on("transfer_host", (payload: TransferHostPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host"])) {
      return sendError(socket, "Only Host can transfer ownership.");
    }

    const room = roomManager.transferHost(
      roomId,
      socket.id,
      payload.targetSocketId,
    );

    if (!room) {
      return sendError(socket, "Unable to transfer Host role.");
    }

    emitRoomState(roomId);
  });

  /*
   * REMOVE PARTICIPANT
   */
  socket.on("remove_participant", (payload: RemoveParticipantPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host"])) {
      return sendError(socket, "Only Host can remove participants.");
    }

    if (payload.targetSocketId === socket.id) {
      return sendError(socket, "You cannot remove yourself.");
    }

    const target = roomManager.getParticipant(roomId, payload.targetSocketId);

    if (!target) {
      return sendError(socket, "Participant not found in this room.");
    }

    const targetSocket = io.sockets.sockets.get(payload.targetSocketId);

    const result = roomManager.removeParticipant(
      roomId,
      payload.targetSocketId,
    );

    if (!result) {
      return sendError(socket, "Unable to remove participant.");
    }

    targetSocket?.leave(roomId);

    targetSocket?.emit("kicked", "You were removed from the room by the Host.");

    if (!result.roomEmpty) {
      emitRoomState(roomId);
    }
  });

  /*
   * PARTICIPANT REQUESTS
   *
   * Participants cannot execute playback changes directly.
   * They create a pending request which Host/Moderator can
   * approve or reject.
   */
  socket.on("create_request", (payload: CreateRequestPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (roomManager.hasPermission(roomId, socket.id, ["Host", "Moderator"])) {
      return sendError(socket, "Host and Moderator do not need to request changes.");
    }

    const type = payload?.type;

    if (
      type !== "play" &&
      type !== "pause" &&
      type !== "seek" &&
      type !== "change_video"
    ) {
      return sendError(socket, "Invalid request type.");
    }

    let time: number | undefined;
    let videoId: string | undefined;

    if (type === "seek") {
      time = normalizeTime(payload?.time) ?? undefined;

      if (time === undefined) {
        return sendError(socket, "Enter a valid seek time.");
      }
    }

    if (type === "change_video") {
      videoId = extractYouTubeId(payload?.videoId) ?? undefined;

      if (!videoId) {
        return sendError(socket, "Enter a valid YouTube URL or video ID.");
      }
    }

    const participant = roomManager.getParticipant(roomId, socket.id);

    if (!participant) {
      return;
    }

    const request = roomManager.addRequest(
      roomId,
      socket.id,
      participant.username,
      type,
      time,
      videoId,
    );

    if (!request) {
      return sendError(
        socket,
        "You already have a pending request. Wait for it to be handled first.",
      );
    }

    emitRoomState(roomId);
  });

  socket.on("resolve_request", (payload: ResolveRequestPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    if (!roomManager.hasPermission(roomId, socket.id, ["Host", "Moderator"])) {
      return sendError(socket, "Only Host or Moderator can handle requests.");
    }

    if (typeof payload?.approved !== "boolean") {
      return sendError(socket, "Invalid request decision.");
    }

    const request = roomManager.getRequest(roomId, payload.requestId);

    if (!request) {
      return sendError(socket, "Request is no longer available.");
    }

    const requester = roomManager.getParticipant(roomId, request.socketId);

    if (!requester) {
      roomManager.removeRequest(roomId, request.id);
      emitRoomState(roomId);
      return sendError(socket, "The requester is no longer in the room.");
    }

    if (payload.approved) {
      switch (request.type) {
        case "play": {
          const snapshot = roomManager.getSnapshot(roomId);
          roomManager.updatePlayback(roomId, "playing", snapshot?.currentTime ?? 0);
          break;
        }

        case "pause": {
          const snapshot = roomManager.getSnapshot(roomId);
          roomManager.updatePlayback(roomId, "paused", snapshot?.currentTime ?? 0);
          break;
        }

        case "seek": {
          const room = roomManager.getRoom(roomId);

          if (!room || request.time === undefined) {
            return sendError(socket, "This request contains an invalid seek time.");
          }

          roomManager.updatePlayback(roomId, room.playbackState, request.time);
          break;
        }

        case "change_video": {
          if (!request.videoId) {
            return sendError(socket, "This request contains an invalid video.");
          }

          roomManager.updateVideo(roomId, request.videoId);
          break;
        }
      }
    }

    roomManager.removeRequest(roomId, request.id);

    const requesterSocket = io.sockets.sockets.get(request.socketId);

    requesterSocket?.emit("request_resolved", {
      requestId: request.id,
      approved: payload.approved,
      message: payload.approved
        ? "Your request was approved."
        : "Your request was rejected.",
    });

    emitRoomState(roomId);
  });

  /*
   * CHAT
   */
  socket.on("send_chat", (payload: SendChatPayload) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    const text = normalizeChatMessage(payload?.text);

    if (!text) {
      return sendError(socket, "Chat message cannot be empty.");
    }

    const participant = roomManager.getParticipant(roomId, socket.id);

    if (!participant) {
      return;
    }

    const message = roomManager.addMessage(
      roomId,
      socket.id,
      participant.username,
      text,
    );

    if (!message) {
      return sendError(socket, "Unable to send message.");
    }

    io.to(roomId).emit("chat_message", message);
  });

  /*
   * LEAVE
   */
  socket.on("leave_room", (payload: { roomId: string }) => {
    const roomId = requireMember(socket, payload?.roomId);

    if (!roomId) {
      return;
    }

    const result = roomManager.removeParticipant(roomId, socket.id);

    socket.leave(roomId);

    socket.data.roomId = null;

    if (result && !result.roomEmpty) {
      emitRoomState(roomId);
    }
  });

  /*
   * DISCONNECT
   */
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId as string | null;

    if (!roomId) {
      return;
    }

    const result = roomManager.removeParticipant(roomId, socket.id);

    if (result && !result.roomEmpty) {
      emitRoomState(roomId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
