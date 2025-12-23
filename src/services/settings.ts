import { sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { settingsTable } from "../db/schema";
import { now } from "../utils";
import { SettingsInsertType, SettingsUpdateType } from "../db/type";

export async function getSettings(env: Env) {
  const db = createDb(env.NAV);
  const result = await db
    .select()
    .from(settingsTable)
    .where(sql`${settingsTable.deletedAt} is null`);
  return result;
}

export async function createSettings(env: Env, settings: SettingsInsertType) {
  const db = createDb(env.NAV);
  const result = await db.insert(settingsTable).values(settings).returning();
  return result[0];
}

export async function updateSettings(
  env: Env,
  id: number,
  settings: SettingsUpdateType
) {
  const db = createDb(env.NAV);
  const result = await db
    .update(settingsTable)
    .set(settings)
    .where(
      sql`${settingsTable.id} = ${id} and ${settingsTable.deletedAt} is null`
    )
    .returning();
  return result[0];
}

export async function deleteSettings(env: Env, id: number) {
  const db = createDb(env.NAV);
  const data = await db
    .select()
    .from(settingsTable)
    .where(sql`${settingsTable.id} = ${id}`);
  if (data.length === 0) {
    throw new Error("该条目不存在");
  }
  const result = await db
    .update(settingsTable)
    .set({ deletedAt: now() })
    .where(sql`${settingsTable.id} = ${id}`)
    .returning();
  return result[0];
}
