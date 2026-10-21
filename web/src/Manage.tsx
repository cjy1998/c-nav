import { useMemo, useState, type DragEvent, type FormEvent } from 'react'
import type { Bookmark, BootstrapData, Category, PublicSettings } from '../../shared/types'
import { api, type ImportGroup } from './api'
import { Icon } from './icons'
import { Favicon, formatRecent, Modal, searchBookmarks } from './ui'

interface Props {
  data: BootstrapData
  refresh: () => Promise<void>
  notify: (message: string) => void
  onHome: () => void
  onLogout: () => Promise<void>
}

type ActiveView = 'all' | 'recent' | 'added' | string
type SortKey = 'manual' | 'visits' | 'name' | 'new'

export function Manage({ data, refresh, notify, onHome, onLogout }: Props) {
  const [active, setActive] = useState<ActiveView>(() => localStorage.getItem('nav.active') || 'all')
  const [view, setView] = useState<'card' | 'list'>(() => localStorage.getItem('nav.view') === 'list' ? 'list' : 'card')
  const [sort, setSort] = useState<SortKey>('manual')
  const [query, setQuery] = useState('')
  const [sideOpen, setSideOpen] = useState(false)
  const [bookmarkModal, setBookmarkModal] = useState<{ bookmark?: Bookmark; categoryId?: string } | null>(null)
  const [categoryModal, setCategoryModal] = useState<Category | 'new' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [dragBookmark, setDragBookmark] = useState<string | null>(null)
  const [dragCategory, setDragCategory] = useState<string | null>(null)

  const searchResults = useMemo(() => query ? searchBookmarks(data.bookmarks, data.categories, query).slice(0, 8) : [], [query, data])

  function selectActive(value: ActiveView) {
    setActive(value); localStorage.setItem('nav.active', value); setSideOpen(false)
  }
  function selectView(value: 'card' | 'list') {
    setView(value); localStorage.setItem('nav.view', value)
  }
  function openBookmark(bookmark: Bookmark) {
    void api.visit(bookmark.id)
  }
  async function removeBookmark(bookmark: Bookmark) {
    if (!confirm(`删除书签“${bookmark.title}”？`)) return
    try { await api.deleteBookmark(bookmark.id); await refresh(); notify(`已删除“${bookmark.title}”`) } catch (error) { notify((error as Error).message) }
  }
  async function pinBookmark(bookmark: Bookmark) {
    try { await api.togglePin(bookmark.id); await refresh(); notify(bookmark.pinned ? '已取消置顶' : '已置顶到首页') } catch (error) { notify((error as Error).message) }
  }
  async function reorderCategory(targetId: string) {
    if (!dragCategory || dragCategory === targetId) return
    const ids = data.categories.map((category) => category.id)
    const from = ids.indexOf(dragCategory), to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    try { await api.reorderCategories(ids); await refresh() } catch (error) { notify((error as Error).message) }
    setDragCategory(null)
  }
  async function reorderBookmark(target: Bookmark) {
    if (!dragBookmark || dragBookmark === target.id) return
    const moving = data.bookmarks.find((bookmark) => bookmark.id === dragBookmark)
    if (!moving) return
    const ids = data.bookmarks.filter((bookmark) => bookmark.categoryId === target.categoryId && bookmark.id !== moving.id).map((bookmark) => bookmark.id)
    ids.splice(ids.indexOf(target.id), 0, moving.id)
    try { await api.reorderBookmarks(target.categoryId, ids); await refresh(); notify('顺序已更新') } catch (error) { notify((error as Error).message) }
    setDragBookmark(null)
  }
  async function moveToCategory(categoryId: string) {
    if (!dragBookmark) return
    const moving = data.bookmarks.find((bookmark) => bookmark.id === dragBookmark)
    if (!moving || moving.categoryId === categoryId) return
    const ids = [...data.bookmarks.filter((bookmark) => bookmark.categoryId === categoryId).map((bookmark) => bookmark.id), moving.id]
    try { await api.reorderBookmarks(categoryId, ids); await refresh(); notify('已移动书签') } catch (error) { notify((error as Error).message) }
    setDragBookmark(null)
  }

  const currentCategory = data.categories.find((category) => category.id === active)
  let currentLinks = [...data.bookmarks]
  if (active === 'recent') currentLinks = currentLinks.filter((bookmark) => bookmark.lastVisitedAt).sort((a, b) => new Date(b.lastVisitedAt!).getTime() - new Date(a.lastVisitedAt!).getTime())
  else if (active === 'added') currentLinks = currentLinks.filter((bookmark) => Date.now() - new Date(bookmark.createdAt).getTime() < 30 * 86400000).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  else if (active !== 'all') currentLinks = currentLinks.filter((bookmark) => bookmark.categoryId === active)
  if (sort === 'visits') currentLinks.sort((a, b) => b.visitCount - a.visitCount)
  else if (sort === 'name') currentLinks.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  else if (sort === 'new') currentLinks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const title = active === 'all' ? '全部书签' : active === 'recent' ? '最近访问' : active === 'added' ? '最近添加' : currentCategory?.name || '全部书签'
  const subtitle = active === 'recent' ? '按最近打开时间排列' : active === 'added' ? '最近 30 天添加的书签' : `${currentLinks.length} 个书签`

  function card(bookmark: Bookmark) {
    const actions = <div className="bm-acts"><button className={`icon-btn ${bookmark.pinned ? 'on' : ''}`} onClick={() => void pinBookmark(bookmark)} title={bookmark.pinned ? '取消置顶' : '置顶'}><Icon name="pin" size={16} /></button><button className="icon-btn" onClick={() => setBookmarkModal({ bookmark })} title="编辑"><Icon name="edit" size={16} /></button><button className="icon-btn danger" onClick={() => void removeBookmark(bookmark)} title="删除"><Icon name="trash" size={16} /></button></div>
    if (view === 'list') return <div key={bookmark.id} className="bm-row" draggable onDragStart={() => setDragBookmark(bookmark.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => void reorderBookmark(bookmark)}>
      <span className="grip">⋮⋮</span><a className="bm-link" href={bookmark.url} target="_blank" rel="noopener" onClick={() => openBookmark(bookmark)}><Favicon bookmark={bookmark} size="sm" /><span className="bm-title"><span>{bookmark.title}</span>{bookmark.pinned && <span className="pin-mark"><Icon name="pin" size={12} /></span>}</span><span className="bm-host">{new URL(bookmark.url).hostname}</span></a><div className="bm-tags">{bookmark.tags.slice(0, 2).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div><span className="bm-stat">{active === 'recent' ? formatRecent(bookmark.lastVisitedAt) : `${bookmark.visitCount} 次`}</span>{actions}
    </div>
    return <article key={bookmark.id} className="bm-card" draggable onDragStart={() => setDragBookmark(bookmark.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => void reorderBookmark(bookmark)}>
      <a className="bm-link" href={bookmark.url} target="_blank" rel="noopener" onClick={() => openBookmark(bookmark)}><Favicon bookmark={bookmark} /><span className="bm-meta"><span className="bm-title"><span>{bookmark.title}</span>{bookmark.pinned && <span className="pin-mark"><Icon name="pin" size={13} /></span>}</span><span className="bm-host">{new URL(bookmark.url).hostname}</span></span></a>
      <p className="bm-desc">{bookmark.description || '暂无描述'}</p><div className="bm-foot"><div className="bm-tags">{bookmark.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div><span className="bm-stat">{bookmark.visitCount} 次</span></div>{actions}
    </article>
  }

  function section(name: string | null, bookmarks: Bookmark[], category?: Category, iconName?: string) {
    return <section key={name || 'single'} className="section" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { if (event.target === event.currentTarget || !bookmarks.length) void moveToCategory(category?.id || '') }}>
      {name && <div className="sec-head"><h2>{iconName && <Icon name={iconName} size={15} />}{name}<span className="count">{bookmarks.length}</span></h2>{category && <div className="sec-acts"><button className="icon-btn" onClick={() => setBookmarkModal({ categoryId: category.id })} title="添加到此分类"><Icon name="plus" size={16} /></button><button className="icon-btn" onClick={() => setCategoryModal(category)} title="编辑分类"><Icon name="more" size={16} /></button></div>}</div>}
      {bookmarks.length ? <div className={view === 'card' ? 'bm-grid' : 'bm-list'}>{bookmarks.map(card)}</div> : <div className="empty">这个分类还没有书签<button className="link-btn" onClick={() => setBookmarkModal({ categoryId: category?.id })}>添加一个</button></div>}
    </section>
  }

  return <div className={`manage ${sideOpen ? 'side-open' : ''}`}>
    <header className="m-top">
      <button className="icon-btn m-menu-btn" onClick={() => setSideOpen((value) => !value)} aria-label="打开侧边栏"><Icon name="menu" /></button>
      <button className="m-brand header-link" onClick={onHome}><span className="logo-mark"><Icon name="logo" /></span><span>{data.settings.siteName}</span></button>
      <div className="manage-search-wrap"><div className="m-search manage-search-input"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索书签：名称、拼音、网址、标签…" /><kbd>⌘K</kbd></div>{query && <div className="manage-search-results">{searchResults.length ? searchResults.map((bookmark) => <a key={bookmark.id} href={bookmark.url} target="_blank" rel="noopener" onClick={() => { openBookmark(bookmark); setQuery('') }}><Favicon bookmark={bookmark} size="sm" /><span><b>{bookmark.title}</b><small>{bookmark.categoryName} · {new URL(bookmark.url).hostname}</small></span>{bookmark.categoryVisibility === 'private' && <Icon name="lock" size={13} />}</a>) : <div className="search-empty">没有匹配的书签</div>}</div>}</div>
      <div className="m-top-r"><button className="btn primary" onClick={() => setBookmarkModal({})}><Icon name="plus" /><span className="hide-sm">添加书签</span></button><button className="avatar" onClick={() => void onLogout()} title="退出登录">我</button></div>
    </header>
    <div className="m-body">
      <aside className="m-side">
        <SideItem icon="grid" name="全部书签" count={data.bookmarks.length} active={active === 'all'} onClick={() => selectActive('all')} />
        <SideItem icon="clock" name="最近访问" count={data.bookmarks.filter((item) => item.lastVisitedAt).length} active={active === 'recent'} onClick={() => selectActive('recent')} />
        <SideItem icon="spark" name="最近添加" count={data.bookmarks.filter((item) => Date.now() - new Date(item.createdAt).getTime() < 30 * 86400000).length} active={active === 'added'} onClick={() => selectActive('added')} />
        <div className="side-head"><span>分类</span><button className="icon-btn" onClick={() => setCategoryModal('new')} title="新建分类"><Icon name="plus" size={16} /></button></div>
        {data.categories.map((category) => <div key={category.id} className="side-cat" draggable onDragStart={() => setDragCategory(category.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => void reorderCategory(category.id)}><button className="side-item" aria-current={active === category.id} onClick={() => selectActive(category.id)}><span className="cat-dot" /><span className="name">{category.visibility === 'private' && <span className="lock"><Icon name="lock" size={13} /></span>} {category.name}</span><span className="count">{category.bookmarkCount}</span></button><button className="icon-btn side-edit" onClick={() => setCategoryModal(category)} title="编辑分类"><Icon name="more" size={16} /></button></div>)}
        <div className="side-foot"><button className="side-item" onClick={() => setImportOpen(true)}><Icon name="upload" /><span className="name">导入书签</span></button><a className="side-item" href="/api/admin/export/html"><Icon name="download" /><span className="name">导出浏览器格式</span></a><a className="side-item" href="/api/admin/export/json"><Icon name="download" /><span className="name">完整备份</span></a><button className="side-item" onClick={() => setSettingsOpen(true)}><Icon name="gear" /><span className="name">设置</span></button></div>
      </aside>
      <button className="m-side-scrim" onClick={() => setSideOpen(false)} aria-label="关闭侧边栏" />
      <main className="m-main">
        <div className="m-head"><div><h1>{currentCategory?.visibility === 'private' && <span className="lock"><Icon name="lock" /></span>}{title}</h1><div className="m-sub">{subtitle}</div></div><div className="m-tools"><select className="input" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="manual">默认顺序</option><option value="visits">访问最多</option><option value="name">按名称</option><option value="new">最近添加</option></select><div className="seg"><button aria-pressed={view === 'card'} onClick={() => selectView('card')} title="卡片视图"><Icon name="grid" /></button><button aria-pressed={view === 'list'} onClick={() => selectView('list')} title="紧凑视图"><Icon name="list" /></button></div><button className="btn primary" onClick={() => setBookmarkModal({ categoryId: currentCategory?.id })}><Icon name="plus" />添加书签</button></div></div>
        {currentCategory?.visibility === 'private' && <div className="hint-bar"><Icon name="lock" size={16} />这个分类未登录时完全隐藏，也不会出现在公开搜索中。</div>}
        {active === 'all' ? <>{section('置顶', currentLinks.filter((bookmark) => bookmark.pinned), undefined, 'pin')}{data.categories.map((category) => section(category.name, currentLinks.filter((bookmark) => bookmark.categoryId === category.id && !bookmark.pinned), category, category.visibility === 'private' ? 'lock' : undefined))}</> : section(null, currentLinks, currentCategory)}
      </main>
    </div>

    {bookmarkModal && <BookmarkDialog data={data} initial={bookmarkModal} onClose={() => setBookmarkModal(null)} onSaved={async (message) => { setBookmarkModal(null); await refresh(); notify(message) }} />}
    {categoryModal && <CategoryDialog initial={categoryModal} onClose={() => setCategoryModal(null)} onSaved={async (message) => { setCategoryModal(null); await refresh(); notify(message) }} />}
    {settingsOpen && <SettingsDialog settings={data.settings} onClose={() => setSettingsOpen(false)} onSaved={async () => { setSettingsOpen(false); await refresh(); notify('设置已保存') }} />}
    {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onDone={async (message) => { setImportOpen(false); await refresh(); notify(message) }} />}
  </div>
}

function SideItem({ icon, name, count, active, onClick }: { icon: string; name: string; count: number; active: boolean; onClick: () => void }) {
  return <button className="side-item" aria-current={active} onClick={onClick}><span className="side-ico"><Icon name={icon} /></span><span className="name">{name}</span><span className="count">{count}</span></button>
}

function BookmarkDialog({ data, initial, onClose, onSaved }: { data: BootstrapData; initial: { bookmark?: Bookmark; categoryId?: string }; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const bookmark = initial.bookmark
  const [url, setUrl] = useState(bookmark?.url || '')
  const [title, setTitle] = useState(bookmark?.title || '')
  const [categoryId, setCategoryId] = useState(bookmark?.categoryId || initial.categoryId || data.categories[0]?.id || '')
  const [description, setDescription] = useState(bookmark?.description || '')
  const [tags, setTags] = useState(bookmark?.tags.join(' ') || '')
  const [pinned, setPinned] = useState(bookmark?.pinned || false)
  const [iconUrl, setIconUrl] = useState<string | null>(bookmark?.iconUrl || null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [error, setError] = useState('')

  async function metadata() {
    if (!url.trim()) return setError('请先填写网址')
    setLoadingMeta(true); setError('')
    try {
      const result = await api.metadata(url)
      setUrl(result.url); if (!title) setTitle(result.title); if (!description) setDescription(result.description); setIconUrl(result.iconUrl)
    } catch (reason) { setError((reason as Error).message) } finally { setLoadingMeta(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    try {
      const input = { categoryId, title: title.trim() || new URL(url.includes('://') ? url : `https://${url}`).hostname, url, description, tags: tags.split(/[\s,，]+/).filter(Boolean), pinned, iconUrl }
      if (bookmark) await api.updateBookmark(bookmark.id, input); else await api.createBookmark(input)
      await onSaved(bookmark ? `已保存“${input.title}”` : `已添加“${input.title}”`)
    } catch (reason) { setError((reason as Error).message) }
  }
  const preview: Bookmark = { id: '', categoryId, title: title || '?', url: url.includes('://') ? url : `https://${url || 'example.com'}`, pinyin: '', description: '', tags: [], pinned: false, sortOrder: 0, visitCount: 0, lastVisitedAt: null, createdAt: '', updatedAt: '', ...bookmark, iconUrl }
  return <Modal title={bookmark ? '编辑书签' : '添加书签'} onClose={onClose}>
    <form onSubmit={(event) => void submit(event)}><div className="dlg-body">
      <label className="field"><span>网址 *</span><div className="url-row"><Favicon bookmark={preview} /><input className="input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="粘贴网址，自动获取标题和图标" autoFocus /><button type="button" className="btn" onClick={() => void metadata()} disabled={loadingMeta}>{loadingMeta ? '获取中…' : '获取'}</button></div><small className="field-hint">服务端会校验地址，禁止访问内网地址</small></label>
      <div className="row2"><label className="field"><span>名称</span><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>分类</span><select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.visibility === 'private' ? '🔒 ' : ''}{category.name}</option>)}</select></label></div>
      <label className="field"><span>描述</span><input className="input" value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="field"><span>标签</span><input className="input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用空格或逗号分隔" /></label><label className="check"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>置顶到首页</span></label>{error && <p className="err">{error}</p>}
    </div><div className="dlg-foot"><span className="spacer"/><button type="button" className="btn" onClick={onClose}>取消</button><button className="btn primary">保存</button></div></form>
  </Modal>
}

function CategoryDialog({ initial, onClose, onSaved }: { initial: Category | 'new'; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const category = initial === 'new' ? null : initial
  const [name, setName] = useState(category?.name || '')
  const [visibility, setVisibility] = useState<'public' | 'private'>(category?.visibility || 'public')
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    try { if (category) await api.updateCategory(category.id, { name, visibility }); else await api.createCategory({ name, visibility }); await onSaved(category ? '分类已保存' : `已新建分类“${name}”`) } catch (reason) { setError((reason as Error).message) }
  }
  async function remove() {
    if (!category || !confirm(`删除分类“${category.name}”？其中书签会移动到其他分类。`)) return
    try { await api.deleteCategory(category.id); await onSaved('分类已删除') } catch (reason) { setError((reason as Error).message) }
  }
  return <Modal title={category ? '编辑分类' : '新建分类'} onClose={onClose} size="sm"><form onSubmit={(event) => void submit(event)}><div className="dlg-body"><label className="field"><span>名称</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label className="switch-row"><span className="switch-text"><span className="switch-title"><Icon name="lock" />私密分类</span><small>未登录时完全隐藏，也无法搜索</small></span><input className="switch" type="checkbox" checked={visibility === 'private'} onChange={(event) => setVisibility(event.target.checked ? 'private' : 'public')} /></label>{error && <p className="err">{error}</p>}</div><div className="dlg-foot">{category && <button type="button" className="btn ghost-danger" onClick={() => void remove()}>删除分类</button>}<span className="spacer"/><button type="button" className="btn" onClick={onClose}>取消</button><button className="btn primary">保存</button></div></form></Modal>
}

function SettingsDialog({ settings, onClose, onSaved }: { settings: PublicSettings; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(settings)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) { event.preventDefault(); try { await api.updateSettings(draft); await onSaved() } catch (reason) { setError((reason as Error).message) } }
  return <Modal title="设置" onClose={onClose} size="lg"><form onSubmit={(event) => void submit(event)}><div className="dlg-body settings">
    <section className="set-sec"><h3>外观</h3><div className="set-row"><span><b>主题</b><small>可跟随系统自动切换</small></span><div className="seg">{(['light', 'dark', 'system'] as const).map((theme) => <button type="button" key={theme} aria-pressed={draft.theme === theme} onClick={() => setDraft({ ...draft, theme })}><Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor'} />{theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '系统'}</button>)}</div></div><div className="set-row"><span><b>首页壁纸</b><small>内置壁纸自动适配深浅主题</small></span><select className="input" value={draft.wallpaper} onChange={(event) => setDraft({ ...draft, wallpaper: event.target.value as PublicSettings['wallpaper'] })}><option value="dunes">沙丘</option><option value="hills">层峦</option><option value="gradient">渐变</option></select></div></section>
    <section className="set-sec"><h3>首页</h3><label className="set-row"><span><b>显示时钟</b><small>在首页搜索框上方显示时间</small></span><input className="switch" type="checkbox" checked={draft.showClock} onChange={(event) => setDraft({ ...draft, showClock: event.target.checked })} /></label><label className="set-row"><span><b>显示最近访问</b><small>访客首页只会展示公开书签</small></span><input className="switch" type="checkbox" checked={draft.showRecent} onChange={(event) => setDraft({ ...draft, showRecent: event.target.checked })} /></label><label className="set-row"><span><b>站点名称</b></span><input className="input" value={draft.siteName} onChange={(event) => setDraft({ ...draft, siteName: event.target.value })} /></label></section>
    <section className="set-sec soon"><h3>浏览器扩展</h3><div className="set-row"><span><b>快速收藏扩展</b><small>接口命名空间已经预留，第一版暂不启用</small></span><span className="badge">后续</span></div></section>{error && <p className="err">{error}</p>}
  </div><div className="dlg-foot"><span className="spacer"/><button type="button" className="btn" onClick={onClose}>取消</button><button className="btn primary">保存设置</button></div></form></Modal>
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => Promise<void> }) {
  const [groups, setGroups] = useState<ImportGroup[] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [backupSettings, setBackupSettings] = useState<PublicSettings | undefined>()
  const [restoreSettings, setRestoreSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function choose(file: File) {
    setError('')
    if (file.size > 10 * 1024 * 1024) { setError('文件不能超过 10 MB'); return }
    try { const result = await api.previewImport(file.name, await file.text()); setGroups(result.groups); setBackupSettings(result.settings); setRestoreSettings(false); setSelected(result.groups.map((_, index) => index)) } catch (reason) { setError((reason as Error).message) }
  }
  async function commit() {
    if (!groups || busy) return
    setBusy(true)
    try { const result = await api.commitImport(groups.filter((_, index) => selected.includes(index)), restoreSettings ? backupSettings : undefined); await onDone(`已导入 ${result.added} 个，跳过 ${result.skipped} 个`) } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  const total = groups?.filter((_, index) => selected.includes(index)).reduce((value, group) => value + group.bookmarks.length, 0) || 0
  return <Modal title="导入书签" onClose={onClose} size="lg"><div className="dlg-body">{!groups ? <><label className="drop-zone"><span className="drop-icon"><Icon name="upload" /></span><span className="drop-title">选择浏览器导出的书签文件</span><small>支持 Chrome / Edge / Safari / Firefox 的 HTML，以及本站 JSON 备份</small><span className="btn primary">选择文件</span><input type="file" accept=".html,.htm,.json" hidden onChange={(event) => event.target.files?.[0] && void choose(event.target.files[0])} /></label><details className="howto"><summary>怎么导出浏览器书签？</summary><ul><li>Chrome / Edge：书签管理器 → 右上角菜单 → 导出书签</li><li>Safari：文件 → 导出 → 书签</li></ul></details></> : <><div className="imp-summary"><span className="opt-icon"><Icon name="upload" /></span><span><b>准备导入 {total} 个书签</b><small>{groups.length} 个文件夹</small></span></div><div className="imp-list">{groups.map((group, index) => <label className="imp-row" key={`${group.name}-${index}`}><input type="checkbox" checked={selected.includes(index)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, index] : items.filter((item) => item !== index))} /><span className="name">{group.name}</span><span className="count">{group.bookmarks.length} 个</span></label>)}</div>{backupSettings && <label className="check-row"><input type="checkbox" checked={restoreSettings} onChange={(event) => setRestoreSettings(event.target.checked)} />同时恢复备份中的站点设置</label>}</>}{error && <p className="err">{error}</p>}</div><div className="dlg-foot">{groups && <button className="btn" onClick={() => setGroups(null)} disabled={busy}>重新选择</button>}<span className="spacer"/><button className="btn" onClick={onClose}>取消</button>{groups && <button className="btn primary" onClick={() => void commit()} disabled={busy || !selected.length}>{busy ? '导入中…' : `导入 ${total} 个书签`}</button>}</div></Modal>
}
