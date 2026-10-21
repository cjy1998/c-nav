import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { pinyin } from 'pinyin-pro'
import type { Bookmark, Category, PublicSettings } from '../../shared/types.js'

const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new Database(join(dataDir, 'nav.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS categories_sort_idx ON categories(sort_order);

  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    normalized_url TEXT NOT NULL UNIQUE,
    pinyin TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    icon_url TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    visit_count INTEGER NOT NULL DEFAULT 0,
    last_visited_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bookmarks_category_sort_idx ON bookmarks(category_id, sort_order);
  CREATE INDEX IF NOT EXISTS bookmarks_recent_idx ON bookmarks(last_visited_at DESC);
  CREATE INDEX IF NOT EXISTS bookmarks_created_idx ON bookmarks(created_at DESC);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

export function hashPassword(password: string, salt = randomUUID()): string {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':')
  if (!salt || !expectedHex) return false
  const actual = scryptSync(password, salt, 64)
  const expected = Buffer.from(expectedHex, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function normalizeUrl(input: string): string {
  let raw = input.trim()
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 链接')
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = ''
  return url.href
}

const defaultSettings: PublicSettings = {
  siteName: '我的导航',
  theme: 'system',
  wallpaper: 'dunes',
  customWallpaperUrl: null,
  showClock: true,
  showRecent: true,
  searchEngine: 'bing',
}

function seed() {
  const currentTime = new Date().toISOString()
  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admins').get() as { count: number }
  if (!adminCount.count) {
    const password = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin')
    if (!password) throw new Error('生产环境必须设置 ADMIN_PASSWORD')
    if (process.env.NODE_ENV === 'production' && (password.length < 12 || password === 'change-this-password')) throw new Error('生产环境管理员密码必须至少 12 位且不能使用示例密码')
    db.prepare('INSERT INTO admins (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(), process.env.ADMIN_USERNAME || 'admin', hashPassword(password), currentTime, currentTime,
    )
  }

  const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get() as { count: number }
  if (!categoryCount.count) {
    const insert = db.prepare('INSERT INTO categories (id, name, visibility, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    const categories = [
      ['常用', 'public'], ['开发', 'public'], ['设计', 'public'], ['AI 工具', 'public'], ['学习', 'public'], ['私人空间', 'private'],
    ] as const
    const categoryIds: Record<string, string> = {}
    db.transaction(() => categories.forEach(([name, visibility], index) => {
      const categoryId = randomUUID()
      categoryIds[name] = categoryId
      insert.run(categoryId, name, visibility, index, currentTime, currentTime)
    }))()

    const samples = [
      ['GitHub', 'https://github.com/', '常用', '代码托管与协作平台', ['代码', '开源'], 128, 1],
      ['哔哩哔哩', 'https://www.bilibili.com/', '常用', '视频与学习区', ['视频'], 86, 1],
      ['知乎', 'https://www.zhihu.com/', '常用', '问答社区', ['社区'], 40, 0],
      ['MDN Web Docs', 'https://developer.mozilla.org/', '开发', 'Web 标准与 API 文档', ['文档', '前端'], 72, 1],
      ['npm', 'https://www.npmjs.com/', '开发', 'JavaScript 包仓库', ['前端', '包管理'], 48, 1],
      ['Can I use', 'https://caniuse.com/', '开发', '浏览器兼容性查询', ['前端'], 25, 0],
      ['Figma', 'https://www.figma.com/', '设计', '在线协作设计工具', ['设计', '原型'], 54, 1],
      ['Iconify', 'https://icon-sets.iconify.design/', '设计', '开源图标集合', ['图标'], 17, 0],
      ['ChatGPT', 'https://chatgpt.com/', 'AI 工具', '对话式 AI 助手', ['AI', '对话'], 95, 1],
      ['通义', 'https://tongyi.aliyun.com/', 'AI 工具', '阿里通义大模型', ['AI'], 44, 0],
      ['掘金', 'https://juejin.cn/', '学习', '开发者技术社区', ['社区', '前端'], 27, 0],
      ['力扣', 'https://leetcode.cn/', '学习', '算法练习平台', ['算法'], 8, 0],
      ['家庭 NAS', 'https://nas.example.local/', '私人空间', '家庭文件与照片', ['家庭', '私密'], 37, 0],
    ] as const
    const insertBookmark = db.prepare(`INSERT INTO bookmarks
      (id, category_id, title, url, normalized_url, pinyin, description, tags_json, icon_url, pinned, sort_order, visit_count, last_visited_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`)
    db.transaction(() => samples.forEach(([title, url, cat, description, tags, visits, pinned], index) => {
      const createdAt = new Date(Date.now() - index * 86400000).toISOString()
      insertBookmark.run(randomUUID(), categoryIds[cat], title, normalizeUrl(url), normalizeUrl(url), makePinyin(title), description, JSON.stringify(tags), pinned, index, visits, new Date(Date.now() - index * 3600000).toISOString(), createdAt, currentTime)
    }))()
  }

  const settingsRow = db.prepare('SELECT key FROM settings WHERE key = ?').get('public')
  if (!settingsRow) db.prepare('INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)').run('public', JSON.stringify(defaultSettings), currentTime)
}

seed()

export function makePinyin(value: string): string {
  return pinyin(value, { toneType: 'none', type: 'array' }).join(' ').toLowerCase()
}

export function getSettings(): PublicSettings {
  const row = db.prepare('SELECT value_json FROM settings WHERE key = ?').get('public') as { value_json: string } | undefined
  return { ...defaultSettings, ...(row ? JSON.parse(row.value_json) : {}) }
}

export function setSettings(value: PublicSettings) {
  db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES ('public', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(JSON.stringify(value), new Date().toISOString())
}

type CategoryRow = { id: string; name: string; visibility: 'public' | 'private'; sort_order: number; created_at: string; updated_at: string; bookmark_count: number }
type BookmarkRow = { id: string; category_id: string; title: string; url: string; pinyin: string; description: string; tags_json: string; icon_url: string | null; pinned: number; sort_order: number; visit_count: number; last_visited_at: string | null; created_at: string; updated_at: string; category_name?: string; category_visibility?: 'public' | 'private' }

export function mapCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, visibility: row.visibility, sortOrder: row.sort_order, bookmarkCount: row.bookmark_count, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function mapBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id, categoryId: row.category_id, title: row.title, url: row.url, pinyin: row.pinyin,
    description: row.description, tags: JSON.parse(row.tags_json), iconUrl: row.icon_url,
    pinned: Boolean(row.pinned), sortOrder: row.sort_order, visitCount: row.visit_count,
    lastVisitedAt: row.last_visited_at, createdAt: row.created_at, updatedAt: row.updated_at,
    categoryName: row.category_name, categoryVisibility: row.category_visibility,
  }
}

export function listCategories(publicOnly = false): Category[] {
  const rows = db.prepare(`SELECT c.*, COUNT(b.id) AS bookmark_count FROM categories c LEFT JOIN bookmarks b ON b.category_id = c.id ${publicOnly ? "WHERE c.visibility = 'public'" : ''} GROUP BY c.id ORDER BY c.sort_order, c.created_at`).all() as CategoryRow[]
  return rows.map(mapCategory)
}

export function listBookmarks(publicOnly = false): Bookmark[] {
  const rows = db.prepare(`SELECT b.*, c.name AS category_name, c.visibility AS category_visibility FROM bookmarks b JOIN categories c ON c.id = b.category_id ${publicOnly ? "WHERE c.visibility = 'public'" : ''} ORDER BY c.sort_order, b.sort_order, b.created_at`).all() as BookmarkRow[]
  return rows.map(mapBookmark)
}
