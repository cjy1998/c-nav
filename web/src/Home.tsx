import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type { BootstrapData, Bookmark } from '../../shared/types'
import { api } from './api'
import { Icon } from './icons'
import { Favicon, formatRecent, searchBookmarks } from './ui'

interface Props {
  data: BootstrapData
  onLogin: () => void
  onManage: () => void
  effectiveTheme: 'light' | 'dark'
}

const engines = {
  bing: { name: 'Bing', letter: 'B', color: '#14866d', url: 'https://www.bing.com/search?q=' },
  google: { name: 'Google', letter: 'G', color: '#4285f4', url: 'https://www.google.com/search?q=' },
  baidu: { name: '百度', letter: '百', color: '#315efb', url: 'https://www.baidu.com/s?wd=' },
  duckduckgo: { name: 'DuckDuckGo', letter: 'D', color: '#de5833', url: 'https://duckduckgo.com/?q=' },
} as const

type EngineKey = keyof typeof engines

export function Home({ data, onLogin, onManage, effectiveTheme }: Props) {
  const [time, setTime] = useState(new Date())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [engine, setEngine] = useState<EngineKey>(data.settings.searchEngine)
  const [engineOpen, setEngineOpen] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const publicCategories = useMemo(() => data.categories.filter((category) => category.visibility === 'public'), [data.categories])
  const publicBookmarks = useMemo(() => data.bookmarks.filter((bookmark) => publicCategories.some((category) => category.id === bookmark.categoryId)), [data.bookmarks, publicCategories])
  const results = useMemo(() => query ? searchBookmarks(publicBookmarks, publicCategories, query).slice(0, 6) : [], [query, publicBookmarks, publicCategories])
  const wallpaper = data.settings.wallpaper
  const wallpaperStyle = wallpaper === 'dunes' || wallpaper === 'hills'
    ? { backgroundImage: `url('/assets/${wallpaper}-${effectiveTheme}.jpg')` }
    : wallpaper === 'custom' && data.settings.customWallpaperUrl ? { backgroundImage: `url('${data.settings.customWallpaperUrl}')` } : undefined

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => setSelected(0), [query])

  function openBookmark(bookmark: Bookmark) {
    void api.visit(bookmark.id)
  }

  function webSearch() {
    const value = query.trim()
    if (!value) return
    window.open(`${engines[engine].url}${encodeURIComponent(value)}`, '_blank', 'noopener')
    setQuery('')
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    const count = results.length + 1
    if (event.key === 'Escape') { setQuery(''); setEngineOpen(false) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => (value + 1) % count) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => (value - 1 + count) % count) }
    else if (event.key === 'Tab' && query) {
      event.preventDefault()
      const keys = Object.keys(engines) as EngineKey[]
      setEngine(keys[(keys.indexOf(engine) + 1) % keys.length])
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const bookmark = results[selected]
      if (bookmark) { openBookmark(bookmark); window.open(bookmark.url, '_blank', 'noopener'); setQuery('') }
      else webSearch()
    }
  }

  const pinned = publicBookmarks.filter((bookmark) => bookmark.pinned).slice(0, 8)
  const recent = [...publicBookmarks].filter((bookmark) => bookmark.lastVisitedAt).sort((a, b) => new Date(b.lastVisitedAt!).getTime() - new Date(a.lastVisitedAt!).getTime()).slice(0, 8)

  return <div className="home">
    <div className={`wp ${wallpaper === 'gradient' ? 'wp-gradient' : ''}`} style={wallpaperStyle} aria-hidden="true" />
    <header className="home-top">
      <a className="home-brand" href="#/"><span className="logo-mark"><Icon name="logo" /></span><span>{data.settings.siteName}</span></a>
      <div className="home-actions">
        {data.authenticated
          ? <button className="glass-btn" onClick={onManage}><Icon name="grid" /><span className="label">管理书签</span></button>
          : <button className="glass-btn" onClick={onLogin}><Icon name="lock" /><span className="label">登录管理</span></button>}
      </div>
    </header>

    <section className="hero">
      {data.settings.showClock && <div className="clock-wrap"><div className="clock">{time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</div><div className="hero-date">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(time)}</div></div>}
      <div className="hsearch">
        <div className="hsearch-box">
          <button className="engine-btn" onClick={() => setEngineOpen((value) => !value)} aria-label="切换搜索引擎" aria-expanded={engineOpen}>
            <span className="engine-dot" style={{ background: engines[engine].color }}>{engines[engine].letter}</span><Icon name="more" size={14} />
          </button>
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleKey} placeholder="搜索书签，或回车搜索网页" aria-label="搜索" autoComplete="off" />
          {!query && <kbd className="hs-kbd">/</kbd>}
        </div>
        {engineOpen && <div className="engine-menu">{(Object.keys(engines) as EngineKey[]).map((key) => <button key={key} className="engine-opt" onClick={() => { setEngine(key); setEngineOpen(false) }} aria-selected={engine === key}><span className="engine-dot" style={{ background: engines[key].color }}>{engines[key].letter}</span><span>{engines[key].name}</span>{engine === key && <span className="check-mark">✓</span>}</button>)}</div>}
        {query && <div className="hsearch-drop" role="listbox">
          <div className="drop-group">{results.length ? '书签' : '没有匹配的书签'}</div>
          {results.map((bookmark, index) => <a key={bookmark.id} className="drop-opt" aria-selected={selected === index} href={bookmark.url} target="_blank" rel="noopener" onMouseEnter={() => setSelected(index)} onClick={() => openBookmark(bookmark)}><Favicon bookmark={bookmark} /><span className="drop-main"><span className="drop-title">{bookmark.title}</span><span className="drop-sub">{new URL(bookmark.url).hostname} · {publicCategories.find((item) => item.id === bookmark.categoryId)?.name}</span></span><kbd className="drop-enter">↵</kbd></a>)}
          <button className="drop-opt web-search-row" aria-selected={selected === results.length} onMouseEnter={() => setSelected(results.length)} onClick={webSearch}><span className="web-ico"><span className="engine-dot" style={{ background: engines[engine].color }}>{engines[engine].letter}</span></span><span className="drop-main"><span className="drop-title">用 {engines[engine].name} 搜索“{query}”</span><span className="drop-sub">按 Tab 切换搜索引擎</span></span></button>
          <div className="drop-tip"><span><kbd>↑</kbd><kbd>↓</kbd>选择 <kbd>↵</kbd>打开</span><span><kbd>Tab</kbd>切换搜索引擎</span></div>
        </div>}
      </div>
      <nav className="dock" aria-label="置顶网站">{pinned.map((bookmark) => <a key={bookmark.id} className="dock-item" href={bookmark.url} target="_blank" rel="noopener" onClick={() => openBookmark(bookmark)}><span className="dock-icon"><Favicon bookmark={bookmark} size="lg" /></span><span className="dock-label">{bookmark.title}</span></a>)}</nav>
    </section>

    <main className="home-body">
      {data.settings.showRecent && recent.length > 0 && <section className="glass-panel recent-panel"><div className="recent-label"><Icon name="clock" size={16} />最近访问</div><div className="recent-chips">{recent.map((bookmark) => <a key={bookmark.id} className="chip" href={bookmark.url} target="_blank" rel="noopener" onClick={() => openBookmark(bookmark)}><Favicon bookmark={bookmark} size="sm" /><span>{bookmark.title}</span><small>{formatRecent(bookmark.lastVisitedAt)}</small></a>)}</div></section>}
      <div className="cat-cols">{publicCategories.map((category) => {
        const bookmarks = publicBookmarks.filter((bookmark) => bookmark.categoryId === category.id)
        if (!bookmarks.length) return null
        const isExpanded = expanded.includes(category.id)
        return <section key={category.id} className="glass-panel cat-panel"><div className="cat-panel-head"><span className="cat-dot" />{category.name}<span className="count">{bookmarks.length}</span></div><div className="hl-list">{bookmarks.slice(0, isExpanded ? bookmarks.length : 8).map((bookmark) => <a key={bookmark.id} className="hl" href={bookmark.url} target="_blank" rel="noopener" onClick={() => openBookmark(bookmark)}><Favicon bookmark={bookmark} size="sm" /><span>{bookmark.title}</span></a>)}{bookmarks.length > 8 && <button className="more-btn" onClick={() => setExpanded((items) => items.includes(category.id) ? items.filter((id) => id !== category.id) : [...items, category.id])}>{isExpanded ? '收起' : `展开其余 ${bookmarks.length - 8} 个`}</button>}</div></section>
      })}</div>
    </main>
    <footer className="home-foot">{data.authenticated ? '已登录 · 私密分类只在管理页显示' : <>只读访客模式 · 私密分类已隐藏 · <button onClick={onLogin}>登录管理</button></>}</footer>
  </div>
}
