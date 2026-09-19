# YouTube Watch Party

A real-time YouTube Watch Party application where multiple users can join a room, watch the same YouTube video in sync, chat, and interact through role-based controls.

This project was built as a full-stack internship assignment with a focus on real-time synchronization, WebSocket communication, backend permission enforcement, and a clean collaborative viewing experience.

## Live Demo

### Frontend

https://youtube-watchparty-frontend.vercel.app

### Backend API

https://youtube-watchparty-backend-yld3.onrender.com
 {note:There is no monitoring bot who can keep the render server live after 10min countdown}

### Health Check

https://youtube-watchparty-backend-yld3.onrender.com/health

## Features

### Watch Rooms

- Create a watch party using a YouTube URL or video ID
- Join an existing room using a 6-character room code or shared room link
- Creator automatically becomes **Host**
- New joiners become **Participants**
- Copy room code or shareable room link
- Leave room
- Dedicated **Room not found** state for invalid or expired rooms

### Real-Time YouTube Synchronization

Room playback is synchronized through Socket.IO.

Supported synchronized actions:

- Play
- Pause
- Seek
- Change video
- Replay from the end
- Late joining synchronization

The backend acts as the authoritative source of room playback state. Clients receive room state through `sync_state` rather than independently deciding the room state.

The synchronization model also uses:

- Server timestamps
- State revision numbers
- Drift correction
- Stale snapshot protection

Local YouTube player events are not blindly treated as authoritative room commands, which prevents browser/player lifecycle events from unexpectedly pausing or changing playback for everyone.

### Role-Based Access Control

| Role            | Permissions                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| **Host**        | Play/pause, seek, change video, assign roles, remove participants, transfer Host |
| **Moderator**   | Play/pause, seek, change video, approve/reject participant requests              |
| **Participant** | Watch, chat, share links, submit playback/video requests                         |

Permissions are validated on the **backend**. Hiding controls in the frontend is not treated as authorization.

### Participant Requests

Participants cannot directly modify shared playback.

Instead, they can submit requests for:

- Play
- Pause
- Jump/seek to a timestamp
- Change the current YouTube video

Host or Moderator can approve or reject requests. Approved requests are executed through the same server-authoritative playback flow used by normal Host/Moderator controls.

### Participant Management

The Host can:

- Promote a Participant to Moderator
- Demote a Moderator to Participant
- Remove participants
- Transfer Host ownership

Role changes are synchronized without modifying the current playback state.

### Chat

Each room includes real-time chat.

Features include:

- Real-time messages
- YouTube link detection
- Open shared YouTube links
- Host/Moderator `Play in party` action
- Frontend-only deterministic username colors
- Matching username colors between participant list, chat, and requests

Username colors are purely visual and do not need to be synchronized through the backend.

### Fullscreen Watch Party

The application includes a custom fullscreen mode for the **entire watch-party interface**, rather than fullscreening only the YouTube iframe.

Fullscreen keeps:

- Video
- Custom player controls
- Participant list
- Chat
- Requests

inside the same fullscreen experience.

### UI / UX

The interface uses a dark-first visual system with:

- Minimal glassmorphism
- Modern dark surfaces
- Subtle accent colors
- Responsive layout
- Compact player controls
- Role badges
- Connection feedback
- Error states
- Copy feedback
- Request feedback
- Responsive sidebar behavior

## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Socket.IO Client
- YouTube IFrame API through `react-youtube`
- Tailwind CSS / custom styling

### Backend

- Node.js
- Express
- TypeScript
- Socket.IO

### Data Storage

The MVP intentionally keeps rooms, messages, requests, participants, and playback state **in memory**.

No database is required for the current assignment scope.

As a result:

- Rooms are temporary
- Server restarts clear existing rooms
- The application currently targets a single backend instance

Persistent rooms, authentication, Redis Pub/Sub, and horizontal scaling are possible future improvements.

## Architecture

```text
                         ┌────────────────────┐
                         │     Next.js UI     │
                         │                    │
                         │ Video / Chat /     │
                         │ Roles / Requests   │
                         └─────────┬──────────┘
                                   │
                         HTTP + Socket.IO
                                   │
                         ┌─────────▼──────────┐
                         │ Express + Socket.IO│
                         │      Backend       │
                         └─────────┬──────────┘
                                   │
                         permission validation
                                   │
                         ┌─────────▼──────────┐
                         │    RoomManager     │
                         │                    │
                         │ participants       │
                         │ roles              │
                         │ videoId            │
                         │ playback state     │
                         │ current time       │
                         │ revision           │
                         │ messages           │
                         │ requests           │
                         └─────────┬──────────┘
                                   │
                              sync_state
                                   │
                 ┌─────────────────┼─────────────────┐
                 ▼                 ▼                 ▼
               Host            Moderator         Participant
```

## Synchronization Flow

For example, when a Host pauses:

```text
Host clicks Pause
       ↓
Client emits pause
       ↓
Socket.IO server receives event
       ↓
Backend verifies role
       ↓
RoomManager updates authoritative state
       ↓
revision increments
       ↓
sync_state broadcast
       ↓
All connected clients apply the new state
```

Participants cannot bypass this flow because restricted events are validated by the backend.

## Important Socket Events

The application uses events including:

```text
join_room
leave_room
sync_state

play
pause
seek
change_video

assign_role
remove_participant
transfer_host

send_chat

submit_request
approve_request
reject_request
```

The exact implementation is defined in the backend Socket.IO handlers.

## Project Structure

```text
youtube-watchparty/
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   └── room/
│   │       └── [roomId]/
│   │           └── page.tsx
│   ├── components/
│   ├── hooks/
│   ├── types/
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── roomManager.ts
│   │   └── types.ts
│   ├── tsconfig.json
│   └── package.json
│
└── README.md
```

## Local Development

### Prerequisites

Install:

- Node.js
- npm

### 1. Backend

```bash
cd backend
npm install
```

Create:

```text
backend/.env
```

with:

```env
PORT=5000
FRONTEND_ORIGIN=http://localhost:3000
```

Start development server:

```bash
npm run dev
```

The backend runs on:

```text
http://localhost:5000
```

### 2. Frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create:

```text
frontend/.env.local
```

with:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Production Build

Before deployment, verify both applications build successfully.

### Backend

```bash
cd backend
npm run build
npm start
```

### Frontend

```bash
cd frontend
npm run build
npm start
```

## Deployment

The production setup is:

```text
Frontend → Vercel
Backend  → Render Web Service
```

### Render — Backend

Root Directory:

```text
backend
```

Build Command:

```bash
npm install && npm run build
```

Start Command:

```bash
npm start
```

Environment variable:

```env
FRONTEND_ORIGIN=https://youtube-watchparty-frontend.vercel.app
```

Do not manually hard-code the Render `PORT`; the backend reads the platform-provided `PORT` value.

### Vercel — Frontend

Root Directory:

```text
frontend
```

Framework:

```text
Next.js
```

Leave the default Vercel Build Command, Output Directory, Install Command, and Development Command unless Vercel specifically requires an override.

Production environment variables:

```env
NEXT_PUBLIC_API_URL=https://youtube-watchparty-backend-yld3.onrender.com
NEXT_PUBLIC_SOCKET_URL=https://youtube-watchparty-backend-yld3.onrender.com
```

After changing environment variables, redeploy the Vercel production deployment because the `NEXT_PUBLIC_*` values are included during the frontend build.

## Live Application

**Frontend:** https://youtube-watchparty-frontend.vercel.app

**Backend:** https://youtube-watchparty-backend-yld3.onrender.com

**Repository:** Add the final GitHub repository URL here.

## Production Acceptance Checklist

Before submission, verify the following using at least two separate browser sessions.

- [ ] Create a room
- [ ] Creator becomes Host
- [ ] Join using room code
- [ ] Join using shared link
- [ ] Joiner becomes Participant
- [ ] Participant list displays correct roles
- [ ] Host play synchronizes
- [ ] Host pause synchronizes
- [ ] Host seek synchronizes
- [ ] Host video change synchronizes
- [ ] Late joiner receives current playback state
- [ ] Host can promote Participant to Moderator
- [ ] Moderator can control playback
- [ ] Host can demote Moderator without interrupting playback
- [ ] Host can remove participant
- [ ] Host transfer works
- [ ] Participant cannot directly perform restricted actions
- [ ] Participant can submit requests
- [ ] Host/Moderator can approve requests
- [ ] Host/Moderator can reject requests
- [ ] Approved request synchronizes for everyone
- [ ] Chat works between browsers
- [ ] Shared YouTube links work
- [ ] Username colors match between participant list/chat/request UI
- [ ] Local volume does not affect other users
- [ ] Fullscreen keeps the sidebar visible
- [ ] Invalid room shows `Room not found`
- [ ] Tab/window switching does not unexpectedly pause playback
- [ ] Reconnect behavior works
- [ ] Replay from video end synchronizes
- [ ] Backend health endpoint works publicly
- [ ] Socket.IO connects from deployed frontend
- [ ] Production environment variables are configured correctly

## Assignment Coverage

The implementation covers the core assignment requirements:

- Real-time synchronization
- Room-based watch parties
- YouTube integration
- WebSocket-based communication
- Host / Moderator / Participant roles
- Backend role enforcement
- Host role assignment
- Participant removal
- Play/pause synchronization
- Seek synchronization
- Video-change synchronization
- Participant change-request/approval flow
- Participant list with roles

The project additionally includes chat, Host transfer, fullscreen watch-party mode, improved error states, and a polished responsive interface.

## Current Limitations / Trade-offs

This version intentionally prioritizes the assignment and MVP scope.

### In-memory state

Room data is not persisted. Restarting the backend removes active rooms.

### Single backend instance

The current room state exists in process memory, so the application is designed for one Socket.IO backend instance.

Horizontal scaling would require shared state/message infrastructure such as Redis and a Socket.IO Redis adapter.

### No authentication

Users currently join with a username rather than a persistent authenticated account.

### Temporary chat/history

Messages and requests exist only for the lifetime of the room/backend process.

These are deliberate MVP trade-offs rather than requirements for the current assignment.

## Future Improvements

Possible extensions include:

- Persistent rooms
- PostgreSQL or MongoDB
- Authentication
- Redis Pub/Sub
- Socket.IO Redis Adapter
- Horizontal scaling
- Reactions
- Room history
- Reconnect/session restoration
- More advanced moderation controls

## Code Walkthrough Notes

Be prepared to explain:

1. Why the backend is authoritative for playback state.
2. How Socket.IO enables bidirectional real-time communication.
3. How backend role validation prevents Participant actions.
4. Why YouTube player lifecycle events are not automatically treated as room commands.
5. How timestamps and revisions reduce synchronization errors.
6. How late joiners receive the current room state.
7. How Participant requests are approved through the same authoritative action path.
8. Why volume and username colors are local-only.
9. Why room state is in memory for the MVP.
10. What would need to change to support multiple backend instances.

## License

Created for an internship assignment / technical evaluation.
