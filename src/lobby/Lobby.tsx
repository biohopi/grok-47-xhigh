"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Backpack,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Expand,
  Globe2,
  Headphones,
  Monitor,
  Radio,
  RotateCcw,
  Settings2,
  Shield,
  UsersRound,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Brand, { Emblem } from "@/lobby/components/Brand";
import Dialog from "@/lobby/components/Dialog";
import Loadout from "@/lobby/components/Loadout";
import Armory from "@/lobby/components/Armory";
import TacticalMap from "@/lobby/components/TacticalMap";
import {
  DEFAULT_INVENTORY,
  DEFAULT_SETTINGS,
  readSaved,
  type GameSettings,
  type Inventory,
} from "@/game/data";

type Panel = "loadout" | "armory" | "guide" | "settings" | "map" | "profile" | null;
type Team = 0 | 1;
type Counts = {
  bluePlayers: number;
  redPlayers: number;
  blueBots: number;
  redBots: number;
  scoreLimit: number;
  minutes: number;
};
type Player = { id: string; name: string; team: number; host?: boolean };
type RoomSnap = {
  code: string;
  settings: Counts;
  players: Player[];
  hostId: string;
  started: boolean;
  scores?: number[];
  timeLeft?: number;
  self?: { id: string; team: number; host: boolean; spawnIndex: number } | null;
};
type Boot = {
  inventory: Inventory;
  settings: GameSettings;
  name: string;
  match: Counts & {
    playerTeam: Team;
    online: boolean;
    token: string;
    room: string | null;
    isHost: boolean;
    playerId: string;
    since: number;
    spawnIndex: number;
  };
};

const EMPTY_COUNTS: Counts = {
  bluePlayers: 0,
  redPlayers: 0,
  blueBots: 0,
  redBots: 0,
  scoreLimit: 40,
  minutes: 8,
};

function token() {
  const key = "erangel-token";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID().replace(/-/g, "");
  localStorage.setItem(key, value);
  return value;
}

async function postMp(body: Record<string, unknown>) {
  const response = await fetch("/api/mp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<{
    ok: boolean;
    error?: string;
    seq?: number;
    snapshot?: RoomSnap | null;
    messages?: { t: string; message?: string }[];
  }>;
}

export default function Lobby() {
  const [panel, setPanel] = useState<Panel>(null);
  const [inventory, setInventory] = useState<Inventory>(() =>
    readSaved("erangel-inventory-v1", DEFAULT_INVENTORY),
  );
  const [settings, setSettings] = useState<GameSettings>(() =>
    readSaved("erangel-settings-v1", DEFAULT_SETTINGS),
  );
  const [name, setName] = useState(() => readSaved("erangel-player-name", "GHOST_01"));
  const [nameDraft, setNameDraft] = useState(name);
  const [team, setTeam] = useState<Team>(0);
  const [counts, setCounts] = useState<Counts>(() =>
    readSaved("erangel-tdm-setup-v1", EMPTY_COUNTS),
  );
  const [playing, setPlaying] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [toast, setToast] = useState("");
  const [room, setRoom] = useState<RoomSnap | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [lan, setLan] = useState<string[]>([]);
  const [since, setSince] = useState(0);
  const [playerId, setPlayerId] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const boot = useRef<Boot | null>(null);
  const booted = useRef(false);
  const launching = useRef(false);
  const [matchKey, setMatchKey] = useState(0);

  const sendToGame = useCallback((data: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage(
      { source: "erangel-lobby", ...data },
      location.origin,
    );
  }, []);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3400);
  }, []);

  useEffect(() => {
    localStorage.setItem("erangel-inventory-v1", JSON.stringify(inventory));
  }, [inventory]);
  useEffect(() => {
    localStorage.setItem("erangel-settings-v1", JSON.stringify(settings));
    if (playing) sendToGame({ type: "settings", settings });
  }, [settings, playing, sendToGame]);
  useEffect(() => {
    localStorage.setItem("erangel-player-name", JSON.stringify(name));
  }, [name]);
  useEffect(() => {
    localStorage.setItem("erangel-tdm-setup-v1", JSON.stringify(counts));
  }, [counts]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code) setJoinCode(code.toUpperCase());
    fetch("/api/net")
      .then((response) => response.json())
      .then((data: { hints?: string[] }) => setLan(data.hints || []))
      .catch(() => setLan([]));
  }, []);

  const launch = useCallback(
    (online: boolean, snap?: RoomSnap | null, seq = since) => {
      if (launching.current) return;
      launching.current = true;
      const self = snap?.self;
      const payload: Boot = {
        inventory,
        settings,
        name,
        match: {
          ...counts,
          ...(snap?.settings || {}),
          playerTeam: (self?.team === 1 ? 1 : team) as Team,
          online,
          token: token(),
          room: snap?.code || null,
          isHost: online ? !!self?.host || snap?.hostId === token() : true,
          playerId: self?.id || token(),
          since: seq,
          spawnIndex: self?.spawnIndex || 0,
        },
      };
      boot.current = payload;
      booted.current = false;
      setPlayerId(payload.match.playerId);
      setMatchKey((value) => value + 1);
      setDeploying(true);
      setPlaying(true);
    },
    [counts, inventory, name, settings, since, team],
  );

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.source !== "erangel-game"
      )
        return;
      if (event.data.inventory) setInventory(event.data.inventory as Inventory);
      if (event.data.type === "ready" && boot.current && !booted.current) {
        booted.current = true;
        setDeploying(false);
        sendToGame({ type: "boot-match", ...boot.current });
      }
      if (event.data.type === "inventory-open") setPanel("loadout");
      if (event.data.type === "settings-open") setPanel("settings");
      if (event.data.type === "error") {
        setDeploying(false);
        notify(event.data.message || "The battleground could not start.");
      }
    };
    addEventListener("message", handler);
    return () => removeEventListener("message", handler);
  }, [notify, sendToGame]);

  useEffect(() => {
    if (!room || playing) return;
    let stop = false;
    const tick = async () => {
      const result = await postMp({
        t: "poll",
        token: token(),
        code: room.code,
        since,
        name,
        team,
      }).catch(() => null);
      if (!result || stop) return;
      if (typeof result.seq === "number") setSince(result.seq);
      if (result.snapshot) {
        setRoom(result.snapshot);
        setCounts((current) => ({ ...current, ...result.snapshot?.settings }));
        if (result.snapshot.self) setTeam(result.snapshot.self.team === 1 ? 1 : 0);
        if (result.snapshot.started) launch(true, result.snapshot, result.seq || since);
      }
      const error = result.messages?.find((message) => message.t === "error");
      if (error?.message) notify(error.message);
    };
    const timer = window.setInterval(tick, 700);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [room, playing, since, name, team, launch, notify]);

  const bump = (key: keyof Counts, dir: number, min: number, max: number) => {
    if (room && room.hostId !== token()) return;
    const next = {
      ...counts,
      [key]: Math.max(min, Math.min(max, counts[key] + dir)),
    };
    setCounts(next);
    if (room) {
      postMp({
        t: "roomSettings",
        token: token(),
        code: room.code,
        settings: next,
      }).then((result) => {
        if (result.snapshot) setRoom(result.snapshot);
        if (!result.ok && result.error) notify(result.error);
      });
    }
  };

  const createRoom = async () => {
    const result = await postMp({
      t: "create",
      token: token(),
      name,
      team,
      settings: counts,
    });
    if (!result.ok || !result.snapshot) {
      notify(result.error || "Could not create a room.");
      return;
    }
    setSince(result.seq || 0);
    setRoom(result.snapshot);
    const url = new URL(window.location.href);
    url.searchParams.set("room", result.snapshot.code);
    window.history.replaceState(null, "", url);
    notify("Room open. Share the code, then start when your team is in.");
  };

  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      notify("Enter the six-character room code.");
      return;
    }
    const result = await postMp({ t: "join", token: token(), code, name, team });
    if (!result.ok || !result.snapshot) {
      notify(result.error || result.messages?.[0]?.message || "Room not found.");
      return;
    }
    setSince(result.seq || 0);
    setRoom(result.snapshot);
    notify("You are in the room. Wait for the host to start.");
  };

  const leaveRoom = async () => {
    if (!room) return;
    await postMp({ t: "leave", token: token(), code: room.code });
    setRoom(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
  };

  const leaveMatch = () => {
    sendToGame({ type: "stop" });
    launching.current = false;
    setPlaying(false);
    setDeploying(false);
    setPanel(null);
    boot.current = null;
    booted.current = false;
    if (room) {
      postMp({ t: "leave", token: token(), code: room.code });
      setRoom(null);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Invite copied.");
    } catch {
      notify(value);
    }
  };

  const host = !room || room.hostId === token() || room.hostId === playerId;
  const publicInvite =
    room && typeof window !== "undefined" ? `${window.location.origin}/?room=${room.code}` : room ? `/?room=${room.code}` : "";

  return (
    <div className={`app tdm-lobby ${playing ? "in-match" : ""}`}>
      {!playing && (
        <>
          <div className="lobby-scene" aria-hidden="true">
            <motion.img
              src="/images/tdm-lobby.jpg"
              alt=""
              initial={{ scale: 1.04, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ scale: { duration: 18 }, opacity: { duration: 0.8 } }}
              onError={(event) => {
                event.currentTarget.src = "/images/erangel-lobby.jpg";
              }}
            />
            <div className="scene-shade" />
            <div className="film-grain" />
          </div>
          <header className="topbar">
            <button className="brand-button" onClick={() => setPanel(null)} aria-label="Erangel Strike home">
              <Brand />
            </button>
            <nav className="main-nav" aria-label="Main navigation">
              {(["PLAY", "LOADOUT", "ARMORY", "FIELD GUIDE"] as const).map((label, index) => (
                <button
                  key={label}
                  className={index === 0 && !panel ? "active" : ""}
                  onClick={() =>
                    setPanel(index === 0 ? null : index === 1 ? "loadout" : index === 2 ? "armory" : "guide")
                  }
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="header-tools">
              <button
                className="icon-button"
                aria-label={settings.muted ? "Unmute" : "Mute"}
                onClick={() => setSettings({ ...settings, muted: !settings.muted })}
              >
                {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button className="icon-button" aria-label="Open settings" onClick={() => setPanel("settings")}>
                <Settings2 size={19} />
              </button>
              <button className="player-button" onClick={() => { setNameDraft(name); setPanel("profile"); }}>
                <span className="player-avatar"><Emblem /></span>
                <span><strong>{name}</strong><span>TDM OPERATIVE</span></span>
                <ChevronDown size={13} />
              </button>
            </div>
          </header>
          <main className="lobby-main">
            <div className="hero-copy">
              <div className="hero-eyebrow"><span /> WAREHOUSE · TEAM DEATHMATCH</div>
              <h1>ERANGEL<span>STRIKE</span></h1>
              <div className="hero-description">
                <h2>TWO TEAMS. ONE COMPOUND.</h2>
                <p>
                  Blue and red are always live. Set players and bots with + and −,
                  open a room, and drop together.
                </p>
              </div>
              <button className="loadout-link" onClick={() => setPanel("loadout")}>
                <Backpack size={17} /> <span>PREPARE YOUR LOADOUT</span> <ArrowRight size={16} />
              </button>
            </div>
          </main>
          <section className="command-deck" aria-label="Match setup">
            <button className="map-card" onClick={() => setPanel("map")}>
              <div className="map-thumbnail"><TacticalMap /></div>
              <span className="map-kicker">SELECTED MAP</span>
              <strong>WAREHOUSE TDM</strong>
              <span className="hint">PUBG Mobile style compound. Training Grounds removed.</span>
            </button>
            <div className="team-board">
              <TeamColumn
                title="BLUE"
                tone="blue"
                players={counts.bluePlayers}
                bots={counts.blueBots}
                disabled={!host}
                onPlayers={(dir) => bump("bluePlayers", dir, 0, 8)}
                onBots={(dir) => bump("blueBots", dir, 0, 12)}
              />
              <TeamColumn
                title="RED"
                tone="red"
                players={counts.redPlayers}
                bots={counts.redBots}
                disabled={!host}
                onPlayers={(dir) => bump("redPlayers", dir, 0, 8)}
                onBots={(dir) => bump("redBots", dir, 0, 12)}
              />
              <div className="rules-row">
                <span>Score <StepperValue value={counts.scoreLimit} disabled={!host} onAdd={() => bump("scoreLimit", 5, 10, 80)} onSub={() => bump("scoreLimit", -5, 10, 80)} /></span>
                <span>Minutes <StepperValue value={counts.minutes} disabled={!host} onAdd={() => bump("minutes", 1, 3, 15)} onSub={() => bump("minutes", -1, 3, 15)} /></span>
                <span>Respawn 3s · both teams always on</span>
              </div>
            </div>
            <div className="launch-card">
              <span className="field-label">YOUR TEAM</span>
              <div className="team-pick">
                <button className={team === 0 ? "on-blue" : ""} onClick={() => chooseTeam(0)} disabled={!!room && room.started}>BLUE</button>
                <button className={team === 1 ? "on-red" : ""} onClick={() => chooseTeam(1)} disabled={!!room && room.started}>RED</button>
              </div>
              {!room ? (
                <>
                  <button className="deploy-button" onClick={createRoom}>
                    <UsersRound size={18} /> <span>CREATE ROOM</span>
                  </button>
                  <div className="join-row">
                    <input
                      aria-label="Room code"
                      maxLength={6}
                      placeholder="CODE"
                      value={joinCode}
                      onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    />
                    <button className="join-button" onClick={joinRoom}>JOIN</button>
                  </div>
                  <button className="ghost-button" onClick={() => launch(false)}>DEPLOY OFFLINE</button>
                  <p className="hint">Players and bots start at 0. Press + to add one. You still deploy on the team you pick. Friend slots are the player count.</p>
                </>
              ) : (
                <div className="room-live">
                  <div className="room-code-lg">{room.code}</div>
                  <button className="ghost-button" onClick={() => copy(publicInvite)}><Copy size={14} /> COPY INVITE</button>
                  <div className="invite-link">{publicInvite}</div>
                  {typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) && lan.filter((href) => !href.includes("127.0.0.1")).slice(0, 2).map((href) => (
                    <button key={href} className="ghost-button" onClick={() => copy(`${href}/?room=${room.code}`)}>
                      <Wifi size={14} /> WI-FI {href.replace("http://", "")}
                    </button>
                  ))}
                  <div className="roster-grid">
                    {[0, 1].map((side) => (
                      <section key={side} className={side === 0 ? "blue" : "red"}>
                        <h4>{side === 0 ? "BLUE" : "RED"}</h4>
                        <ul>
                          {room.players.filter((player) => player.team === side).map((player) => (
                            <li key={player.id}>{player.name}{player.host ? " · HOST" : ""}</li>
                          ))}
                          {room.players.filter((player) => player.team === side).length === 0 && <li>Waiting</li>}
                        </ul>
                      </section>
                    ))}
                  </div>
                  {host ? (
                    <button className="deploy-button" onClick={() => postMp({ t: "start", token: token(), code: room.code }).then((result) => {
                      if (result.snapshot) launch(true, result.snapshot, result.seq || since);
                      else notify(result.error || "Only the host can start.");
                    })}>
                      <Crosshair size={18} /> <span>START MATCH</span>
                    </button>
                  ) : (
                    <p className="hint">Connected. The host starts the match for everyone in this room.</p>
                  )}
                  <button className="ghost-button" onClick={leaveRoom}>LEAVE ROOM</button>
                </div>
              )}
            </div>
          </section>
          <footer className="lobby-footer">
            <div className="system-status"><span /> WAREHOUSE READY <Globe2 size={12} /> SAME-ORIGIN ROOMS</div>
            <div className="keyboard-shortcuts">
              <button onClick={() => setPanel("guide")}>CONTROLS</button>
              <button onClick={() => document.documentElement.requestFullscreen().catch(() => notify("Fullscreen is unavailable."))}>
                <Expand size={12} /> FULLSCREEN
              </button>
            </div>
            <span className="build-version">TDM <span>V.1.1</span></span>
          </footer>
        </>
      )}
      {playing && (
        <div className="game-shell">
          <header className="game-topbar">
            <Brand compact />
            <span className="game-session"><Radio size={13} /> WAREHOUSE TDM / {team === 0 ? "BLUE" : "RED"} / {boot.current?.match.online ? "ONLINE ROOM" : "OFFLINE"}</span>
            <div>
              <button className="text-button" onClick={() => { setPanel("loadout"); sendToGame({ type: "pause" }); }}><Backpack size={16} /> BACKPACK</button>
              <button className="return-lobby" onClick={leaveMatch}><ArrowLeft size={15} /> RETURN TO LOBBY</button>
            </div>
          </header>
          <iframe key={matchKey} ref={frame} className="game-frame" title="Warehouse TDM" src="/game/index.html" allow="autoplay; fullscreen" />
          {deploying && (
            <div className="deployment-screen">
              <Emblem />
              <span className="eyebrow">DROPPING INTO WAREHOUSE</span>
              <h2>BLUE VERSUS RED.</h2>
              <div className="deployment-progress"><i /></div>
              <p>Syncing the compound, loadouts, and your team.</p>
            </div>
          )}
        </div>
      )}
      <AnimatePresence>
        {panel && (
          <Dialog
            label="Erangel panel"
            onClose={() => { setPanel(null); if (playing) sendToGame({ type: "resume" }); }}
            className={`dialog-${panel}`}
          >
            {panel === "loadout" && <Loadout inventory={inventory} onChange={setInventory} onClose={() => setPanel(null)} />}
            {panel === "armory" && (
              <Armory inventory={inventory} onChange={setInventory} onClose={() => setPanel(null)} onLoadout={() => setPanel("loadout")} />
            )}
            {panel === "map" && (
              <section className="map-content">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">ACTIVE DROPZONE</span>
                    <h2>WAREHOUSE TDM</h2>
                    <p>A compact two-sided compound with a central warehouse, container yards, and mirrored spawns. Training Grounds is gone.</p>
                  </div>
                  <button className="icon-button" onClick={() => setPanel(null)} aria-label="Close map"><X /></button>
                </div>
                <TacticalMap large />
              </section>
            )}
            {panel === "settings" && (
              <section className="settings-content">
                <h2>SETTINGS</h2>
                <label className="range-setting">
                  <span>Master volume</span>
                  <input type="range" min={0} max={100} value={settings.volume} onChange={(event) => setSettings({ ...settings, volume: +event.target.value })} />
                  <b>{settings.volume}%</b>
                </label>
                <label className="range-setting">
                  <span>Mouse sensitivity</span>
                  <input type="range" min={10} max={100} value={settings.sensitivity} onChange={(event) => setSettings({ ...settings, sensitivity: +event.target.value })} />
                  <b>{settings.sensitivity}%</b>
                </label>
                <label className="toggle-setting">
                  <span><Headphones size={14} /> Mute</span>
                  <input type="checkbox" checked={settings.muted} onChange={(event) => setSettings({ ...settings, muted: event.target.checked })} />
                </label>
                <label className="toggle-setting">
                  <span><Monitor size={14} /> Shadows</span>
                  <input type="checkbox" checked={settings.shadows} onChange={(event) => setSettings({ ...settings, shadows: event.target.checked })} />
                </label>
                <div className="perspective-segment">
                  {(["TPP", "FPP"] as const).map((value) => (
                    <button key={value} className={settings.perspective === value ? "selected" : ""} onClick={() => setSettings({ ...settings, perspective: value })}>{value}</button>
                  ))}
                </div>
                <button className="text-button" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}><RotateCcw size={14} /> DEFAULTS</button>
              </section>
            )}
            {panel === "guide" && (
              <section className="guide-content">
                <h2>FIELD GUIDE</h2>
                <p>WASD move, mouse look, Shift sprint, Space jump, C crouch, V perspective, F pickup, B backpack, R reload, H heal. First to the score or the clock wins. You respawn at your team bunker.</p>
                <p>Online rooms work on this site, on your router if friends open the Wi-Fi address, and on Render because the room relay is the same Node server as the page.</p>
              </section>
            )}
            {panel === "profile" && (
              <form className="profile-content" onSubmit={(event) => {
                event.preventDefault();
                const value = nameDraft.trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 16);
                if (!value) return;
                setName(value);
                setPanel(null);
                notify("Callsign updated.");
              }}>
                <h2>OPERATIVE</h2>
                <input aria-label="Callsign" value={nameDraft} maxLength={16} onChange={(event) => setNameDraft(event.target.value)} />
                <button className="amber-button" type="submit"><Check size={16} /> SAVE</button>
              </form>
            )}
          </Dialog>
        )}
      </AnimatePresence>
      {toast && <div className="toast" role="status"><Shield size={14} /> {toast}</div>}
    </div>
  );

  function chooseTeam(next: Team) {
    setTeam(next);
    if (!room) return;
    postMp({ t: "team", token: token(), code: room.code, team: next }).then((result) => {
      if (result.snapshot) setRoom(result.snapshot);
      if (!result.ok) notify(result.error || "That team has no open slot.");
    });
  }
}

function TeamColumn({
  title,
  tone,
  players,
  bots,
  disabled,
  onPlayers,
  onBots,
}: {
  title: string;
  tone: string;
  players: number;
  bots: number;
  disabled: boolean;
  onPlayers: (dir: number) => void;
  onBots: (dir: number) => void;
}) {
  return (
    <div className={`team-col ${tone}`}>
      <h3>{title}</h3>
      <div className="stepper">
        <span>PLAYERS</span>
        <button type="button" aria-label={`Remove ${title} player`} disabled={disabled || players <= 0} onClick={() => onPlayers(-1)}>−</button>
        <strong>{players}</strong>
        <button type="button" aria-label={`Add ${title} player`} disabled={disabled || players >= 8} onClick={() => onPlayers(1)}>+</button>
      </div>
      <div className="stepper">
        <span>BOTS</span>
        <button type="button" aria-label={`Remove ${title} bot`} disabled={disabled || bots <= 0} onClick={() => onBots(-1)}>−</button>
        <strong>{bots}</strong>
        <button type="button" aria-label={`Add ${title} bot`} disabled={disabled || bots >= 12} onClick={() => onBots(1)}>+</button>
      </div>
    </div>
  );
}

function StepperValue({
  value,
  disabled,
  onAdd,
  onSub,
}: {
  value: number;
  disabled: boolean;
  onAdd: () => void;
  onSub: () => void;
}) {
  return (
    <span className="stepper" style={{ display: "inline-flex", marginLeft: 8 }}>
      <button type="button" disabled={disabled} onClick={onSub}>−</button>
      <strong>{value}</strong>
      <button type="button" disabled={disabled} onClick={onAdd}>+</button>
    </span>
  );
}
