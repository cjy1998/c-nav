import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { getCookie } from "hono/cookie";
import { ResponseUtil } from "../utils/response";

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = getCookie(c, "auth_token");
  if (!token) {
    return c.json(ResponseUtil.unauthorized("用户未登录或登录过期"));
  }

  try {
    const secret = c.env.JWT_SECRET;
    const payload = await verify(token, secret);
    // 把用户信息挂载到 Context 上
    c.set("jwtPayload", payload);
    await next();
  } catch (e) {
    return c.json(ResponseUtil.unauthorized("无效的登录凭证"));
  }
});
