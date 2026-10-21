import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { app as App } from './app.js'
import type { Bookmark, BootstrapData, Category } from '../../shared/types.js'

let app: typeof App
let db: Database.Database
let directory: string
let cookie: string
let publicCategory: Category
let privateCategory: Category

async function request(path: string, method = 'GET', body?: unknown, authenticated = true, origin = 'http://localhost:3000') {
  return app.request(`http://localhost:3000${path}`, {
    method,
    headers: { host: 'localhost:3000', origin, ...(authenticated ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'navigation-test-'))
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('DATA_DIR', join(directory, 'data'))
  vi.stubEnv('STORAGE_DIR', join(directory, 'storage'))
  vi.stubEnv('ADMIN_USERNAME', 'admin')
  vi.stubEnv('ADMIN_PASSWORD', 'integration-test-password')
  vi.stubEnv('APP_ORIGIN', '')
  ;({ app } = await import('./app.js'))
  ;({ db } = await import('./db.js'))
  const response = await request('/api/auth/login', 'POST', { username: 'admin', password: 'integration-test-password' }, false)
  expect(response.status).toBe(200)
  expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  expect(response.headers.get('set-cookie')).toContain('SameSite=Strict')
  cookie = response.headers.get('set-cookie')!.split(';')[0]
  const data = await (await request('/api/bootstrap')).json() as BootstrapData
  publicCategory = data.categories.find((category) => category.visibility === 'public')!
  privateCategory = data.categories.find((category) => category.visibility === 'private')!
})

afterAll(() => {
  db?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('认证与公开数据隔离', () => {
  it('访客看不到私密分类、书签、搜索结果或访问接口', async () => {
    const data = await (await request('/api/bootstrap', 'GET', undefined, false)).json() as BootstrapData
    expect(data.authenticated).toBe(false)
    expect(data.categories.every((category) => category.visibility === 'public')).toBe(true)
    expect(data.bookmarks.every((bookmark) => bookmark.categoryVisibility === 'public')).toBe(true)
    const search = await (await request('/api/search?q=NAS', 'GET', undefined, false)).json()
    expect(search.bookmarks).toEqual([])
    const adminData = await (await request('/api/bootstrap')).json() as BootstrapData
    const privateBookmark = adminData.bookmarks.find((bookmark) => bookmark.categoryId === privateCategory.id)!
    expect((await request(`/api/bookmarks/${privateBookmark.id}/visit`, 'POST', undefined, false)).status).toBe(404)
    expect((await request('/api/admin/bookmarks', 'GET', undefined, false)).status).toBe(401)
    expect((await request('/api/admin/export/json', 'GET', undefined, false)).status).toBe(401)
  })

  it('拒绝不可信 Origin 和畸形 Origin', async () => {
    for (const origin of ['https://untrusted.example', 'null']) {
      expect((await request('/api/admin/categories', 'POST', { name: '不可写入', visibility: 'public' }, true, origin)).status).toBe(403)
    }
    expect((await request('/api/admin/categories', 'POST', { name: '开发同源验收', visibility: 'public' }, true, 'http://localhost:5173')).status).toBe(201)
  })

  it('退出后会话立即失效', async () => {
    const response = await request('/api/auth/login', 'POST', { username: 'admin', password: 'integration-test-password' }, false)
    const temporaryCookie = response.headers.get('set-cookie')!.split(';')[0]
    await app.request('/api/auth/logout', { method: 'POST', headers: { cookie: temporaryCookie } })
    const me = await app.request('/api/auth/me', { headers: { cookie: temporaryCookie } })
    expect(await me.json()).toEqual({ authenticated: false })
  })
})

describe('书签和分类', () => {
  it('CRUD、URL 去重、拼音搜索、置顶和数据库落盘', async () => {
    const input = { categoryId: publicCategory.id, title: '拼音验收', url: 'https://example.com/test#fragment', description: '描述', tags: ['验收'], pinned: false }
    const created = await request('/api/admin/bookmarks', 'POST', input)
    expect(created.status).toBe(201)
    const { bookmark } = await created.json() as { bookmark: Bookmark }
    expect(bookmark.url).toBe('https://example.com/test')
    const persisted = new Database(join(directory, 'data/nav.db'), { readonly: true })
    expect(persisted.prepare('SELECT title FROM bookmarks WHERE id = ?').get(bookmark.id)).toEqual({ title: input.title })
    persisted.close()
    expect((await request('/api/admin/bookmarks', 'POST', { ...input, url: 'https://example.com:443/test#another' })).status).toBe(409)
    const search = await (await request('/api/search?q=pinyin')).json()
    expect(search.bookmarks.some((item: Bookmark) => item.id === bookmark.id)).toBe(true)
    const updated = await request(`/api/admin/bookmarks/${bookmark.id}`, 'PATCH', { ...input, title: '编辑验收' })
    expect(updated.status).toBe(200)
    expect((await updated.json()).bookmark.title).toBe('编辑验收')
    const pinned = await request(`/api/admin/bookmarks/${bookmark.id}/pin`, 'PATCH')
    expect((await pinned.json()).bookmark.pinned).toBe(true)
    expect((await request(`/api/bookmarks/${bookmark.id}/visit`, 'POST')).status).toBe(200)
    expect((await request(`/api/admin/bookmarks/${bookmark.id}`, 'DELETE')).status).toBe(200)
    expect((await request(`/api/admin/bookmarks/${bookmark.id}`, 'DELETE')).status).toBe(404)
  })

  it('分类排序静态路由及书签跨分类排序', async () => {
    const data = await (await request('/api/bootstrap')).json() as BootstrapData
    const ids = data.categories.map((category) => category.id).reverse()
    expect((await request('/api/admin/categories/reorder', 'PATCH', { ids })).status).toBe(200)
    const sorted = await (await request('/api/bootstrap')).json() as BootstrapData
    expect(sorted.categories.map((category) => category.id)).toEqual(ids)
    const created = await request('/api/admin/bookmarks', 'POST', { categoryId: publicCategory.id, title: '排序验收', url: 'https://example.com/reorder' })
    const { bookmark } = await created.json() as { bookmark: Bookmark }
    expect((await request('/api/admin/bookmarks/reorder', 'PATCH', { ids: [bookmark.id], categoryId: privateCategory.id })).status).toBe(200)
    const moved = await (await request('/api/bootstrap')).json() as BootstrapData
    expect(moved.bookmarks.find((item) => item.id === bookmark.id)?.categoryId).toBe(privateCategory.id)
    await request(`/api/admin/bookmarks/${bookmark.id}`, 'DELETE')
  })

  it('删除最后一个非空私密分类时不自动公开私密书签', async () => {
    const response = await request(`/api/admin/categories/${privateCategory.id}`, 'DELETE')
    expect(response.status).toBe(400)
    const guest = await (await request('/api/bootstrap', 'GET', undefined, false)).json() as BootstrapData
    expect(guest.bookmarks.some((bookmark) => bookmark.title === '家庭 NAS')).toBe(false)
  })

  it('重复分类名及不存在的目标分类返回客户端错误', async () => {
    expect((await request(`/api/admin/categories/${privateCategory.id}`, 'PATCH', { name: publicCategory.name, visibility: 'private' })).status).toBe(409)
    const missingId = '11111111-1111-4111-8111-111111111111'
    const data = await (await request('/api/bootstrap')).json() as BootstrapData
    const bookmark = data.bookmarks[0]
    expect((await request(`/api/admin/bookmarks/${bookmark.id}`, 'PATCH', { ...bookmark, categoryId: missingId })).status).toBe(400)
    expect((await request('/api/admin/bookmarks/reorder', 'PATCH', { ids: [bookmark.id], categoryId: missingId })).status).toBe(400)
  })
})

describe('导入导出', () => {
  it('浏览器 HTML 按文件夹预览、去重导入并安全导出', async () => {
    const content = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>导入验收</H3><DL><p><DT><A HREF="https://example.com/import">导入 &lt;验收&gt;</A><DT><A HREF="https://example.com/import#duplicate">重复</A></DL><p></DL>'
    const preview = await (await request('/api/admin/import/preview', 'POST', { filename: 'bookmarks.html', content })).json()
    expect(preview.groups[0].name).toBe('导入验收')
    const committed = await request('/api/admin/import/commit', 'POST', preview)
    expect(await committed.json()).toEqual({ added: 1, skipped: 1 })
    const exported = await request('/api/admin/export/html')
    expect(await exported.text()).toContain('导入 &lt;验收&gt;')
    expect(exported.headers.get('content-disposition')).toContain('attachment')
  })

  it('JSON 备份导入保留描述、标签、置顶、图标和访问记录', async () => {
    const content = JSON.stringify({ categories: [{ id: 'source', name: '备份验收', visibility: 'private' }], bookmarks: [{ categoryId: 'source', title: '完整备份', url: 'https://example.com/backup', description: '不能丢失', tags: ['标签'], pinned: true, pinyin: 'wan zheng', iconUrl: 'https://example.com/favicon.ico', visitCount: 7, lastVisitedAt: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-19T00:00:00.000Z' }] })
    const preview = await (await request('/api/admin/import/preview', 'POST', { filename: 'backup.json', content })).json()
    expect((await request('/api/admin/import/commit', 'POST', preview)).status).toBe(200)
    const data = await (await request('/api/bootstrap')).json() as BootstrapData
    const bookmark = data.bookmarks.find((item) => item.title === '完整备份')!
    expect(bookmark).toMatchObject({ description: '不能丢失', tags: ['标签'], pinned: true, iconUrl: 'https://example.com/favicon.ico', visitCount: 7, lastVisitedAt: '2026-10-20T00:00:00.000Z', createdAt: '2026-10-19T00:00:00.000Z', categoryVisibility: 'private' })
  })

  it('私密导入分类与同名公开分类冲突时拒绝导入', async () => {
    const response = await request('/api/admin/import/commit', 'POST', { groups: [{ name: publicCategory.name, visibility: 'private', bookmarks: [{ title: '不能公开', url: 'https://example.com/private-import' }] }] })
    expect(response.status).toBe(409)
  })
})
