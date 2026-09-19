"use client";

import { Socket } from "socket.io-client";
import { Participant, Role } from "@/types";
import { getUserColor } from "@/lib/userColors";

interface Props {
  socket: Socket | null;
  roomId: string;
  participants: Participant[];
  currentUserId: string;
  currentUserRole: Role;
}

export default function ParticipantList({
  socket,
  roomId,
  participants,
  currentUserId,
  currentUserRole,
}: Props) {
  const isHost = currentUserRole === "Host";

  const handleRoleChange = (
    targetSocketId: string,
    newRole: "Moderator" | "Participant",
  ) => {
    if (!socket || !isHost) return;
    socket.emit("assign_role", { roomId, targetSocketId, newRole });
  };

  const handleRemoveUser = (targetSocketId: string) => {
    if (!socket || !isHost) return;
    if (!window.confirm("Remove this participant from the room?")) return;
    socket.emit("remove_participant", { roomId, targetSocketId });
  };

  const handleTransferHost = (targetSocketId: string) => {
    if (!socket || !isHost) return;
    if (!window.confirm("Transfer Host control to this participant?")) return;
    socket.emit("transfer_host", { roomId, targetSocketId });
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.035] p-3.5 text-white shadow-[0_20px_70px_rgba(0,0,0,0.2)] backdrop-blur-xl">
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 pb-3">
        <div>
          <h2 className="text-sm font-semibold">Participants</h2>
          <p className="mt-0.5 text-[10px] text-slate-500">Everyone in the room</p>
        </div>
        <span className="rounded-full border border-white/8 bg-white/5 px-2 py-1 text-[10px] text-slate-400">
          {participants.length} online
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-3 pr-1">
        {participants.map((participant) => {
          const isSelf = participant.socketId === currentUserId;
          const nameColor = getUserColor(participant.socketId || participant.username);

          return (
            <div
              key={participant.socketId}
              className="rounded-xl border border-white/6 bg-black/10 p-2.5 transition hover:bg-white/[0.045]"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    color: nameColor,
                    backgroundColor: `${nameColor}16`,
                    border: `1px solid ${nameColor}30`,
                  }}
                >
                  {participant.username.trim().charAt(0).toUpperCase() || "?"}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="truncate text-xs font-semibold"
                      style={{ color: nameColor }}
                    >
                      {participant.username}
                    </p>
                    {isSelf && <span className="text-[9px] text-slate-600">You</span>}
                  </div>

                  <span
                    className={`mt-1 inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      participant.role === "Host"
                        ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
                        : participant.role === "Moderator"
                          ? "border-indigo-400/20 bg-indigo-400/10 text-indigo-300"
                          : "border-white/8 bg-white/5 text-slate-500"
                    }`}
                  >
                    {participant.role}
                  </span>
                </div>
              </div>

              {isHost && !isSelf && (
                <div className="mt-2.5 flex flex-wrap justify-end gap-1.5 border-t border-white/6 pt-2.5">
                  <button
                    type="button"
                    onClick={() => handleTransferHost(participant.socketId)}
                    className="rounded-md border border-amber-400/15 bg-amber-400/5 px-2 py-1 text-[9px] font-semibold text-amber-300 transition hover:bg-amber-400/10"
                  >
                    Transfer
                  </button>

                  {participant.role === "Moderator" ? (
                    <button
                      type="button"
                      onClick={() => handleRoleChange(participant.socketId, "Participant")}
                      className="rounded-md border border-white/8 bg-white/5 px-2 py-1 text-[9px] font-semibold text-slate-300 transition hover:bg-white/10"
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRoleChange(participant.socketId, "Moderator")}
                      className="rounded-md border border-indigo-400/15 bg-indigo-400/5 px-2 py-1 text-[9px] font-semibold text-indigo-300 transition hover:bg-indigo-400/10"
                    >
                      Make Mod
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveUser(participant.socketId)}
                    className="rounded-md border border-rose-400/15 bg-rose-400/5 px-2 py-1 text-[9px] font-semibold text-rose-300 transition hover:bg-rose-400/10"
                  >
                    Kick
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
