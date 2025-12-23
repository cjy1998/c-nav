import { Hono } from "hono";
import { sign } from "hono/jwt";
import { setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import z from "zod";
import { ResponseUtil } from "../utils/response";

interface Env {
  NAV_KV: KVNamespace;
  JWT_SECRET: string;
}
const auth = new Hono<{ Bindings: Env }>();

auth.post(
  "/login",
  zValidator(
    "json",
    z.object({
      username: z.string(),
      password: z.string(),
    })
  ),
  async (c) => {
    const { username, password } = await c.req.json();
    // 从 KV 中获取用户名和密码
    const kv_username = await c.env.NAV_KV.get("username");
    const kv_password = await c.env.NAV_KV.get("password");
    if (username !== kv_username || password !== kv_password) {
      return c.json(ResponseUtil.unauthorized("无效的用户名或密码"), 200);
    }

    //   生成 JWT Payload
    const payload = {
      username,
      // 7天过期
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 1,
    };

    const secret = c.env.JWT_SECRET;
    console.log("JWT_SECRET:", secret);
    const token = await sign(payload, secret);

    //   // 写入 HttpOnly Cookie
    setCookie(c, "auth_token", token, {
      httpOnly: true, // 前端 JS 无法读取，防 XSS
      secure: true,
      sameSite: "Strict", // 防 CSRF
      path: "/",
      maxAge: 60 * 60 * 24 * 1,
    });

    return c.json(ResponseUtil.success({ token }));
  }
);

export default auth;
