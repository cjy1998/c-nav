import { Hono } from "hono";
import {
  createCategorys,
  deleteCategorys,
  getCategorys,
  updateCategorys,
} from "../services/categorys";
import { Bindings } from "../types";
import { categorysInsertSchema, categorysUpdateSchema } from "../db/schema";
import { ResponseUtil } from "../utils/response";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "../middleware/authMiddleware";
const categorys = new Hono<{ Bindings: Bindings }>();

categorys.get("/", async (c) => {
  try {
    const result = await getCategorys(c.env);
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
categorys.post(
  "/",
  zValidator("json", categorysInsertSchema),
  authMiddleware,
  async (c) => {
    try {
      const data = c.req.valid("json");
      const result = await createCategorys(c.env, data);
      return c.json(ResponseUtil.success(result));
    } catch (error: any) {
      return c.json(ResponseUtil.serverError(error.message));
    }
  }
);
categorys.put(
  "/:id",
  zValidator("json", categorysUpdateSchema),
  authMiddleware,
  async (c) => {
    try {
      const id = await c.req.param("id");
      const data = c.req.valid("json");
      const result = await updateCategorys(c.env, Number(id), data);
      return c.json(ResponseUtil.success(result));
    } catch (error: any) {
      return c.json(ResponseUtil.serverError(error.message));
    }
  }
);
categorys.delete("/:id", authMiddleware, async (c) => {
  try {
    const id = await c.req.param("id");
    const result = await deleteCategorys(c.env, Number(id));
    return c.json(ResponseUtil.success(result));
  } catch (error: any) {
    return c.json(ResponseUtil.serverError(error.message));
  }
});
export default categorys;
