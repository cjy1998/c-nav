import { sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { bookmarkTable } from "../db/schema";
import { now } from "../utils";
import { BookmarkInsertType, BookmarkUpdateType } from "../db/type";

export async function getBookmarks(env: Env) {
  const db = createDb(env.NAV);
  const result = await db
    .select()
    .from(bookmarkTable)
    .where(sql`${bookmarkTable.deletedAt} is null`);
  return result;
}

export async function createBookmark(env: Env, bookmark: BookmarkInsertType) {
  const db = createDb(env.NAV);
  const result = await db.insert(bookmarkTable).values(bookmark).returning();
  return result[0];
}

export async function updateBookmark(
  env: Env,
  id: number,
  bookmark: BookmarkUpdateType
) {
  const db = createDb(env.NAV);
  const result = await db
    .update(bookmarkTable)
    .set(bookmark)
    .where(
      sql`${bookmarkTable.id} = ${id} and ${bookmarkTable.deletedAt} is null`
    )
    .returning();
  return result[0];
}

export async function deleteBookmark(env: Env, id: number) {
  const db = createDb(env.NAV);
  const data = await db
    .select()
    .from(bookmarkTable)
    .where(sql`${bookmarkTable.id} = ${id}`);
  if (data.length === 0) {
    throw new Error("该条目不存在");
  }
  const result = await db
    .update(bookmarkTable)
    .set({ deletedAt: now() })
    .where(sql`${bookmarkTable.id} = ${id}`)
    .returning();
  return result[0];
}
