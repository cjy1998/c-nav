import { drizzle } from "drizzle-orm/d1";
import { Logger } from "drizzle-orm/logger";
import * as schema from "./schema";

export interface Env {
  NAV: D1Database;
}
// 自定义 Logger 类
class MyLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    console.log("📝 SQL:", query);
    console.log("👉 Params:", params);
  }
}
export const createDb = (d1: D1Database) => {
  return drizzle(d1, {
    schema,
    // 仅在开发环境开启，或者使用自定义 Logger
    logger: process.env.NODE_ENV === "development" ? new MyLogger() : false,
  });
};

export { schema };
