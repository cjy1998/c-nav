import { createHash, randomBytes } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { db, hashPassword, verifyPassword } from './db.js'

const COOKIE_NAME = 'nav_session'
const sessionDays = Math.max(1, Number(process.env.SESSION_TTL_DAYS || 30))

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function login(username: string, password: string): string | null {
  const admin = db.prepare('SELECT id, password_hash FROM admins WHERE username = ?').get(username) as { id: string; password_hash: string } | undefined
  if (!admin || !verifyPassword(password, admin.password_hash)) return null
  const token = randomBytes(32).toString('base64url')
  const currentTime = new Date()
  const expiresAt = new Date(currentTime.getTime() + sessionDays * 86400000)
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(currentTime.toISOString())
  db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(tokenHash(token), admin.id, expiresAt.toISOString(), currentTime.toISOString())
  return token
}

export function logout(token: string | undefined) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
}

/** 校验原密码后更新为新密码；原密码不正确返回 false */
export function changePassword(adminId: string, currentPassword: string, nextPassword: string): boolean {
  const admin = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(adminId) as { password_hash: string } | undefined
  if (!admin || !verifyPassword(currentPassword, admin.password_hash)) return false
  db.prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(nextPassword), new Date().toISOString(), adminId)
  return true
}

/** 修改密码后让其它设备上的登录失效，保留当前会话 */
export function revokeOtherSessions(adminId: string, currentToken: string | undefined) {
  if (currentToken) db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash <> ?').run(adminId, tokenHash(currentToken))
  else db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(adminId)
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.COOKIE_SECURE === undefined ? process.env.NODE_ENV === 'production' : process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: sessionDays * 86400,
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
}

export function currentAdminId(c: Context): string | null {
  const token = getCookie(c, COOKIE_NAME)
  if (!token) return null
  const row = db.prepare('SELECT admin_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash(token), new Date().toISOString()) as { admin_id: string } | undefined
  return row?.admin_id || null
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!currentAdminId(c)) return c.json({ error: '请先登录' }, 401)
  await next()
}

export function sessionToken(c: Context) {
  return getCookie(c, COOKIE_NAME)
}
