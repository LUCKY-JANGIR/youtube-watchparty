# YouTube Watch Party

A real-time YouTube watch party built for the internship assignment. Multiple users can join a room, watch the same YouTube video, chat, and use role-based playback controls.

## Stack

- Frontend: Next.js + React + TypeScript
- Backend: Node.js + Express + TypeScript
- Real-time: Socket.IO over WebSockets
- Video: YouTube IFrame Player API via `react-youtube`
- Database: none; room state is intentionally in memory for the MVP

## Features

### Rooms

- Create a watch party with a YouTube URL or video ID
- Join using a 6-character room code or shared room URL
- Invalid/non-existent rooms show a dedicated `Room not found` state
- Copy room code and room link
- Leave a room

### Roles

| Role | Permissions |
| --- | --- |
| Host | Play/pause, seek, change video, assign roles, remove participants, transfer Host |
| Moderator | Play/pause, seek, change video, approve participant requests |
| Participant | Watch, chat, share YouTube links, request playback/video changes |

All sensitive room actions are validated on the backend. Hiding a button in the frontend is not treated as permission enforcement.

### Participant requests

Participants cannot directly change room playback. They can submit a pending request for:

- Play
- Pause
- Jump to a specific time
- Change the current YouTube video

Host or Moderator can approve or reject a pending request. An approved request is executed through the same server-authoritative room-state path used by normal Host/Moderator controls.

## Real-time synchronization

The backend is authoritative for room-level playback state.

```text
Host / Moderator / approved Participant request
                    |
                    | play / pause / seek / change_video
                    v
              Socket.IO server
                    |
                    | permission validation
                    v
               RoomManager
                    |
                    | authoritative state
                    v
                sync_state
             /       |        \
           Host    Moderator  Participant
```

The room state contains:

- `videoId`
- `playbackState`
- `currentTime`
- `updatedAt`
- `revision`
- participants and roles
- chat messages
- pending requests

When a video is playing, the server derives the current timestamp from `updatedAt` rather than writing a playback heartbeat every few seconds. Clients use the server timestamp and revision number to compensate for network delay and reject stale snapshots.

YouTube `PAUSED` events are not treated as authoritative room commands. Only explicit Host/Moderator UI actions, or an approved participant request, can publish a normal play/pause command.

Volume is local to each browser and is never synchronized between participants.

## UI / UX

- Dark-first interface
- Minimal glassmorphism surfaces
- Responsive room layout
- Fullscreen watch-party mode keeps the participant/chat sidebar visible
- Compact player controls designed to fit the viewport
- Deterministic frontend-only username colors are reused between the participant list and chat
- Connection, error, copy, and request feedback states

## Chat + YouTube links

Chat keeps the most recent 100 messages in memory for the current room.

When a message contains a recognized YouTube link:

- everyone can open the link
- Host/Moderator can use `Play in party`
- the normal backend-authorized `change_video` event performs the room change

## Local setup

### Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5000
FRONTEND_ORIGIN=http://localhost:3000
```

Run:

```bash
npm run dev
```

### Frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

Run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Production deployment

The assignment requires a publicly accessible deployment and the live URL in this README.

### Backend on Render

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm run start
```

Environment:

```env
PORT=10000
FRONTEND_ORIGIN=https://YOUR-VERCEL-DOMAIN
```

### Frontend on Vercel

Environment:

```env
NEXT_PUBLIC_API_URL=https://YOUR-RENDER-DOMAIN
NEXT_PUBLIC_SOCKET_URL=https://YOUR-RENDER-DOMAIN
```

Replace the placeholders after deployment and add the live URL below:

```text
Live demo: https://YOUR-VERCEL-DOMAIN
```

## Manual acceptance checklist

### Core assignment

1. Create a room and confirm the creator becomes Host.
2. Join the room from another browser; confirm the joiner becomes Participant.
3. Confirm the participant list displays roles.
4. Host plays and pauses; all clients follow.
5. Host seeks; all clients follow.
6. Host changes the YouTube video; all clients load and start the same video.
7. Host promotes a Participant to Moderator.
8. Moderator can play, pause, seek, and change video.
9. Host demotes the Moderator; playback must continue without an unwanted pause.
10. Host removes a participant.
11. Transfer Host control and confirm the new Host gets Host permissions.
12. Try restricted events as a Participant; the backend must reject them.
13. Participant submits a play/pause/seek/video-change request; Host/Moderator can approve or reject it.
14. Approve a request and confirm the resulting room state is synchronized for everyone.
15. Send chat messages and YouTube links.
16. Change local volume in one browser; verify other browsers are unaffected.
17. Enter a random non-existent room code; confirm the user gets `Room not found` with `Back to Home`.

### Synchronization stress tests

- Late participant joins while the video is playing.
- Host/Moderator role changes while the video is playing.
- Switch browser tabs/windows while watching.
- Temporarily disconnect/reconnect a client.
- Replay a video from the end.
- Perform several play/pause/seek actions in succession.

### Production

- Frontend loads from the public URL.
- Backend `/health` responds publicly.
- Room creation works in production.
- Socket.IO connects from the deployed frontend.
- Create/join/play/pause/seek/change-video/roles work in production.
- README contains the final live URL.

## Assignment alignment

The implementation covers the assignment's required room model, YouTube integration, WebSocket communication, role-based access, playback synchronization, role management, participant removal, and participant change-request workflow. Database persistence and horizontal scaling are intentionally not included because they are listed as optional/bonus directions for the MVP.
