import { Hono } from "hono";
import {
  createSettings,
  deleteSettings,
  getSettings,
  updateSettings,
} from "../services/settings";
import { Bindings } from "../types";
import { Settings } from "../db/schema";
import { ResponseUtil } from "../utils/response";
const settings = new Hono<{ Bindings: Bindings }>();

settings.get("/", async (c) => {
  try {
    const result = await getSettings(c.env);
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
settings.post("/", async (c) => {
  try {
    const settings = await c.req.json<Settings>();
    const result = await createSettings(c.env, settings);
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
settings.put("/:id", async (c) => {
  try {
    const id = await c.req.param("id");
    const settings = await c.req.json<Settings>();
    const result = await updateSettings(c.env, Number(id), settings);
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
