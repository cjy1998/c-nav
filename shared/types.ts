export type Theme = 'light' | 'dark' | 'system'
export type BookmarkView = 'card' | 'list'
export type Visibility = 'public' | 'private'

export interface PublicSettings {
  siteName: string
  theme: Theme
  wallpaper: 'dunes' | 'hills' | 'gradient' | 'custom'
  customWallpaperUrl: string | null
  showClock: boolean
  showRecent: boolean
  searchEngine: 'bing' | 'google' | 'baidu' | 'duckduckgo'
}

export interface Category {
  id: string
  name: string
  visibility: Visibility
  sortOrder: number
  bookmarkCount: number
  createdAt: string
  updatedAt: string
}

export interface Bookmark {
  id: string
  categoryId: string
  title: string
  url: string
  pinyin: string
  description: string
  tags: string[]
  iconUrl: string | null
  pinned: boolean
  sortOrder: number
  visitCount: number
  lastVisitedAt: string | null
  createdAt: string
  updatedAt: string
  categoryName?: string
  categoryVisibility?: Visibility
}

export interface BootstrapData {
  authenticated: boolean
  settings: PublicSettings
  categories: Category[]
  bookmarks: Bookmark[]
}

export interface LoginInput {
  username: string
  password: string
}

export interface BookmarkInput {
  categoryId: string
  title: string
  url: string
  description?: string
  tags?: string[]
  pinned?: boolean
  pinyin?: string
}

export interface CategoryInput {
  name: string
  visibility: Visibility
}

export interface ReorderInput {
  ids: string[]
  categoryId?: string
}

export interface MetadataResult {
  url: string
  title: string
  description: string
  iconUrl: string | null
}

export interface ApiError {
  error: string
  details?: unknown
}
