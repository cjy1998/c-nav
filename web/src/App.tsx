import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { BootstrapData } from '../../shared/types'
import { api } from './api'
import { Home } from './Home'
import { Manage } from './Manage'
import { Icon } from './icons'
import { Modal } from './ui'

export function App() {
  const [data, setData] = useState<BootstrapData | null>(null)
  const [route, setRoute] = useState(location.hash.startsWith('#/manage') ? 'manage' : 'home')
  const [loginOpen, setLoginOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [fatal, setFatal] = useState('')
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

  const refresh = useCallback(async () => {
    try { setData(await api.bootstrap()); setFatal('') }
    catch (error) { setFatal((error as Error).message) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const handler = () => setRoute(location.hash.startsWith('#/manage') ? 'manage' : 'home')
    addEventListener('hashchange', handler)
    return () => removeEventListener('hashchange', handler)
  }, [])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      const target = event.target as HTMLElement
      const editing = target.matches('input, textarea, select') || target.isContentEditable
      if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !editing)) {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.manage-search-input input, .hsearch-box input')?.focus()
      }
    }
    addEventListener('keydown', handler)
    return () => removeEventListener('keydown', handler)
  }, [])
  useEffect(() => {
    if (!data) return
    const apply = () => {
      const effective = data.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : data.settings.theme
      document.documentElement.dataset.theme = data.settings.theme
      document.documentElement.dataset.eff = effective
      setEffectiveTheme(effective)
      document.title = data.settings.siteName
    }
    apply()
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [data])
  useEffect(() => {
    if (route === 'manage' && data && !data.authenticated) { location.hash = '#/'; setLoginOpen(true) }
  }, [route, data])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2800)
    return () => clearTimeout(timer)
  }, [toast])

  function notify(message: string) { setToast(message) }
  async function loggedIn() { setLoginOpen(false); await refresh(); location.hash = '#/manage' }
  async function logout() { await api.logout(); await refresh(); location.hash = '#/'; notify('已退出登录，私密内容已隐藏') }

  if (fatal) return <main className="fatal"><span className="logo-mark"><Icon name="logo" /></span><h1>无法连接服务器</h1><p>{fatal}</p><button className="btn primary" onClick={() => void refresh()}>重新连接</button></main>
  if (!data) return <main className="loading-screen"><span className="logo-mark"><Icon name="logo" /></span><p>正在加载导航…</p></main>

  return <>
    {route === 'manage' && data.authenticated
      ? <Manage data={data} refresh={refresh} notify={notify} onHome={() => { location.hash = '#/' }} onLogout={logout} />
      : <Home data={data} onLogin={() => setLoginOpen(true)} onManage={() => { location.hash = '#/manage' }} effectiveTheme={effectiveTheme} />}
    {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} onSuccess={loggedIn} />}
    <div className={`toast ${toast ? 'show' : ''}`} role="status"><span>{toast}</span></div>
  </>
}

function LoginDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => Promise<void> }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { await api.login(username, password); await onSuccess() }
    catch (reason) { setError((reason as Error).message) }
    finally { setLoading(false) }
  }
  return <Modal onClose={onClose} size="sm"><form onSubmit={(event) => void submit(event)}><div className="login-head"><span className="logo-mark logo-xl"><Icon name="logo" /></span><h2>登录</h2><p>登录后可以管理书签、查看私密分类</p></div><div className="dlg-body"><label className="field"><span>账号</span><input className="input" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus /></label><label className="field"><span>密码</span><input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p className="err">{error}</p>}<button className="btn primary btn-block" disabled={loading}>{loading ? '登录中…' : '登录'}</button></div></form></Modal>
}
