import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { now } from "../utils";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
export const settingsTable = sqliteTable("settings", {
  id: int().primaryKey({ autoIncrement: true }),
  key: text().notNull(),
  value: text().notNull(),
  remark: text(),
  createdAt: text()
    .notNull()
    .$defaultFn(() => now()),
  updatedAt: text()
    .notNull()
    .$onUpdateFn(() => now()),
  deletedAt: text(),
});
/**
 * zod Schema（运行时验证器） ，由 drizzle-zod 库根据数据库表结构自动生成。
 */
export const settingsSelectSchema = createSelectSchema(settingsTable);
export const settingsInsertSchema = createInsertSchema(settingsTable);
export const settingsUpdateSchema = createUpdateSchema(settingsTable);

export const categorysTable = sqliteTable("categorys", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  index: int().notNull().default(0),
  parentId: int().default(0),
  depth: int().notNull().default(0),
  isPrivate: int().notNull().default(0),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
  deletedAt: text(),
});
export const bookmarkTable = sqliteTable("bookmarks", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  url: text().notNull(),
  desc: text().default(""),
  icon: text().default(""),
  categoryId: int().default(0),
  index: int().notNull().default(0),
  tags: text().default(""),
  note: text().default(""),
  isPrivate: int().notNull().default(0),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
  deletedAt: text(),
});
