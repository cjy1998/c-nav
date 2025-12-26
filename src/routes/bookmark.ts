import { Hono } from "hono";
import {
  createBookmark,
  deleteBookmark,
  getBookmarks,
  updateBookmark,
} from "../services/bookmark";
import { Bindings } from "../types";
import { bookmarkInsertSchema, bookmarkUpdateSchema } from "../db/schema";
import { ResponseUtil } from "../utils/response";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../middleware/authMiddleware";
import { BookmarkQueryType } from "../db/type";
const bookmarks = new Hono<{ Bindings: Bindings }>();

bookmarks.get("/", zValidator("query", BookmarkQueryType), async (c) => {
  try {
    const query = c.req.valid("query");
    const result = await getBookmarks(c.env, query);
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
bookmarks.post(
  "/",
  zValidator("json", bookmarkInsertSchema),
  authMiddleware,
  async (c) => {
    try {
      const data = c.req.valid("json");
      const result = await createBookmark(c.env, data);
      return c.json(ResponseUtil.success(result));
    } catch (error: any) {
      return c.json(ResponseUtil.serverError(error.message));
    }
  }
);
bookmarks.put(
  "/:id",
  zValidator("json", bookmarkUpdateSchema),
  authMiddleware,
  async (c) => {
    try {
      const id = await c.req.param("id");
      const data = c.req.valid("json");
      const result = await updateBookmark(c.env, Number(id), data);
      return c.json(ResponseUtil.success(result));
    } catch (error: any) {
      return c.json(ResponseUtil.serverError(error.message));
    }
  }
);
bookmarks.delete("/:id", authMiddleware, async (c) => {
  try {
    const id = await c.req.param("id");
    const result = await deleteBookmark(c.env, Number(id));
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
export default bookmarks;
