import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));
const defaultDatabasePath = fileURLToPath(new URL("../data/fenya-stream-lab.sqlite", import.meta.url));

let database = null;

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

  return database;
}

export function closeDatabase() {
  if (database) {
    database.close();
    database = null;
  }
}
