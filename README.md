# Zoria.net client

The agent listens to the Zoria.net ether, verifies the station's seal, and
registers the participant at the moment the window opens.

## Requirements

Node.js 22.18 or newer. No dependencies — no build step either.

## Running the agent

```bash
npm install
ZORIA_API=https://stand.zoria.net/api/v1 \
ZORIA_KEY_FINGERPRINT=<fingerprint from the spec, section 3> \
npm run agent
```

The production server is `https://zoria.net/api/v1` (the default); the
learning stand is `https://stand.zoria.net/api/v1`. The address is set only
through an environment variable: it is never hard-coded.

## The client

The client is the radio room: press the red button, then type commands into the terminal.

Build it once, then the agent serves it from its own port:

```bash
npm run build:client
npm run agent
```

Open the address the agent prints, `http://127.0.0.1:4711` by default.

For development, run the agent against the practice stand with a separate state file, then start Vite, which forwards API requests to the agent:

```bash
ZORIA_API=https://stand.zoria.net/api/v1 \
ZORIA_STATE=.zoria-agent/dev-state.json \
ZORIA_KEY_FINGERPRINT=d8860c95b821dc56c0f44a2f0b22f3e157af83bfaed9e55206ac5109d4230a1a \
npm run agent
npm run dev:client
```

Never run the agent against the live server with the default state file while developing: it holds the real application and will register it when the window opens.

`npm run encode:photo` re-encodes `assets-src/room-master.png` into `src/client/assets/room.webp`.

## Environment variables

| Variable | Default | What it sets |
|---|---|---|
| `ZORIA_API` | `https://zoria.net/api/v1` | API address |
| `ZORIA_KEY_FINGERPRINT` | — (required) | station key fingerprint to verify against |
| `ZORIA_STATE` | `.zoria-agent/state.json` | state file |
| `ZORIA_LOCAL_PORT` | `4711` | local API port |

## Local API

Listens only on `127.0.0.1`.

| Route | What it does |
|---|---|
| `GET /state` | a snapshot of the ether and registration state |
| `GET /events` | the same snapshot as an SSE stream |
| `POST /application` | stage an application |
| `POST /invitation` | deliver the invitation code on the fly |

The invitation code can be added at any moment, including in the middle of
the window: the agent sends the staged application immediately, without
waiting for the next frame.

## Tests

```bash
npm test
```

All tests run without the network: the reference frames and the learning
key are published in the client spec, and a local stand-in server is used
in place of the real one.
