import { sql } from "drizzle-orm";
import { createDb } from "../db/client";
import { categorysTable } from "../db/schema";
import { now } from "../utils";
import { CategorysInsertType, CategorysUpdateType } from "../db/type";

export async function getCategorys(env: Env) {
  const db = createDb(env.NAV);
  const result = await db
    .select()
    .from(categorysTable)
    .where(sql`${categorysTable.deletedAt} is null`);
  return result;
}

export async function createCategorys(
  env: Env,
  categorys: CategorysInsertType
) {
  const db = createDb(env.NAV);
  const result = await db.insert(categorysTable).values(categorys).returning();
  return result[0];
}

export async function updateCategorys(
  env: Env,
  id: number,
  categorys: CategorysUpdateType
) {
  const db = createDb(env.NAV);
  const result = await db
    .update(categorysTable)
    .set(categorys)
    .where(
      sql`${categorysTable.id} = ${id} and ${categorysTable.deletedAt} is null`
    )
    .returning();
  return result[0];
}

export async function deleteCategorys(env: Env, id: number) {
  const db = createDb(env.NAV);
  const data = await db
    .select()
    .from(categorysTable)
    .where(sql`${categorysTable.id} = ${id}`);
  if (data.length === 0) {
    throw new Error("该条目不存在");
  }
  const result = await db
    .update(categorysTable)
    .set({ deletedAt: now() })
    .where(sql`${categorysTable.id} = ${id}`)
    .returning();
  return result[0];
}
