// End-to-end smoke test for the game server.
//
// Drives two WebSocket clients through a full 2-round game against the real
// iTunes API and asserts the protocol/state-machine behaves.
//
// The server now requires a verified Supabase token per socket, which these
// raw test clients don't have. Start the server with AUTH_DISABLED=1 so it
// skips verification and assigns each connection a throwaway id, then run this
// with short timers, e.g.:
//   # terminal 1
//   AUTH_DISABLED=1 npm run dev --workspace @ball-knowledge/server
//   # terminal 2
//   TOTAL_ROUNDS=2 COUNTDOWN_MS=400 ROUND_MS=2500 node scripts/smoke.mjs
//
// Test oracle: since the MVP has no audio proxy, previewUrl maps 1:1 to a
// title. The test fetches that mapping itself to submit a correct guess.

import { WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 4000);
const URL = `ws://localhost:${PORT}`;

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

class Client {
  constructor(name) {
    this.name = name;
    this.ws = new WebSocket(URL);
    this.msgs = [];
    this.cursor = 0; // messages are consumed in order, never re-matched
    this.listeners = new Set();
    this.opened = new Promise((res) => this.ws.once("open", res));
    this.ws.on("message", (d) => {
      this.msgs.push(JSON.parse(d.toString()));
      for (const l of [...this.listeners]) l();
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  // Read forward from the cursor for the first message matching pred,
  // discarding everything before it. This models an ordered stream so a
  // buffered state from an earlier round can't satisfy a later wait.
  waitFor(pred, label, ms = 9000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.listeners.delete(pump);
        reject(new Error(`[${this.name}] timeout waiting for ${label}`));
      }, ms);
      const pump = () => {
        while (this.cursor < this.msgs.length) {
          const m = this.msgs[this.cursor++];
          if (pred(m)) {
            clearTimeout(t);
            this.listeners.delete(pump);
            resolve(m);
            return;
          }
        }
      };
      this.listeners.add(pump);
      pump(); // drain anything already buffered
    });
  }
  close() {
    this.ws.close();
  }
}

const isState = (phase) => (m) =>
  m.type === "roomState" && m.state.phase === phase;

async function main() {
  // 0) Build the previewUrl -> title oracle from iTunes directly.
  const search = await fetch(
    "https://itunes.apple.com/search?term=Daft+Punk&entity=musicArtist&limit=1"
  ).then((r) => r.json());
  const artistId = search.results[0].artistId;
  const artistName = search.results[0].artistName;
  const lookup = await fetch(
    `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=50`
  ).then((r) => r.json());
  const titleByPreview = new Map();
  for (const r of lookup.results) {
    if (r.kind === "song" && r.previewUrl && r.trackName) {
      titleByPreview.set(r.previewUrl, r.trackName);
    }
  }
  console.log(`oracle: artist ${artistName} (${artistId}), ${titleByPreview.size} songs`);

  // 1) Host creates the room.
  const host = new Client("host");
  await host.opened;
  host.send({ type: "create", playerName: "Alice" });
  const joined = await host.waitFor((m) => m.type === "joined", "host joined");
  const code = joined.roomCode;
  const hostId = joined.playerId;
  assert(/^[A-Z]{6}$/.test(code), "room code is 6 uppercase letters");
  const lobby0 = await host.waitFor(isState("lobby"), "host lobby");
  assert(lobby0.state.players.length === 1, "1 player after create");
  assert(lobby0.state.players[0].isHost, "creator is host");
  console.log(`✓ create: room ${code}, host ${hostId.slice(0, 8)}`);

  // 2) Second player joins.
  const guest = new Client("guest");
  await guest.opened;
  guest.send({ type: "join", roomCode: code, playerName: "Bob" });
  const gJoined = await guest.waitFor((m) => m.type === "joined", "guest joined");
  const guestId = gJoined.playerId;
  const lobby2 = await host.waitFor(
    (m) => m.type === "roomState" && m.state.players.length === 2,
    "host sees 2 players"
  );
  assert(lobby2.state.players.length === 2, "2 players");
  console.log("✓ join: 2 players in lobby");

  // 3) timeSync handshake.
  const t0 = Date.now();
  host.send({ type: "timeSync", clientSentAt: t0 });
  const sync = await host.waitFor((m) => m.type === "timeSyncReply", "timeSyncReply");
  assert(sync.clientSentAt === t0, "timeSync echoes clientSentAt");
  assert(typeof sync.serverTime === "number", "timeSync has serverTime");
  console.log("✓ timeSync handshake");

  // 4) Host selects an artist; expect loading -> lobby with totalRounds.
  host.send({ type: "selectArtist", artistId, artistName });
  await host.waitFor(isState("loading"), "loading");
  const ready = await host.waitFor(
    (m) => m.type === "roomState" && m.state.phase === "lobby" && m.state.artistName,
    "lobby with artist loaded"
  );
  assert(ready.state.totalRounds >= 1, "totalRounds set after select");
  console.log(`✓ selectArtist: ${ready.state.totalRounds} rounds queued`);

  // Reject non-host control.
  guest.send({ type: "startGame" });
  const err = await guest.waitFor((m) => m.type === "error", "non-host error");
  assert(/host/i.test(err.message), "non-host startGame rejected");
  console.log("✓ host-only guard: guest startGame rejected");

  // 5) Host starts the game -> countdown (synced start in the future).
  host.send({ type: "startGame" });
  const countdown = await guest.waitFor(isState("countdown"), "countdown");
  const r0 = countdown.state.currentRound;
  assert(r0 && r0.index === 0, "round 0 active");
  assert(typeof r0.previewUrl === "string", "round exposes previewUrl");
  assert(r0.title === undefined && countdown.state.lastResult === null, "no answer leaked");
  assert(r0.startsAt > Date.now(), "startsAt is in the future (sync lead)");
  console.log("✓ startGame: countdown, answer hidden, synced startsAt");

  // 6) Round 0 begins playing -> guest submits the CORRECT title.
  const playing0 = await guest.waitFor(isState("playing"), "round 0 playing");
  const preview0 = playing0.state.currentRound.previewUrl;
  const answer0 = titleByPreview.get(preview0);
  assert(answer0, "oracle resolved round 0 title");
  guest.send({ type: "guess", roundIndex: 0, text: answer0 });
  const gr = await guest.waitFor((m) => m.type === "guessResult", "guessResult");
  assert(gr.correct && gr.awarded, "correct guess is awarded");
  const reveal0 = await guest.waitFor(isState("reveal"), "round 0 reveal");
  assert(reveal0.state.lastResult.winnerId === guestId, "guest is winner");
  assert(reveal0.state.lastResult.song.title === answer0, "reveal shows answer");
  const guestScore = reveal0.state.players.find((p) => p.id === guestId).score;
  assert(guestScore === 1, "winner score is 1");
  console.log(`✓ round 0: "${answer0}" → guest scores (winner-takes-point)`);

  // 7) Round 1: host advances, host guesses WRONG, round times out (no winner).
  host.send({ type: "nextRound" });
  await guest.waitFor(isState("countdown"), "round 1 countdown");
  await guest.waitFor(isState("playing"), "round 1 playing");
  host.send({ type: "guess", roundIndex: 1, text: "zzz not a real title zzz" });
  const wrong = await host.waitFor((m) => m.type === "guessResult", "wrong guessResult");
  assert(!wrong.correct && !wrong.awarded, "wrong guess not awarded");
  const reveal1 = await host.waitFor(isState("reveal"), "round 1 reveal (timeout)");
  assert(reveal1.state.lastResult.winnerId === null, "no winner on timeout");
  console.log("✓ round 1: wrong guess rejected, round times out with no winner");

  // 8) Advance past the last round -> finished.
  host.send({ type: "nextRound" });
  const finished = await host.waitFor(isState("finished"), "finished");
  const finalGuest = finished.state.players.find((p) => p.id === guestId).score;
  const finalHost = finished.state.players.find((p) => p.id === hostId).score;
  assert(finalGuest === 1 && finalHost === 0, "final scores: guest 1, host 0");
  console.log(`✓ finished: final scores guest=${finalGuest} host=${finalHost}`);

  // 9) Disconnect cleanup: guest leaves, host sees 1 player.
  guest.close();
  const afterLeave = await host.waitFor(
    (m) => m.type === "roomState" && m.state.players.length === 1,
    "host sees guest leave"
  );
  assert(afterLeave.state.players.length === 1, "guest removed on disconnect");
  console.log("✓ disconnect: player removed from room");

  host.close();
  console.log("\nALL SMOKE CHECKS PASSED ✅");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌", e.message);
    process.exit(1);
  });
