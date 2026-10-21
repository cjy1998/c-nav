import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { z } from 'zod'
import * as cheerio from 'cheerio'
import { clearSessionCookie, currentAdminId, login, logout, requireAuth, sessionToken, setSessionCookie } from './auth.js'
import { db, getSettings, listBookmarks, listCategories, makePinyin, mapBookmark, normalizeUrl, setSettings } from './db.js'
import { fetchMetadata } from './metadata.js'
import type { Bookmark, PublicSettings } from '../../shared/types.js'

export const app = new Hono()
const storageDir = process.env.STORAGE_DIR || join(process.cwd(), 'storage')
mkdirSync(join(storageDir, 'icons'), { recursive: true })
mkdirSync(join(storageDir, 'wallpapers'), { recursive: true })

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    connectSrc: ["'self'"],
  },
  crossOriginResourcePolicy: 'cross-origin',
}))

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : error.message }, 500)
})

app.use('/api/*', bodyLimit({ maxSize: 12 * 1024 * 1024, onError: (c) => c.json({ error: '请求不能超过 12 MB' }, 413) }))
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin')
    if (origin) {
      const expected = process.env.APP_ORIGIN
      const host = c.req.header('host') || ''
      let trusted = false
      try {
        const source = new URL(origin)
        trusted = expected ? source.origin === new URL(expected).origin : source.host === host
        if (!trusted && !expected && process.env.NODE_ENV !== 'production') {
          const sourceHostname = source.hostname.replace(/^\[|\]$/g, '')
          const targetHostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, '')
          const loopback = new Set(['localhost', '127.0.0.1', '::1'])
          trusted = loopback.has(sourceHostname) && loopback.has(targetHostname)
        }
      } catch { trusted = false }
      if (!trusted) return c.json({ error: '请求来源不可信' }, 403)
    }
  }
  await next()
})
app.get('/api/health', (c) => c.json({ ok: true, time: new Date().toISOString() }))

const attempts = new Map<string, { count: number; resetAt: number }>()
app.post('/api/auth/login', async (c) => {
  const key = 'admin'
  const stamp = Date.now()
  const record = attempts.get(key)
  if (record && record.resetAt > stamp && record.count >= 5) return c.json({ error: '登录尝试过多，请稍后再试' }, 429)
  const input = await readJson(c, z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }))
  if (!input.ok) return c.json({ error: input.error }, 400)
  const token = login(input.data.username, input.data.password)
  if (!token) {
    attempts.set(key, { count: (record?.resetAt && record.resetAt > stamp ? record.count : 0) + 1, resetAt: stamp + 10 * 60 * 1000 })
    return c.json({ error: '账号或密码错误' }, 401)
  }
  attempts.delete(key)
  setSessionCookie(c, token)
  return c.json({ ok: true })
})

app.post('/api/auth/logout', (c) => {
  logout(sessionToken(c))
  clearSessionCookie(c)
  return c.json({ ok: true })
})

app.get('/api/auth/me', (c) => c.json({ authenticated: Boolean(currentAdminId(c)) }))

app.get('/api/bootstrap', (c) => {
  const authenticated = Boolean(currentAdminId(c))
  return c.json({
    authenticated,
    settings: getSettings(),
    categories: listCategories(!authenticated),
    bookmarks: listBookmarks(!authenticated),
  })
})

app.get('/api/search', (c) => {
  const query = (c.req.query('q') || '').trim().slice(0, 100)
  const authenticated = Boolean(currentAdminId(c))
  if (!query) return c.json({ bookmarks: [] })
  const tagOnly = query.startsWith('#')
  const terms = (tagOnly ? query.slice(1) : query).toLowerCase().split(/\s+/).filter(Boolean)
  const bookmarks = listBookmarks(!authenticated).filter((bookmark) => terms.every((term) => {
    if (tagOnly) return bookmark.tags.some((tag) => tag.toLowerCase().includes(term))
    return [bookmark.title, bookmark.url, bookmark.pinyin, bookmark.pinyin.replace(/\s+/g, ''), bookmark.pinyin.split(/\s+/).map((part) => part[0]).join(''), bookmark.description, bookmark.categoryName || '', ...bookmark.tags].some((value) => value.toLowerCase().includes(term))
  })).slice(0, 30)
  return c.json({ bookmarks })
})

app.post('/api/bookmarks/:id/visit', (c) => {
  const authenticated = Boolean(currentAdminId(c))
  const row = db.prepare('SELECT b.id, c.visibility FROM bookmarks b JOIN categories c ON c.id = b.category_id WHERE b.id = ?').get(c.req.param('id')) as { id: string; visibility: string } | undefined
  if (!row || (!authenticated && row.visibility !== 'public')) return c.json({ error: '书签不存在' }, 404)
  db.prepare('UPDATE bookmarks SET visit_count = visit_count + 1, last_visited_at = ?, updated_at = ? WHERE id = ?').run(new Date().toISOString(), new Date().toISOString(), row.id)
  return c.json({ ok: true })
})

app.use('/api/admin/*', requireAuth)
const categorySchema = z.object({ name: z.string().trim().min(1).max(30), visibility: z.enum(['public', 'private']) })
const bookmarkSchema = z.object({
  categoryId: z.string().uuid(), title: z.string().trim().min(1).max(200), url: z.string().trim().min(1).max(2000),
  description: z.string().trim().max(500).default(''), tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  pinned: z.boolean().default(false), pinyin: z.string().trim().max(500).default(''), iconUrl: z.string().url().max(2000).nullable().optional(),
})

app.get('/api/admin/categories', (c) => c.json({ categories: listCategories(false) }))
app.post('/api/admin/categories', async (c) => {
  const input = await readJson(c, categorySchema)
  if (!input.ok) return c.json({ error: input.error }, 400)
  if (db.prepare('SELECT id FROM categories WHERE name = ?').get(input.data.name)) return c.json({ error: '分类名称已存在' }, 409)
  const currentTime = new Date().toISOString()
  const sortOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM categories').get() as { value: number }).value
  const categoryId = randomUUID()
  db.prepare('INSERT INTO categories (id, name, visibility, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(categoryId, input.data.name, input.data.visibility, sortOrder, currentTime, currentTime)
  return c.json({ category: listCategories(false).find((item) => item.id === categoryId) }, 201)
})
app.patch('/api/admin/categories/reorder', async (c) => {
  const input = await readJson(c, z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }))
  if (!input.ok) return c.json({ error: input.error }, 400)
  const ids = listCategories(false).map((category) => category.id)
  if (input.data.ids.length !== ids.length || new Set(input.data.ids).size !== ids.length || input.data.ids.some((id) => !ids.includes(id))) return c.json({ error: '排序必须包含全部分类且不能重复' }, 400)
  const update = db.prepare('UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?')
  db.transaction(() => input.data.ids.forEach((categoryId, index) => update.run(index, new Date().toISOString(), categoryId)))()
  return c.json({ ok: true })
})
app.patch('/api/admin/categories/:id', async (c) => {
  const input = await readJson(c, categorySchema)
  if (!input.ok) return c.json({ error: input.error }, 400)
  if (db.prepare('SELECT id FROM categories WHERE name = ? AND id <> ?').get(input.data.name, c.req.param('id'))) return c.json({ error: '分类名称已存在' }, 409)
  const result = db.prepare('UPDATE categories SET name = ?, visibility = ?, updated_at = ? WHERE id = ?').run(input.data.name, input.data.visibility, new Date().toISOString(), c.req.param('id'))
  if (!result.changes) return c.json({ error: '分类不存在' }, 404)
  return c.json({ category: listCategories(false).find((item) => item.id === c.req.param('id')) })
})
app.delete('/api/admin/categories/:id', (c) => {
  const categoryId = c.req.param('id')
  const count = (db.prepare('SELECT COUNT(*) AS value FROM categories').get() as { value: number }).value
  if (count <= 1) return c.json({ error: '至少保留一个分类' }, 400)
  const current = db.prepare('SELECT id, visibility FROM categories WHERE id = ?').get(categoryId) as { id: string; visibility: string } | undefined
  if (!current) return c.json({ error: '分类不存在' }, 404)
  const destination = db.prepare('SELECT id FROM categories WHERE id <> ? AND visibility = ? ORDER BY sort_order LIMIT 1').get(categoryId, current.visibility) as { id: string } | undefined
  if (!destination && db.prepare('SELECT id FROM bookmarks WHERE category_id = ? LIMIT 1').get(categoryId)) return c.json({ error: '请先移动或删除书签，不能自动改变书签的公开范围' }, 400)
  db.transaction(() => {
    if (destination) db.prepare('UPDATE bookmarks SET category_id = ?, updated_at = ? WHERE category_id = ?').run(destination.id, new Date().toISOString(), categoryId)
    db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId)
  })()
  return c.json({ ok: true, movedTo: destination?.id || null })
})
app.get('/api/admin/bookmarks', (c) => c.json({ bookmarks: listBookmarks(false) }))
app.post('/api/admin/bookmarks', async (c) => {
  const input = await readJson(c, bookmarkSchema)
  if (!input.ok) return c.json({ error: input.error }, 400)
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(input.data.categoryId)) return c.json({ error: '分类不存在' }, 400)
  let normalized: string
  try { normalized = normalizeUrl(input.data.url) } catch (error) { return c.json({ error: (error as Error).message }, 400) }
  if (db.prepare('SELECT id FROM bookmarks WHERE normalized_url = ?').get(normalized)) return c.json({ error: '这个网址已经收藏过了' }, 409)
  const currentTime = new Date().toISOString()
  const sortOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM bookmarks WHERE category_id = ?').get(input.data.categoryId) as { value: number }).value
  const bookmarkId = randomUUID()
  db.prepare(`INSERT INTO bookmarks (id, category_id, title, url, normalized_url, pinyin, description, tags_json, icon_url, pinned, sort_order, visit_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).run(bookmarkId, input.data.categoryId, input.data.title, normalized, normalized, input.data.pinyin || makePinyin(input.data.title), input.data.description, JSON.stringify([...new Set(input.data.tags)]), input.data.iconUrl || null, Number(input.data.pinned), sortOrder, currentTime, currentTime)
  return c.json({ bookmark: listBookmarks(false).find((item) => item.id === bookmarkId) }, 201)
})
app.patch('/api/admin/bookmarks/reorder', async (c) => {
  const input = await readJson(c, z.object({ ids: z.array(z.string().uuid()).min(1).max(10000), categoryId: z.string().uuid() }))
  if (!input.ok) return c.json({ error: input.error }, 400)
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(input.data.categoryId)) return c.json({ error: '分类不存在' }, 400)
  if (new Set(input.data.ids).size !== input.data.ids.length || input.data.ids.some((id) => !db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(id))) return c.json({ error: '书签排序包含重复或不存在的书签' }, 400)
  const update = db.prepare('UPDATE bookmarks SET category_id = ?, sort_order = ?, updated_at = ? WHERE id = ?')
  db.transaction(() => input.data.ids.forEach((bookmarkId, index) => update.run(input.data.categoryId, index, new Date().toISOString(), bookmarkId)))()
  return c.json({ ok: true })
})
app.patch('/api/admin/bookmarks/:id', async (c) => {
  const input = await readJson(c, bookmarkSchema)
  if (!input.ok) return c.json({ error: input.error }, 400)
  if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(input.data.categoryId)) return c.json({ error: '分类不存在' }, 400)
  let normalized: string
  try { normalized = normalizeUrl(input.data.url) } catch (error) { return c.json({ error: (error as Error).message }, 400) }
  const duplicate = db.prepare('SELECT id FROM bookmarks WHERE normalized_url = ? AND id <> ?').get(normalized, c.req.param('id'))
  if (duplicate) return c.json({ error: '这个网址已经收藏过了' }, 409)
  const result = db.prepare(`UPDATE bookmarks SET category_id = ?, title = ?, url = ?, normalized_url = ?, pinyin = ?, description = ?, tags_json = ?, icon_url = ?, pinned = ?, updated_at = ? WHERE id = ?`).run(
    input.data.categoryId, input.data.title, normalized, normalized, input.data.pinyin || makePinyin(input.data.title), input.data.description, JSON.stringify([...new Set(input.data.tags)]), input.data.iconUrl || null, Number(input.data.pinned), new Date().toISOString(), c.req.param('id'),
  )
  if (!result.changes) return c.json({ error: '书签不存在' }, 404)
  return c.json({ bookmark: listBookmarks(false).find((item) => item.id === c.req.param('id')) })
})
app.delete('/api/admin/bookmarks/:id', (c) => {
  const result = db.prepare('DELETE FROM bookmarks WHERE id = ?').run(c.req.param('id'))
  if (!result.changes) return c.json({ error: '书签不存在' }, 404)
  return c.json({ ok: true })
})
app.patch('/api/admin/bookmarks/:id/pin', (c) => {
  const result = db.prepare('UPDATE bookmarks SET pinned = CASE pinned WHEN 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?').run(new Date().toISOString(), c.req.param('id'))
  if (!result.changes) return c.json({ error: '书签不存在' }, 404)
  return c.json({ bookmark: listBookmarks(false).find((item) => item.id === c.req.param('id')) })
})

app.post('/api/admin/metadata', async (c) => {
  const input = await readJson(c, z.object({ url: z.string().trim().min(1).max(2000) }))
  if (!input.ok) return c.json({ error: input.error }, 400)
  try { return c.json(await fetchMetadata(input.data.url)) }
  catch (error) { return c.json({ error: (error as Error).message }, 400) }
})

const settingsSchema = z.object({
  siteName: z.string().trim().min(1).max(30), theme: z.enum(['light', 'dark', 'system']),
  wallpaper: z.enum(['dunes', 'hills', 'gradient', 'custom']), customWallpaperUrl: z.string().url().max(2000).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), '壁纸只支持 HTTP 或 HTTPS 地址').nullable(),
  showClock: z.boolean(), showRecent: z.boolean(), searchEngine: z.enum(['bing', 'google', 'baidu', 'duckduckgo']),
})
app.get('/api/admin/settings', (c) => c.json({ settings: getSettings() }))
app.patch('/api/admin/settings', async (c) => {
  const input = await readJson(c, settingsSchema)
  if (!input.ok) return c.json({ error: input.error }, 400)
  setSettings(input.data as PublicSettings)
  return c.json({ settings: getSettings() })
})

app.post('/api/admin/import/preview', async (c) => {
  const input = await readJson(c, z.object({ filename: z.string().max(255), content: z.string().max(10 * 1024 * 1024) }))
  if (!input.ok) return c.json({ error: input.error }, 400)
  try { return c.json(parseImport(input.data.filename, input.data.content)) }
  catch (error) { return c.json({ error: (error as Error).message }, 400) }
})

const importBookmarkSchema = bookmarkSchema.omit({ categoryId: true }).extend({
  visitCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  lastVisitedAt: z.iso.datetime().nullable().default(null),
  createdAt: z.iso.datetime().optional(), updatedAt: z.iso.datetime().optional(),
})
const importSchema = z.object({
  groups: z.array(z.object({ name: z.string().trim().min(1).max(100), visibility: z.enum(['public', 'private']).default('public'), bookmarks: z.array(importBookmarkSchema).max(10000) })).max(500),
  settings: settingsSchema.optional(),
})
app.post('/api/admin/import/commit', async (c) => {
  const input = await readJson(c, importSchema)
  if (!input.ok) return c.json({ error: input.error }, 400)
  const visibilityByName = new Map(listCategories(false).map((category) => [category.name, category.visibility]))
  for (const group of input.data.groups) {
    const visibility = visibilityByName.get(group.name)
    if (visibility && visibility !== group.visibility) return c.json({ error: `分类「${group.name}」公开范围不同，请先重命名分类` }, 409)
    visibilityByName.set(group.name, group.visibility)
  }
  let added = 0, skipped = 0
  const currentTime = new Date().toISOString()
  const insertCategory = db.prepare('INSERT INTO categories (id, name, visibility, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
  const insertBookmark = db.prepare(`INSERT INTO bookmarks (id, category_id, title, url, normalized_url, pinyin, description, tags_json, icon_url, pinned, sort_order, visit_count, last_visited_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  db.transaction(() => {
    for (const group of input.data.groups) {
      let cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(group.name) as { id: string } | undefined
      if (!cat) {
        const catId = randomUUID()
        const sortOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM categories').get() as { value: number }).value
        insertCategory.run(catId, group.name, group.visibility, sortOrder, currentTime, currentTime)
        cat = { id: catId }
      }
      let order = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM bookmarks WHERE category_id = ?').get(cat.id) as { value: number }).value
      for (const item of group.bookmarks) {
        let normalized: string
        try { normalized = normalizeUrl(item.url) } catch { skipped++; continue }
        if (db.prepare('SELECT id FROM bookmarks WHERE normalized_url = ?').get(normalized)) { skipped++; continue }
        insertBookmark.run(randomUUID(), cat.id, item.title, normalized, normalized, item.pinyin || makePinyin(item.title), item.description, JSON.stringify([...new Set(item.tags)]), item.iconUrl || null, Number(item.pinned), order++, item.visitCount, item.lastVisitedAt, item.createdAt || currentTime, item.updatedAt || currentTime)
        added++
      }
    }
    if (input.data.settings) setSettings(input.data.settings)
  })()
  return c.json({ added, skipped })
})

app.get('/api/admin/export/json', (c) => {
  const content = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: getSettings(), categories: listCategories(false), bookmarks: listBookmarks(false) }, null, 2)
  c.header('Content-Disposition', `attachment; filename="navigation-${new Date().toISOString().slice(0, 10)}.json"`)
  c.header('Content-Type', 'application/json; charset=utf-8')
  return c.body(content)
})
app.get('/api/admin/export/html', (c) => {
  const categories = listCategories(false)
  const bookmarks = listBookmarks(false)
  const folders = categories.map((category) => `<DT><H3>${escapeHtml(category.name)}</H3><DL><p>\n${bookmarks.filter((bookmark) => bookmark.categoryId === category.id).map((bookmark) => `<DT><A HREF="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.title)}</A>`).join('\n')}\n</DL><p>`).join('\n')
  const content = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${folders}\n</DL><p>`
  c.header('Content-Disposition', `attachment; filename="bookmarks-${new Date().toISOString().slice(0, 10)}.html"`)
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.body(content)
})

app.all('/api/ext/v1/*', (c) => c.json({ error: '浏览器扩展接口尚未启用' }, 501))

app.use('/storage/*', serveStatic({ root: storageDir, rewriteRequestPath: (path) => path.replace(/^\/storage/, '') }))
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist/web' }))
  app.get('*', serveStatic({ path: './dist/web/index.html' }))
}

async function readJson<T extends z.ZodTypeAny>(c: { req: { json: () => Promise<unknown> } }, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; error: string }> {
  try {
    const parsed = schema.safeParse(await c.req.json())
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message || '请求数据不正确' }
  } catch (_) { return { ok: false, error: '请求必须是有效 JSON' } }
}

function parseImport(filename: string, content: string) {
  if (filename.toLowerCase().endsWith('.json')) {
    const value = z.object({
      categories: z.array(z.object({ id: z.string(), name: z.string(), visibility: z.enum(['public', 'private']).default('public') })).max(500),
      bookmarks: z.array(importBookmarkSchema.extend({ categoryId: z.string() })).max(10000),
      settings: settingsSchema.optional(),
    }).parse(JSON.parse(content))
    const groups = value.categories.map((category) => ({
      name: category.name, visibility: category.visibility,
      bookmarks: value.bookmarks.filter((bookmark) => bookmark.categoryId === category.id),
    }))
    if (!groups.length) throw new Error('备份中没有找到分类')
    if (value.bookmarks.some((bookmark) => !value.categories.some((category) => category.id === bookmark.categoryId))) throw new Error('备份中的书签缺少对应分类')
    return importSchema.parse({ groups, settings: value.settings })
  }
  const $ = cheerio.load(content)
  const groups: Array<{ name: string; visibility: 'public'; bookmarks: Array<{ title: string; url: string }> }> = []
  $('h3').each((_, heading) => {
    const container = $(heading).next('dl')
    const bookmarks = container.find('a[href]').map((__, anchor) => ({ title: $(anchor).text().trim() || $(anchor).attr('href')!, url: $(anchor).attr('href')! })).get()
    if (bookmarks.length) groups.push({ name: $(heading).text().trim() || '未分类', visibility: 'public', bookmarks })
  })
  if (!groups.length) {
    const bookmarks = $('a[href]').map((_, anchor) => ({ title: $(anchor).text().trim() || $(anchor).attr('href')!, url: $(anchor).attr('href')! })).get()
    if (bookmarks.length) groups.push({ name: '导入书签', visibility: 'public', bookmarks })
  }
  if (!groups.length) throw new Error('文件中没有找到书签')
  return { groups }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!))
}
