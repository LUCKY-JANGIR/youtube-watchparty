# 🎬 YouTube Watch Party

A real-time YouTube Watch Party application where multiple users can join a room and watch videos together with synchronized playback.

The application supports room-based watch parties, real-time playback synchronization, role-based permissions, participant requests, chat, and a responsive fullscreen viewing experience.

---

## ✨ Features

### 🎥 Real-Time Watch Party

- Create a watch party room
- Join using a room code or shared room link
- Synchronized YouTube playback
- Synchronized play / pause
- Synchronized seeking
- Synchronized video changes
- Late-joining users receive the current room state
- Replay synchronization after a video ends

### 👥 Role-Based Access Control

The application supports three roles:

| Role            | Permissions                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| **Host**        | Play/pause, seek, change video, assign roles, remove participants, transfer Host |
| **Moderator**   | Play/pause, seek, change video, approve/reject participant requests              |
| **Participant** | Watch, chat, share links, and request playback changes                           |

Permissions are validated on the **backend**, rather than relying only on disabled or hidden frontend controls.

The first user in a newly created room becomes the **Host**, while users joining afterward become **Participants** by default.

---

## 🙋 Participant Request System

Participants cannot directly modify the shared playback state.

Instead, they can request:

- Play
- Pause
- Seek to a timestamp
- Change the current YouTube video

The request appears in the room's **Requests** panel.

A Host or Moderator can then:

- Approve the request
- Reject the request

Approved requests are processed through the same server-authoritative playback system used by Host and Moderator controls.

---

## 💬 Real-Time Chat

Each room contains a real-time chat system powered by Socket.IO.

Features include:

- Instant room messages
- Username identification
- Consistent frontend-generated username colors
- YouTube link detection
- Ability for authorized users to play a shared YouTube link in the party
- Recent message history while the room exists

Username colors are generated locally for visual distinction and do not affect synchronized room state.

---

## 🖥️ Fullscreen Watch Party

The application includes a custom fullscreen experience.

Unlike YouTube's native iframe fullscreen mode, the entire Watch Party interface enters fullscreen so users can continue seeing:

- Video
- Player controls
- Participants
- Chat
- Requests

The layout is designed to remain within the viewport while fullscreen.

---

## 🎨 UI / UX

The interface uses a dark-first modern design with:

- Minimal glassmorphism
- Responsive layouts
- Compact video controls
- Role badges
- Participant identification
- Connection status
- Loading and error states
- Copy room code
- Copy room link
- Room-not-found screen
- Fullscreen viewing

---

# 🛠️ Tech Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- React YouTube
- Socket.IO Client

## Backend

- Node.js
- Express
- TypeScript
- Socket.IO

## Video

- YouTube IFrame Player API

## Deployment

- Vercel — Frontend
- Render — Backend

Room state is currently stored **in memory**.

Database persistence is intentionally not required for the MVP.

---

# 🏗️ Architecture

The backend acts as the authoritative source for shared room state.

```text
             Host / Moderator
                    │
                    │
        play / pause / seek /
            change video
                    │
                    ▼
             Socket.IO Server
                    │
                    │
          Permission Validation
                    │
                    ▼
               RoomManager
                    │
                    │
          Authoritative State
                    │
                    ▼
               sync_state
              /     │      \
             /      │       \
            ▼       ▼        ▼
          Host   Moderator Participant
```
