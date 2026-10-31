import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roomMembers, rooms, type RoomSettings } from "@/db/schema";

export type PlayerState = {
  id: string;
  name: string;
  team: number;
  host: boolean;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  weapon: string | null;
  kills: number;
};

type Queued = { seq: number; msg: Record<string, unknown>; except?: string };

type Room = {
  code: string;
  hostToken: string;
  settings: RoomSettings;
  started: boolean;
  over: boolean;
  winner: number;
  createdAt: number;
  updatedAt: number;
  endsAt: number;
  players: Map<string, PlayerState>;
  scores: [number, number];
  latestBots: unknown;
  events: Queued[];
  seq: number;
};

type Store = { rooms: Map<string, Room> };

const globalStore = globalThis as typeof globalThis & { __erangelRooms?: Store };
const store: Store = globalStore.__erangelRooms ?? { rooms: new Map() };
globalStore.__erangelRooms = store;

const TOKEN = /^[a-zA-Z0-9_-]{8,80}$/;
const hits = new Map<string, { t: number; n: number }>();

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}

export function cleanSettings(input: Partial<RoomSettings> = {}): RoomSettings {
  return {
    bluePlayers: clampInt(input.bluePlayers, 0, 8, 0),
    redPlayers: clampInt(input.redPlayers, 0, 8, 0),
    blueBots: clampInt(input.blueBots, 0, 12, 0),
    redBots: clampInt(input.redBots, 0, 12, 0),
    scoreLimit: clampInt(input.scoreLimit, 10, 80, 40),
    minutes: clampInt(input.minutes, 3, 15, 8),
  };
}

function cleanName(value: unknown) {
  const name = String(value || "GHOST")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 16);
  return name || "GHOST";
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (store.rooms.has(code));
  return code;
}

function roster(room: Room) {
  return [...room.players.values()].map((player) => ({ ...player, host: player.id === room.hostToken }));
}

function spawnIndex(room: Room, token: string) {
  const self = room.players.get(token);
  if (!self) return 0;
  return [...room.players.values()].filter((player) => player.team === self.team).findIndex((player) => player.id === token);
}

function timeLeft(room: Room) {
  if (!room.started) return room.settings.minutes * 60;
  return Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000));
}

function snapshot(room: Room, token: string) {
  const self = room.players.get(token);
  return {
    code: room.code,
    settings: room.settings,
    players: roster(room),
    hostId: room.hostToken,
    started: room.started,
    over: room.over,
    winner: room.winner,
    scores: room.scores,
    timeLeft: timeLeft(room),
    bots: room.latestBots,
    self: self
      ? { id: self.id, team: self.team, host: self.id === room.hostToken, spawnIndex: Math.max(0, spawnIndex(room, token)) }
      : null,
  };
}

function enqueue(room: Room, msg: Record<string, unknown>, except?: string) {
  room.seq += 1;
  room.events.push({ seq: room.seq, msg, except });
  if (room.events.length > 240) room.events.splice(0, room.events.length - 240);
}

function friendCap(room: Room, team: number) {
  return team === 0 ? room.settings.bluePlayers : room.settings.redPlayers;
}

function friendsOnTeam(room: Room, team: number, except?: string) {
  return [...room.players.values()].filter(
    (player) => player.team === team && player.id !== room.hostToken && player.id !== except,
  ).length;
}

function canOccupy(room: Room, team: number, token: string) {
  if (token === room.hostToken) return true;
  return friendsOnTeam(room, team, token) < friendCap(room, team);
}

function finishIfNeeded(room: Room) {
  if (!room.started || room.over) return;
  const left = timeLeft(room);
  const hitScore = room.scores[0] >= room.settings.scoreLimit || room.scores[1] >= room.settings.scoreLimit;
  if (left > 0 && !hitScore) return;
  room.over = true;
  room.winner = room.scores[0] === room.scores[1] ? -1 : room.scores[0] > room.scores[1] ? 0 : 1;
  enqueue(room, { t: "matchEnd", scores: [...room.scores], winner: room.winner, timeLeft: left });
}

function sweep() {
  const now = Date.now();
  for (const [code, room] of store.rooms) {
    if (now - room.updatedAt > 1000 * 60 * 50) store.rooms.delete(code);
  }
}

async function persist(room: Room) {
  try {
    await db
      .insert(rooms)
      .values({
        code: room.code,
        hostToken: room.hostToken,
        settings: room.settings,
        started: room.started,
      })
      .onConflictDoUpdate({
        target: rooms.code,
        set: { hostToken: room.hostToken, settings: room.settings, started: room.started },
      });
    await db.delete(roomMembers).where(eq(roomMembers.roomCode, room.code));
    const members = [...room.players.values()];
    if (members.length) {
      await db.insert(roomMembers).values(
        members.map((player) => ({
          token: player.id,
          roomCode: room.code,
          name: player.name,
          team: player.team,
          isHost: player.id === room.hostToken,
        })),
      );
    }
  } catch (error) {
    console.error("Room persistence failed; live room remains in memory.", error);
  }
}

async function loadRoom(code: string) {
  const cached = store.rooms.get(code);
  if (cached) return cached;
  try {
    const [row] = await db.select().from(rooms).where(eq(rooms.code, code)).limit(1);
    if (!row) return null;
    const members = await db.select().from(roomMembers).where(eq(roomMembers.roomCode, code));
    const settings = cleanSettings(row.settings);
    const room: Room = {
      code,
      hostToken: row.hostToken,
      settings,
      started: row.started,
      over: false,
      winner: -1,
      createdAt: row.createdAt.getTime(),
      updatedAt: Date.now(),
      endsAt: row.started ? Date.now() + settings.minutes * 60 * 1000 : 0,
      players: new Map(),
      scores: [0, 0],
      latestBots: null,
      events: [],
      seq: 0,
    };
    for (const member of members) {
      room.players.set(member.token, {
        id: member.token,
        name: member.name,
        team: member.team,
        host: member.isHost,
        alive: true,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        hp: 100,
        weapon: null,
        kills: 0,
      });
    }
    if (!room.players.has(room.hostToken) && members[0]) room.hostToken = members[0].token;
    store.rooms.set(code, room);
    return room;
  } catch (error) {
    console.error("Room load failed.", error);
    return null;
  }
}

function touch(room: Room) {
  room.updatedAt = Date.now();
  finishIfNeeded(room);
}

function limited(token: string) {
  const now = Date.now();
  const hit = hits.get(token) ?? { t: now, n: 0 };
  if (now - hit.t > 1000) {
    hit.t = now;
    hit.n = 0;
  }
  hit.n += 1;
  hits.set(token, hit);
  return hit.n > 45;
}

function addPlayer(room: Room, token: string, name: string, team: number) {
  const player: PlayerState = {
    id: token,
    name,
    team,
    host: token === room.hostToken,
    alive: true,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp: 100,
    weapon: null,
    kills: 0,
  };
  room.players.set(token, player);
  return player;
}

function leave(room: Room, token: string) {
  if (!room.players.has(token)) return;
  room.players.delete(token);
  enqueue(room, { t: "playerLeave", id: token });
  if (room.players.size === 0) {
    store.rooms.delete(room.code);
    void db.delete(roomMembers).where(eq(roomMembers.roomCode, room.code)).catch(() => undefined);
    void db.delete(rooms).where(eq(rooms.code, room.code)).catch(() => undefined);
    return;
  }
  if (room.hostToken === token) {
    room.hostToken = [...room.players.keys()][0];
    enqueue(room, { t: "hostChange", id: room.hostToken });
  }
  enqueue(room, { t: "roomUpdate", ...snapshot(room, room.hostToken) });
  void persist(room);
}

type Incoming = Record<string, unknown>;

function applyAction(room: Room, token: string, msg: Incoming) {
  const kind = String(msg.t || "");
  const self = room.players.get(token);
  if (!self && kind !== "join" && kind !== "create") return;
  if (kind === "roomSettings") {
    if (room.hostToken !== token || room.started) return;
    const next = cleanSettings((msg.settings || {}) as Partial<RoomSettings>);
    for (const team of [0, 1]) {
      const key = team === 0 ? "bluePlayers" : "redPlayers";
      next[key] = Math.max(next[key], friendsOnTeam(room, team));
    }
    room.settings = next;
    enqueue(room, { t: "roomUpdate", ...snapshot(room, token) });
    void persist(room);
    return;
  }
  if (kind === "team") {
    if (!self || room.started) return;
    const team = msg.team === 1 ? 1 : 0;
    if (!canOccupy(room, team, token)) {
      enqueue(room, { t: "error", message: "That team has no open friend slots" }, undefined);
      return;
    }
    self.team = team;
    enqueue(room, { t: "roomUpdate", ...snapshot(room, token) });
    void persist(room);
    return;
  }
  if (kind === "start") {
    if (room.hostToken !== token || room.started) return;
    room.started = true;
    room.endsAt = Date.now() + room.settings.minutes * 60 * 1000;
    enqueue(room, { t: "started", settings: room.settings, players: roster(room), scores: [0, 0], timeLeft: timeLeft(room) });
    void persist(room);
    return;
  }
  if (kind === "state" && self && msg.d && typeof msg.d === "object") {
    const data = msg.d as Record<string, unknown>;
    for (const key of ["x", "y", "z", "yaw", "pitch"] as const) {
      const n = Number(data[key]);
      if (Number.isFinite(n)) self[key] = Math.max(-5000, Math.min(5000, n));
    }
    if (Number.isFinite(Number(data.hp))) self.hp = clampInt(data.hp, 0, 100, self.hp);
    if (typeof data.alive === "boolean") self.alive = data.alive;
    if (typeof data.weapon === "string") self.weapon = data.weapon.slice(0, 40);
    if (Number.isFinite(Number(data.kills))) self.kills = clampInt(data.kills, 0, 999, self.kills);
    return;
  }
  if (kind === "hostBots" && room.hostToken === token && room.started) {
    room.latestBots = msg.d ?? null;
    return;
  }
  if (kind === "clock" && room.hostToken === token && room.started) {
    const left = clampInt(msg.timeLeft, 0, room.settings.minutes * 60, timeLeft(room));
    room.endsAt = Date.now() + left * 1000;
    return;
  }
  if (kind === "hitBot" && room.hostToken !== token) {
    enqueue(room, { t: "hitBot", d: msg.d, from: token });
    room.events[room.events.length - 1].except = `__only:${room.hostToken}`;
    return;
  }
  if (kind === "damage" && room.started && self) {
    const targetId = String(msg.to || "");
    const target = room.players.get(targetId);
    if (!target || targetId === token) return;
    const dmg = clampInt(msg.dmg, 0, 100, 0);
    enqueue(room, { t: "damage", dmg, head: !!msg.head, from: token, team: self.team, to: targetId });
    room.events[room.events.length - 1].except = `__only:${targetId}`;
    return;
  }
  if (kind === "shoot" && room.started) {
    enqueue(room, { t: "shoot", from: token, d: msg.d }, token);
    return;
  }
  if (kind === "score" && room.started && !room.over) {
    const team = msg.team === 1 ? 1 : 0;
    room.scores[team] += 1;
    enqueue(room, { t: "scoreSync", scores: [...room.scores], by: token, team });
    finishIfNeeded(room);
    return;
  }
  if (kind === "down" && room.started) {
    enqueue(room, { t: "down", id: token, killerTeam: msg.killerTeam === 1 ? 1 : 0 });
  }
}

function visible(event: Queued, token: string) {
  if (!event.except) return true;
  if (event.except.startsWith("__only:")) return event.except.slice(7) === token;
  return event.except !== token;
}

export async function handleMp(body: Incoming) {
  sweep();
  const token = String(body.token || "");
  if (!TOKEN.test(token)) return { ok: false, error: "Missing player token", messages: [], seq: 0 };
  if (limited(token)) return { ok: false, error: "Slow down", messages: [], seq: 0 };

  const kind = String(body.t || "poll");
  if (kind === "create") {
    for (const room of store.rooms.values()) {
      if (room.players.has(token)) leave(room, token);
    }
    const code = makeCode();
    const settings = cleanSettings((body.settings || {}) as Partial<RoomSettings>);
    const team = body.team === 1 ? 1 : 0;
    const room: Room = {
      code,
      hostToken: token,
      settings,
      started: false,
      over: false,
      winner: -1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      endsAt: 0,
      players: new Map(),
      scores: [0, 0],
      latestBots: null,
      events: [],
      seq: 0,
    };
    addPlayer(room, token, cleanName(body.name), team);
    store.rooms.set(code, room);
    const created = {
      t: "created",
      id: token,
      code,
      settings,
      hostId: token,
      players: roster(room),
      self: snapshot(room, token).self,
    };
    enqueue(room, created);
    void persist(room);
    return { ok: true, seq: room.seq, messages: [created], snapshot: snapshot(room, token) };
  }

  const code = String(body.code || "").trim().toUpperCase();
  const room = code ? await loadRoom(code) : [...store.rooms.values()].find((item) => item.players.has(token)) || null;
  if (kind === "join") {
    if (!room) return { ok: false, error: "Room not found", messages: [{ t: "error", message: "Room not found" }], seq: 0 };
    if (room.started) return { ok: false, error: "Match already started", messages: [{ t: "error", message: "Match already started — create a new room" }], seq: room.seq };
    const team = body.team === 1 ? 1 : 0;
    if (!canOccupy(room, team, token)) {
      return { ok: false, error: "That team is full", messages: [{ t: "error", message: "That team has no open friend slots. Ask the host to press +." }], seq: room.seq, snapshot: snapshot(room, room.hostToken) };
    }
    for (const other of store.rooms.values()) {
      if (other !== room && other.players.has(token)) leave(other, token);
    }
    addPlayer(room, token, cleanName(body.name), team);
    touch(room);
    const joined = {
      t: "joined",
      id: token,
      code: room.code,
      settings: room.settings,
      hostId: room.hostToken,
      players: roster(room),
      started: room.started,
      self: snapshot(room, token).self,
    };
    enqueue(room, { t: "playerJoin", id: token, player: room.players.get(token) }, token);
    enqueue(room, { t: "roomUpdate", ...snapshot(room, token) });
    void persist(room);
    return { ok: true, seq: room.seq, messages: [joined], snapshot: snapshot(room, token) };
  }

  if (!room || !room.players.has(token)) {
    return { ok: false, error: "Not in a room", messages: [], seq: 0 };
  }

  if (kind === "leave") {
    leave(room, token);
    return { ok: true, seq: 0, messages: [{ t: "left" }], snapshot: null };
  }

  const since = clampInt(body.since, 0, 1_000_000_000, 0);
  const actions = Array.isArray(body.actions) ? body.actions : kind !== "poll" ? [body] : [];
  for (const action of actions) {
    if (action && typeof action === "object") applyAction(room, token, action as Incoming);
  }
  if (body.state && typeof body.state === "object") applyAction(room, token, { t: "state", d: body.state });
  if (body.hostBots) applyAction(room, token, { t: "hostBots", d: body.hostBots });
  if (body.clock != null) applyAction(room, token, { t: "clock", timeLeft: body.clock });
  touch(room);
  const messages = room.events.filter((event) => event.seq > since && visible(event, token)).map((event) => event.msg);
  return { ok: true, seq: room.seq, messages, snapshot: snapshot(room, token) };
}
