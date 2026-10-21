import type { BootstrapData, CategoryInput, BookmarkInput, PublicSettings, MetadataResult } from '../../shared/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `请求失败 (${response.status})` })) as { error?: string }
    throw new Error(body.error || `请求失败 (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const api = {
  bootstrap: () => request<BootstrapData>('/api/bootstrap'),
  login: (username: string, password: string) => request<{ ok: true }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  visit: (id: string) => request<{ ok: true }>(`/api/bookmarks/${id}/visit`, { method: 'POST' }),
  createCategory: (data: CategoryInput) => request('/api/admin/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: CategoryInput) => request(`/api/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request(`/api/admin/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (ids: string[]) => request('/api/admin/categories/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  createBookmark: (data: BookmarkInput & { iconUrl?: string | null }) => request('/api/admin/bookmarks', { method: 'POST', body: JSON.stringify(data) }),
  updateBookmark: (id: string, data: BookmarkInput & { iconUrl?: string | null }) => request(`/api/admin/bookmarks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBookmark: (id: string) => request(`/api/admin/bookmarks/${id}`, { method: 'DELETE' }),
  togglePin: (id: string) => request(`/api/admin/bookmarks/${id}/pin`, { method: 'PATCH' }),
  reorderBookmarks: (categoryId: string, ids: string[]) => request('/api/admin/bookmarks/reorder', { method: 'PATCH', body: JSON.stringify({ categoryId, ids }) }),
  metadata: (url: string) => request<MetadataResult>('/api/admin/metadata', { method: 'POST', body: JSON.stringify({ url }) }),
  updateSettings: (settings: PublicSettings) => request<{ settings: PublicSettings }>('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(settings) }),
  previewImport: (filename: string, content: string) => request<{ groups: ImportGroup[]; settings?: PublicSettings }>('/api/admin/import/preview', { method: 'POST', body: JSON.stringify({ filename, content }) }),
  commitImport: (groups: ImportGroup[], settings?: PublicSettings) => request<{ added: number; skipped: number }>('/api/admin/import/commit', { method: 'POST', body: JSON.stringify({ groups, settings }) }),
}

export interface ImportGroup {
  name: string
  visibility: 'public' | 'private'
  bookmarks: Array<{ title: string; url: string; description?: string; tags?: string[]; pinned?: boolean; pinyin?: string; iconUrl?: string | null; visitCount?: number; lastVisitedAt?: string | null; createdAt?: string; updatedAt?: string }>
}
