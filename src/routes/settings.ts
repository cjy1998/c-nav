import { Hono } from "hono";
import {
  createSettings,
  deleteSettings,
  getSettings,
  updateSettings,
} from "../services/settings";
import { Bindings } from "../types";
import { settingsInsertSchema, settingsUpdateSchema } from "../db/schema";
import { ResponseUtil } from "../utils/response";
import { zValidator } from "@hono/zod-validator";

const settings = new Hono<{ Bindings: Bindings }>();

settings.get("/", async (c) => {
  try {
    const result = await getSettings(c.env);
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
settings.post("/", zValidator("json", settingsInsertSchema), async (c) => {
  try {
    const data = c.req.valid("json");
    const result = await createSettings(c.env, data);
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
settings.put("/:id", zValidator("json", settingsUpdateSchema), async (c) => {
  try {
    const id = await c.req.param("id");
    const data = c.req.valid("json");
    const result = await updateSettings(c.env, Number(id), data);
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
settings.delete("/:id", async (c) => {
  try {
    const id = await c.req.param("id");
    const result = await deleteSettings(c.env, Number(id));
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
export default settings;
