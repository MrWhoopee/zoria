# Zoria.net client

The agent listens to the Zoria.net ether, verifies the station's seal, and
registers the participant at the moment the window opens.

## Requirements

Node.js 22.18 or newer. The agent itself has no dependencies; React and Vite are needed only to build the client.

## Running the agent

```bash
npm ci
npm run build:client
ZORIA_KEY_FINGERPRINT=dcb3155eb8f2538d466a294315e984fa9f67f703556c5e276d5b3afc88895696 npm run agent
```

On Windows PowerShell:

```powershell
npm ci
npm run build:client
$env:ZORIA_KEY_FINGERPRINT='dcb3155eb8f2538d466a294315e984fa9f67f703556c5e276d5b3afc88895696'
npm run agent
```

The fingerprint is the SHA-256 of the station's public key, published in part 1 of the spec, section 3. It is public; the agent refuses a key that does not match it.

The production server is `https://zoria.net/api/v1` (the default); the
learning stand is `https://stand.zoria.net/api/v1` and signs with its own key,
`d8860c95b821dc56c0f44a2f0b22f3e157af83bfaed9e55206ac5109d4230a1a`. The
address is set only through an environment variable: it is never hard-coded.

## The client

The client is the radio room: press the red button, then type commands into the terminal.

The agent started as above serves the built client from its own port. Open the address it prints, `http://127.0.0.1:4711` by default. Without the agent the terminal shows `AGENT OFFLINE`.

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

## Session

After registration the agent keeps the session itself: it signs in with the stored application when the token is missing, ends in less than ten minutes, or the server answers 401, and retries the request once. Wrong credentials stop automatic sign-in until `LOGIN`. `LOGOUT` ends the session on the server and wipes the token; a restart of the agent signs in again.

The agent polls `/me/summary` every 15 seconds and rereads only what moved: letters, parts of the task, news, and the repository status.

## Terminal commands

| Command | What it shows |
|---|---|
| `STATUS` | ether, session, new mail, parts, repository |
| `PARTS` / `ACK N` | released parts / acknowledge receipt of part N |
| `MAIL` / `MAIL N` | letters / letter N in full (opening marks it read) |
| `NEWS` / `NEWS N` | news / item N in full |
| `REPO` | repository, who to invite, what to put in `.zoria`, access status |
| `LETTER` | the keeper's letter |
| `ROLL` | the roll call, your own line marked |
| `LOGIN` / `LOGOUT` | sign in again / end the session |
| `HELP` / `SHUTDOWN` | command list / power off |

Long output scrolls with ↑ ↓, PgUp PgDn, Home End and the mouse wheel. Esc leaves the text, a second Esc steps back from the terminal into the room; click the screen or press Enter to come back. In the room, the notebook on the desk holds the full text of every part.

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
| `GET /account/stages/:id` | the full text of a released part |
| `POST /account/stages/:id/ack` | acknowledge receipt of a part |
| `POST /account/inbox/:id/read` | mark a letter as read |
| `POST /account/login` | sign in again with the stored application |
| `POST /account/logout` | end the session on the server and stop automatic sign-in |
| `POST /account/roll` | the sealed roll call, at most once a minute |

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
