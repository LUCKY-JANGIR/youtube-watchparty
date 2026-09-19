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

export interface SyncState {
  roomId: string;
  videoId: string;
  playbackState: PlaybackState;
  currentTime: number;
  updatedAt: number;
  revision: number;
  serverTime: number;
  participants: Participant[];
  messages: ChatMessage[];
  requests: RoomRequest[];
  role: Role;
}
