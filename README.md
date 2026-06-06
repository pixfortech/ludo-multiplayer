# Ludo Multiplayer

Server-authoritative online multiplayer Ludo game built with React + Vite + TypeScript (client) and Node.js + Express + Socket.IO + TypeScript (server).

## Quick Start

```bash
npm run install:all
npm run dev        # starts both client (5173) and server (3001)
npm run test       # runs server-side game engine unit tests
```

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + Socket.IO client
- **Backend:** Node.js + Express + Socket.IO + TypeScript (authoritative game engine)
- **Tests:** Vitest

## Architecture

The backend is the single source of truth. The frontend only sends action requests (roll dice, move token, join room). The server validates every action and broadcasts authoritative state.

## Phase 1 Status

- [x] Project structure
- [x] TypeScript configs
- [x] Game types
- [x] Board configuration
- [x] Game engine core
- [x] Move validator
- [x] Socket.IO handlers
- [x] Unit tests (11 core rules)
- [x] React client shell with Socket.IO integration
