export type Role = "Host" | "Moderator" | "Participant";

export type PlaybackState = "playing" | "paused";

export type RequestType = "play" | "pause" | "seek" | "change_video";

export interface Participant {
  socketId: string;
  username: string;
  role: Role;
}

export interface ChatMessage {
  id: string;
  socketId: string;
  username: string;
  text: string;
  createdAt: number;
}

export interface RoomRequest {
  id: string;
  socketId: string;
  username: string;
  type: RequestType;
  time?: number;
  videoId?: string;
  createdAt: number;
}

export interface RoomState {
  roomId: string;
  videoId: string;
  playbackState: PlaybackState;
  currentTime: number;
  updatedAt: number;
  revision: number;
  participants: Participant[];
  messages: ChatMessage[];
  requests: RoomRequest[];
}

export interface RoomSnapshot extends RoomState {
  serverTime: number;
}

export interface JoinRoomPayload {
  roomId: string;
  username: string;
}

export interface PlaybackPayload {
  roomId: string;
  time: number;
}

export interface ChangeVideoPayload {
  roomId: string;
  videoId: string;
}

export interface AssignRolePayload {
  roomId: string;
  targetSocketId: string;
  newRole: Role;
}

export interface RemoveParticipantPayload {
  roomId: string;
  targetSocketId: string;
}

export interface TransferHostPayload {
  roomId: string;
  targetSocketId: string;
}

export interface SendChatPayload {
  roomId: string;
  text: string;
}

export interface CreateRequestPayload {
  roomId: string;
  type: RequestType;
  time?: number;
  videoId?: string;
}

export interface ResolveRequestPayload {
  roomId: string;
  requestId: string;
  approved: boolean;
}
