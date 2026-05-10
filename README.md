# WebRTC Demo

Production smoke demo for `@yrzhao/aves-core` and `@yrzhao/aves-node` `1.1.0`.

The demo proves the ecosystem end to end: a Node.js signaling server, a Svelte browser client, room creation, peer state diagnostics, chat, media controls, file transfer, server health, and server metrics.

## Features

- Room creation and invite links.
- WebRTC DataChannel chat.
- Voice, video, and screen-share controls.
- File transfer with progress.
- Participant list and host-controlled room behavior.
- Validation console for peer connection, DataChannel, media, file, and SDK events.
- HTTP diagnostics endpoints: `/health`, `/metrics`, and `/rooms`.
- Playwright smoke tests for release verification.

## Start Locally

Build the libraries first:

```bash
cd aves-core
npm install
npm run build

cd ../aves-node
npm install
npm run build
```

Start the signaling server:

```bash
cd ../webrtc-demo/server
npm install
npm run dev
```

Start the web client in another terminal:

```bash
cd ../web
npm install
npm run dev
```

Open `http://localhost:5173`.

## Manual Smoke Test

1. Open two browser windows.
2. Create a room in the first window.
3. Copy the invite link into the second window.
4. Send chat messages both ways.
5. Open the validation console and check peer/DataChannel state.
6. Send a small file.
7. Refresh one window and confirm the room restores without permanent user loss.

## Diagnostics Endpoints

With the server running on port `8080`:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/metrics
curl http://localhost:8080/rooms
```

`/metrics` includes active connections, rooms, participants, pending disconnects, rate limiter bucket count, storage type, uptime, reconnect grace, room timeout, and max message size.

## Playwright Smoke Tests

Start the demo server first:

```bash
cd webrtc-demo/server
npm run dev
```

Then run the web smoke tests:

```bash
cd ../web
npm run test:e2e
```

The Playwright config launches Chromium with fake media flags:

```text
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
```

## Environment

Web client:

```env
VITE_SIGNALING_URL=ws://localhost:8080
```

Server:

```env
PORT=8080
ROOM_TIMEOUT_MS=300000
MAX_MESSAGE_SIZE=262144
RATE_LIMIT_MAX_TOKENS=120
RATE_LIMIT_REFILL_RATE=30
```

## Production Reminder

This demo is intentionally convenient for local verification. For production, use HTTPS/WSS, configure TURN, enforce product authentication, tune limits, and monitor `aves-node` metrics.
