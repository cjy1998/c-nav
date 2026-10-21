import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Bookmark, Category } from '../../shared/types'
import { Icon } from './icons'

export function Favicon({ bookmark, size = 'md' }: { bookmark: Bookmark; size?: 'sm' | 'md' | 'lg' }) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const first = [...bookmark.title.trim()][0]?.toUpperCase() || '?'
  let host = bookmark.title
  try { host = new URL(bookmark.url).hostname } catch {}
  const hue = [...host].reduce((value, char) => (value * 31 + char.codePointAt(0)!) % 360, 0)
  const hasImage = bookmark.iconUrl && loadedUrl === bookmark.iconUrl && failedUrl !== bookmark.iconUrl
  return <span className={`fav fav-${size}${hasImage ? ' has-img' : ''}`} style={{ '--h': hue } as CSSProperties} aria-hidden="true">
    {first}
    {bookmark.iconUrl && failedUrl !== bookmark.iconUrl && <img key={bookmark.iconUrl} src={bookmark.iconUrl} alt="" onLoad={() => setLoadedUrl(bookmark.iconUrl)} onError={() => setFailedUrl(bookmark.iconUrl)} />}
  </span>
}

export function Modal({ title, children, onClose, size = '' }: { title?: string; children: ReactNode; onClose: () => void; size?: 'sm' | 'lg' | 'xs' | '' }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`modal-card ${size ? `modal-${size}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      {title && <div className="dlg-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="关闭"><Icon name="x" /></button></div>}
      {children}
    </section>
  </div>
}

export function searchBookmarks(bookmarks: Bookmark[], categories: Category[], raw: string) {
  const query = raw.trim().toLowerCase()
  if (!query) return [...bookmarks].sort((a, b) => b.visitCount - a.visitCount)
  const tagOnly = query.startsWith('#')
  const terms = (tagOnly ? query.slice(1) : query).split(/\s+/).filter(Boolean)
  return bookmarks.filter((bookmark) => terms.every((term) => {
    if (tagOnly) return bookmark.tags.some((tag) => tag.toLowerCase().includes(term))
    const category = categories.find((item) => item.id === bookmark.categoryId)?.name || ''
    return [bookmark.title, bookmark.url, bookmark.pinyin, bookmark.pinyin.replace(/\s+/g, ''), bookmark.pinyin.split(/\s+/).map((part) => part[0]).join(''), bookmark.description, category, ...bookmark.tags].some((value) => value.toLowerCase().includes(term))
  })).sort((a, b) => b.visitCount - a.visitCount)
}

export function formatRecent(value: string | null) {
  if (!value) return '未访问'
  const difference = Math.max(0, Date.now() - new Date(value).getTime())
  if (difference < 3600000) return `${Math.max(1, Math.floor(difference / 60000))} 分钟前`
  if (difference < 86400000) return `${Math.floor(difference / 3600000)} 小时前`
  return `${Math.floor(difference / 86400000)} 天前`
}
