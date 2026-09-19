"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomManager = void 0;
const node_crypto_1 = require("node:crypto");
const validation_1 = require("./validation");
const DEFAULT_VIDEO_ID = "dQw4w9WgXcQ";
const MAX_MESSAGES = 100;
const MAX_REQUESTS = 50;
class RoomManager {
    rooms = new Map();
    createRoom(initialVideoId = DEFAULT_VIDEO_ID) {
        const videoId = (0, validation_1.extractYouTubeId)(initialVideoId) ?? DEFAULT_VIDEO_ID;
        let roomId = "";
        do {
            roomId = (0, node_crypto_1.randomBytes)(4).toString("hex").slice(0, 6).toUpperCase();
        } while (this.rooms.has(roomId));
        const now = Date.now();
        const room = {
            roomId,
            videoId,
            playbackState: "paused",
            currentTime: 0,
            updatedAt: now,
            revision: 0,
            participants: [],
            messages: [],
            requests: [],
        };
        this.rooms.set(roomId, room);
        return room;
    }
    getRoom(roomId) {
        const normalized = (0, validation_1.normalizeRoomId)(roomId);
        return normalized ? this.rooms.get(normalized) : undefined;
    }
    getSnapshot(roomId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return undefined;
        }
        const serverTime = Date.now();
        let currentTime = room.currentTime;
        /*
         * Do NOT continuously write this
         * back into room.currentTime.
         *
         * We simply extrapolate from the
         * authoritative timestamp.
         */
        if (room.playbackState === "playing") {
            currentTime += Math.max(0, serverTime - room.updatedAt) / 1000;
        }
        return {
            roomId: room.roomId,
            videoId: room.videoId,
            playbackState: room.playbackState,
            currentTime: Math.max(0, currentTime),
            updatedAt: room.updatedAt,
            revision: room.revision,
            participants: room.participants.map((participant) => ({
                ...participant,
            })),
            messages: room.messages.map((message) => ({
                ...message,
            })),
            requests: room.requests.map((request) => ({
                ...request,
            })),
            serverTime,
        };
    }
    getParticipant(roomId, socketId) {
        return this.getRoom(roomId)?.participants.find((participant) => participant.socketId === socketId);
    }
    addParticipant(roomId, socketId, username) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        const existing = room.participants.find((participant) => participant.socketId === socketId);
        if (existing) {
            existing.username = username;
            return existing;
        }
        const role = room.participants.length === 0 ? "Host" : "Participant";
        const participant = {
            socketId,
            username,
            role,
        };
        room.participants.push(participant);
        return participant;
    }
    removeParticipant(roomId, socketId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        const index = room.participants.findIndex((participant) => participant.socketId === socketId);
        if (index === -1) {
            return null;
        }
        const [removed] = room.participants.splice(index, 1);
        if (!removed) {
            return null;
        }
        this.removeRequestsForParticipant(roomId, socketId);
        if (room.participants.length === 0) {
            this.rooms.delete(roomId);
            return {
                roomId,
                username: removed.username,
                roomEmpty: true,
                promotedSocketId: undefined,
            };
        }
        let promotedSocketId;
        /*
         * Only Host removal changes
         * ownership.
         *
         * Moderator/Participant removal
         * must NEVER touch playback.
         */
        if (removed.role === "Host") {
            const nextHost = room.participants[0];
            if (nextHost) {
                nextHost.role = "Host";
                promotedSocketId = nextHost.socketId;
            }
        }
        return {
            roomId,
            username: removed.username,
            roomEmpty: false,
            promotedSocketId,
        };
    }
    hasPermission(roomId, socketId, allowedRoles) {
        const participant = this.getParticipant(roomId, socketId);
        return !!participant && allowedRoles.includes(participant.role);
    }
    updatePlayback(roomId, state, currentTime) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        room.playbackState = state;
        room.currentTime = Math.max(0, currentTime);
        room.updatedAt = Date.now();
        /*
         * IMPORTANT:
         *
         * Only explicit authoritative
         * playback commands increment
         * the revision.
         */
        room.revision += 1;
        return room;
    }
    updateVideo(roomId, videoId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        /*
         * Same video:
         *
         * If already playing, do absolutely
         * nothing.
         *
         * This prevents accidental reloads.
         */
        if (room.videoId === videoId) {
            if (room.playbackState === "playing") {
                return room;
            }
            const snapshot = this.getSnapshot(roomId);
            const currentTime = snapshot?.currentTime ?? room.currentTime;
            room.currentTime = Math.max(0, Number.isFinite(currentTime) ? currentTime : 0);
            room.playbackState = "playing";
            room.updatedAt = Date.now();
            room.revision += 1;
            return room;
        }
        /*
         * New video.
         *
         * Always starts from 0.
         */
        room.videoId = videoId;
        room.currentTime = 0;
        room.playbackState = "playing";
        room.updatedAt = Date.now();
        room.revision += 1;
        return room;
    }
    assignRole(roomId, targetSocketId, newRole) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        const target = room.participants.find((participant) => participant.socketId === targetSocketId);
        if (!target || target.role === "Host") {
            return null;
        }
        /*
         * ROLE CHANGE ONLY.
         *
         * Deliberately do not touch:
         *
         * - videoId
         * - playbackState
         * - currentTime
         * - updatedAt
         * - revision
         */
        target.role = newRole;
        return room;
    }
    transferHost(roomId, currentHostId, targetSocketId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        const currentHost = room.participants.find((participant) => participant.socketId === currentHostId);
        const target = room.participants.find((participant) => participant.socketId === targetSocketId);
        if (!currentHost ||
            currentHost.role !== "Host" ||
            !target ||
            targetSocketId === currentHostId) {
            return null;
        }
        /*
         * Role change only.
         *
         * Playback remains untouched.
         */
        currentHost.role = "Moderator";
        target.role = "Host";
        return room;
    }
    getRequest(roomId, requestId) {
        return this.getRoom(roomId)?.requests.find((request) => request.id === requestId);
    }
    addRequest(roomId, socketId, username, type, time, videoId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        const existing = room.requests.find((request) => request.socketId === socketId);
        if (existing) {
            return null;
        }
        const request = {
            id: (0, node_crypto_1.randomUUID)(),
            socketId,
            username,
            type,
            ...(typeof time === "number" ? { time } : {}),
            ...(videoId ? { videoId } : {}),
            createdAt: Date.now(),
        };
        room.requests.push(request);
        if (room.requests.length > MAX_REQUESTS) {
            room.requests.splice(0, room.requests.length - MAX_REQUESTS);
        }
        return request;
    }
    removeRequest(roomId, requestId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        const index = room.requests.findIndex((request) => request.id === requestId);
        if (index === -1) {
            return null;
        }
        const [removed] = room.requests.splice(index, 1);
        return removed ?? null;
    }
    removeRequestsForParticipant(roomId, socketId) {
        const room = this.getRoom(roomId);
        if (!room) {
            return;
        }
        room.requests = room.requests.filter((request) => request.socketId !== socketId);
    }
    addMessage(roomId, socketId, username, text) {
        const room = this.getRoom(roomId);
        if (!room) {
            return null;
        }
        const message = {
            id: (0, node_crypto_1.randomUUID)(),
            socketId,
            username,
            text,
            createdAt: Date.now(),
        };
        room.messages.push(message);
        if (room.messages.length > MAX_MESSAGES) {
            room.messages.splice(0, room.messages.length - MAX_MESSAGES);
        }
        return message;
    }
}
exports.roomManager = new RoomManager();
