import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
const defaultDatabasePath = fileURLToPath(new URL("../data/fenya-stream-lab.sqlite", import.meta.url));

let database = null;

function applySafeMigrations(targetDatabase) {
  const twitchAccountColumns = targetDatabase.prepare("PRAGMA table_info(twitch_accounts)").all();
  if (!twitchAccountColumns.some((column) => column.name === "needs_reauth")) {
    targetDatabase.exec("ALTER TABLE twitch_accounts ADD COLUMN needs_reauth INTEGER NOT NULL DEFAULT 0 CHECK (needs_reauth IN (0, 1))");
  }
  for (const table of ["streams", "viewer_samples", "chat_messages"]) {
    const columns = targetDatabase.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === "channel_id")) {
      targetDatabase.exec(`ALTER TABLE ${table} ADD COLUMN channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL`);
    }
    if (!columns.some((column) => column.name === "stream_session_id")) {
      targetDatabase.exec(`ALTER TABLE ${table} ADD COLUMN stream_session_id TEXT`);
    }
  }
  const streamColumns = targetDatabase.prepare("PRAGMA table_info(streams)").all();
  if (!streamColumns.some((column) => column.name === "collected_from")) {
    targetDatabase.exec("ALTER TABLE streams ADD COLUMN collected_from TEXT");
  }
}

export function getDatabasePath() {
  const configuredPath = process.env.DATABASE_PATH?.trim();

  if (!configuredPath) {
    return defaultDatabasePath;
  }

  return isAbsolute(configuredPath) ? configuredPath : resolve(projectRoot, configuredPath);
}

export function getDatabase() {
  if (database) {
    return database;
  }

  const databasePath = getDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });

  database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(readFileSync(schemaPath, "utf8"));
  applySafeMigrations(database);

  return database;
}

export function closeDatabase() {
  if (database) {
    database.close();
    database = null;
  }
}
