import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type RoomSettings = {
  bluePlayers: number;
  redPlayers: number;
  blueBots: number;
  redBots: number;
  scoreLimit: number;
  minutes: number;
};

export const rooms = pgTable("rooms", {
  code: text("code").primaryKey(),
  hostToken: text("host_token").notNull(),
  settings: jsonb("settings").$type<RoomSettings>().notNull(),
  started: boolean("started").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roomMembers = pgTable("room_members", {
  token: text("token").primaryKey(),
  roomCode: text("room_code").notNull(),
  name: text("name").notNull(),
  team: integer("team").notNull(),
  isHost: boolean("is_host").notNull().default(false),
});
