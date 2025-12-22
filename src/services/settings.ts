import { sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { Settings, settingsTable } from "../db/schema";
import { now } from "../utils";

export async function getSettings(env: Env) {
  const db = createDb(env.NAV);
  const result = await db
    .select()
    .from(settingsTable)
    .where(sql`${settingsTable.deletedAt} is null`);
  return result;
}

export async function createSettings(env: Env, settings: Settings) {
  const db = createDb(env.NAV);
  const { results, success } = await db.insert(settingsTable).values(settings);
  return results;
}

export async function updateSettings(env: Env, id: number, settings: Settings) {
  const db = createDb(env.NAV);
  // settings.updatedAt = now();
  console.log(now());

  const result = await db
    .update(settingsTable)
    .set(settings)
    .where(
      sql`${settingsTable.id} = ${id} and ${settingsTable.deletedAt} is null`
    );
  return result;
}

export async function deleteSettings(env: Env, id: number) {
  const db = createDb(env.NAV);
  const data = await db
    .select()
    .from(settingsTable)
    .where(sql`${settingsTable.id} = ${id}`);
  if (data.length === 0) {
    throw new Error("Settings not found");
  }
  const result = await db
    .update(settingsTable)
    .set({ deletedAt: new Date().toISOString() })
    .where(sql`${settingsTable.id} = ${id}`);
  return result;
}
