import { sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { bookmarkTable } from "../db/schema";
import { now } from "../utils";
import {
  BookmarkInsertType,
  BookmarkQueryType,
  BookmarkUpdateType,
} from "../db/type";
import z from "zod";

export async function getBookmarks(
  env: Env,
  query: z.infer<typeof BookmarkQueryType>
) {
  const db = createDb(env.NAV);
  console.log("query......", query);
  const where = sql`${bookmarkTable.deletedAt} is null`;
  if (query.categoryId) {
    where.append(sql` and ${bookmarkTable.categoryId} = ${query.categoryId}`);
  }
  if (query.name) {
    console.log("query.name......", query.name);
    // where.append(sql` and ${bookmarkTable.name} like %${query.name}%`);
    where.append(sql` and ${bookmarkTable.name} like ${`%${query.name}%`}`);
    console.log("where......", where);
  }
  const result = await db.select().from(bookmarkTable).where(where);
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
