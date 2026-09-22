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
