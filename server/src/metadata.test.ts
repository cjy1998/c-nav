import { EventEmitter } from 'node:events'
import type { LookupAddress } from 'node:dns'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { RequestOptions } from 'node:https'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), httpRequest: vi.fn(), httpsRequest: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:http', () => ({ request: mocks.httpRequest }))
vi.mock('node:https', () => ({ request: mocks.httpsRequest }))
// Mirror URL normalization without importing db.ts, which creates a SQLite database on import.
vi.mock('./db.js', () => ({
  normalizeUrl(input: string) {
    let raw = input.trim()
    if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 链接')
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = ''
    return url.href
  },
}))

import { fetchMetadata } from './metadata.js'

const PUBLIC_ADDRESS = { address: '93.184.216.34', family: 4 }
const HTML = '<title>普通标题</title><meta property="og:title" content=" 公网标题 "><meta name="description" content=" 页面描述 "><link rel="icon" href="/favicon.ico">'
interface PagePlan {
  status?: number
  headers?: IncomingHttpHeaders
  chunks?: Buffer[]
  stallHeaders?: boolean
  stallBody?: boolean
  error?: Error
}
interface CapturedRequest {
  url: URL
  options: RequestOptions
  request: EventEmitter & { end: () => void; destroy: () => unknown }
  response: PassThrough
}
let plans: PagePlan[]
let captured: CapturedRequest[]

function mockRequest(url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) {
  const plan = plans.shift()
  if (!plan) throw new Error('未安排 mock 请求')
  const response = Object.assign(new PassThrough(), {
    statusCode: plan.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...plan.headers },
  })
  let destroyed = false
  const request = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() })
  request.destroy.mockImplementation(() => {
    destroyed = true
    response.destroy()
    return request
  })
  request.end.mockImplementation(() => {
    queueMicrotask(() => {
      if (destroyed) return
      // Exercise the socket's pinned lookup, including Node's all-address callback form.
      options.lookup!(url.hostname, { all: true, family: options.family }, (error) => {
        if (error) { request.emit('error', error); return }
        if (plan.error) { request.emit('error', plan.error); return }
        if (plan.stallHeaders) return
        callback(response as unknown as IncomingMessage)
        for (const chunk of plan.chunks ?? [Buffer.from(HTML)]) {
          if (response.destroyed) break
          response.write(chunk)
        }
        if (!response.destroyed && !plan.stallBody) response.end()
      })
    })
  })
  captured.push({ url: new URL(url), options, request, response })
  return request
}

async function flushMicrotasks() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  plans = []
  captured = []
  mocks.lookup.mockResolvedValue([PUBLIC_ADDRESS])
  mocks.httpRequest.mockImplementation(mockRequest)
  mocks.httpsRequest.mockImplementation(mockRequest)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('fetchMetadata 公网解析与固定 DNS', () => {
  it('解析标题、描述及相对图标，保留 URL、Host 和 HTTPS SNI/证书校验', async () => {
    plans.push({})
    const result = await fetchMetadata('https://public.example:8443/path?q=1#fragment')
    expect(result).toEqual({
      url: 'https://public.example:8443/path?q=1',
      title: '公网标题', description: '页面描述', iconUrl: 'https://public.example:8443/favicon.ico',
    })
    expect(mocks.lookup).toHaveBeenCalledWith('public.example', { all: true, verbatim: true })
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1)
    expect(mocks.httpRequest).not.toHaveBeenCalled()
    expect(captured[0].url.host).toBe('public.example:8443')
    expect(captured[0].options).toMatchObject({ agent: false, family: 4, servername: 'public.example', rejectUnauthorized: true })
    expect(captured[0].options.headers).not.toHaveProperty('host')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('后续 lookup 只返回第一次已校验的首个地址，不重新查询 DNS', async () => {
    mocks.lookup.mockResolvedValueOnce([PUBLIC_ADDRESS, { address: '8.8.8.8', family: 4 }])
    mocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    plans.push({})
    await fetchMetadata('https://public.example')
    const callback = vi.fn()
    const pinnedLookup = captured[0].options.lookup!
    pinnedLookup('public.example', {}, callback)
    expect(callback).toHaveBeenLastCalledWith(null, PUBLIC_ADDRESS.address, 4)
    pinnedLookup('public.example', { all: true }, callback)
    expect(callback).toHaveBeenLastCalledWith(null, [PUBLIC_ADDRESS])
    // Mutating a returned record must not change the pinned address.
    const returned = callback.mock.lastCall![1] as LookupAddress[]
    returned[0].address = '127.0.0.1'
    pinnedLookup('public.example', {}, callback)
    expect(callback).toHaveBeenLastCalledWith(null, PUBLIC_ADDRESS.address, 4)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
  })

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888'])('允许全球单播 IPv6 %s', async (address) => {
    mocks.lookup.mockResolvedValue([{ address, family: 6 }])
    plans.push({})
    expect((await fetchMetadata('https://public.example')).title).toBe('公网标题')
    const callback = vi.fn()
    captured[0].options.lookup!('public.example', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address, family: 6 }])
    expect(captured[0].options.family).toBe(6)
  })

  it.each(['http://93.184.216.34/', 'https://[2606:4700:4700::1111]/'])('允许公网 IP 字面量 %s，且不查询 DNS', async (url) => {
    plans.push({})
    expect((await fetchMetadata(url)).url).toBe(url)
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(captured[0].options.servername).toBeUndefined()
  })

  it('TLS 证书错误保持拒绝，不降级或关闭校验', async () => {
    plans.push({ error: new Error('CERT_HAS_EXPIRED') })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('CERT_HAS_EXPIRED')
    expect(captured[0].options.rejectUnauthorized).toBe(true)
    expect(captured[0].request.destroy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('fetchMetadata 地址拒绝', () => {
  it.each([
    '0.0.0.0', '10.0.0.1', '127.0.0.1', '100.64.0.1', '100.127.255.254',
    '169.254.169.254', '172.16.0.1', '172.31.255.254', '192.168.1.1',
    '192.0.0.1', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.19.255.254',
    '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::', '::1', 'fe80::1', 'fe90::1', 'febf::1', 'fc00::1', 'fdff::1', 'ff02::1',
    '::ffff:192.168.1.1', '::ffff:7f00:1', '::ffff:8.8.8.8', '::192.168.1.1',
    '64:ff9b::808:808', '64:ff9b:1::a00:1', '2002:0808:0808::1',
    '2001:0000:4136:e378:8000:63bf:3fff:fdd2', '2001:2::1', '2001:10::1', '2001:20::1',
    '2001:db8::1', '2001:0DB8:0000:0000:0000:0000:0000:0001', '3ffe::1', '3fff::1',
    '4000::1', 'not-an-ip',
  ])('拒绝 DNS 地址 %s，且不发起 HTTP 请求', async (address) => {
    mocks.lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }])
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('不允许访问内网或本机地址')
    expect(mocks.httpRequest).not.toHaveBeenCalled()
    expect(mocks.httpsRequest).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['http://127.0.0.1', 'http://2130706433', 'http://0x7f000001', 'https://[::ffff:127.0.0.1]', 'https://[fe90::1]'])('拒绝非公网 IP 字面量 %s', async (url) => {
    await expect(fetchMetadata(url)).rejects.toThrow('不允许访问内网或本机地址')
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(mocks.httpRequest).not.toHaveBeenCalled()
    expect(mocks.httpsRequest).not.toHaveBeenCalled()
  })

  it('混合公网/私网 DNS 答案整体拒绝', async () => {
    mocks.lookup.mockResolvedValue([PUBLIC_ADDRESS, { address: '10.0.0.1', family: 4 }])
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('不允许访问内网或本机地址')
    expect(mocks.httpsRequest).not.toHaveBeenCalled()
  })

  it.each([{ records: [] }, { records: [{ address: '93.184.216.34', family: 6 }] }])('拒绝空答案或不一致的地址族 %#', async ({ records }) => {
    mocks.lookup.mockResolvedValue(records)
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('不允许访问内网或本机地址')
    expect(mocks.httpsRequest).not.toHaveBeenCalled()
  })

  it.each(['ftp://public.example', 'https://user:password@public.example'])('拒绝初始非法网址 %s', async (url) => {
    await expect(fetchMetadata(url)).rejects.toThrow()
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(mocks.httpsRequest).not.toHaveBeenCalled()
  })
})

describe('fetchMetadata 手动跳转', () => {
  it.each([
    ['file:///etc/passwd', '只支持 HTTP 或 HTTPS 链接'],
    ['ftp://public.example/path', '只支持 HTTP 或 HTTPS 链接'],
    ['data:text/html,hello', '只支持 HTTP 或 HTTPS 链接'],
    ['https://user:secret@public.example', '网址不能包含账号或密码'],
    ['http://127.0.0.1/private', '不允许访问内网或本机地址'],
    ['http://[::ffff:192.168.1.1]/', '不允许访问内网或本机地址'],
    ['//[fe90::1]/', '不允许访问内网或本机地址'],
  ])('拒绝跳转到 %s', async (location, error) => {
    plans.push({ status: 302, headers: { location } })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow(error)
    expect(captured).toHaveLength(1)
    expect(mocks.lookup).toHaveBeenCalledTimes(1)
    expect(captured[0].request.destroy).toHaveBeenCalled()
  })

  it('相同 hostname 每一跳仍重新验证 DNS，拒绝重绑定到私网', async () => {
    mocks.lookup.mockResolvedValueOnce([PUBLIC_ADDRESS]).mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
    plans.push({ status: 301, headers: { location: '/next' } })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('不允许访问内网或本机地址')
    expect(mocks.lookup).toHaveBeenCalledTimes(2)
    expect(captured).toHaveLength(1)
  })

  it('允许最多三次相对/跨站/跨协议跳转，每跳固定各自的 DNS 地址', async () => {
    mocks.lookup.mockResolvedValueOnce([PUBLIC_ADDRESS])
      .mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }])
      .mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }])
      .mockResolvedValueOnce([{ address: '9.9.9.9', family: 4 }])
    plans.push(
      { status: 301, headers: { location: '/next' } },
      { status: 302, headers: { location: 'http://other.example/page' } },
      { status: 307, headers: { location: 'https://final.example/end' } },
      {},
    )
    expect((await fetchMetadata('https://public.example')).url).toBe('https://final.example/end')
    expect(mocks.lookup).toHaveBeenCalledTimes(4)
    expect(mocks.httpRequest).toHaveBeenCalledTimes(1)
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(3)
    for (const [index, address] of [PUBLIC_ADDRESS.address, '8.8.8.8', '1.1.1.1', '9.9.9.9'].entries()) {
      const callback = vi.fn()
      captured[index].options.lookup!(captured[index].url.hostname, {}, callback)
      expect(callback).toHaveBeenCalledWith(null, address, 4)
    }
  })

  it('第四次跳转拒绝且不发出第五个请求', async () => {
    for (let i = 0; i < 4; i++) plans.push({ status: 302, headers: { location: '/again' } })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('网站跳转次数过多')
    expect(captured).toHaveLength(4)
    expect(mocks.lookup).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('拒绝缺少 Location 的跳转', async () => {
    plans.push({ status: 302 })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('网站返回了无效跳转')
  })
})

describe('fetchMetadata 每跳总超时与正文限制', () => {
  it('响应头到达后正文停滞仍在 8 秒超时，收到数据也不延长期限', async () => {
    plans.push({ chunks: [Buffer.from('<title>unfinished')], stallBody: true })
    const pending = fetchMetadata('https://public.example')
    const rejected = expect(pending).rejects.toThrow('获取网页超时')
    await flushMicrotasks()
    expect(captured).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(7999)
    expect(captured[0].response.destroyed).toBe(false)
    captured[0].response.write(Buffer.from('more'))
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    expect(captured[0].response.destroyed).toBe(true)
    expect(captured[0].request.destroy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('DNS 耗时计入正文同一个 8 秒预算', async () => {
    let resolveDns!: (records: LookupAddress[]) => void
    mocks.lookup.mockReturnValueOnce(new Promise<LookupAddress[]>((resolve) => { resolveDns = resolve }))
    plans.push({ stallBody: true })
    const rejected = expect(fetchMetadata('https://public.example')).rejects.toThrow('获取网页超时')
    await vi.advanceTimersByTimeAsync(3000)
    resolveDns([PUBLIC_ADDRESS])
    await flushMicrotasks()
    expect(captured).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(4999)
    expect(captured[0].request.destroy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    expect(captured[0].request.destroy).toHaveBeenCalledTimes(1)
  })

  it('DNS 本身超时，迟到的 DNS 结果不启动请求', async () => {
    let resolveDns!: (records: LookupAddress[]) => void
    mocks.lookup.mockReturnValueOnce(new Promise<LookupAddress[]>((resolve) => { resolveDns = resolve }))
    const rejected = expect(fetchMetadata('https://public.example')).rejects.toThrow('获取网页超时')
    await vi.advanceTimersByTimeAsync(8000)
    await rejected
    resolveDns([PUBLIC_ADDRESS])
    await flushMicrotasks()
    expect(mocks.httpsRequest).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('响应头未到达也在 8 秒销毁请求', async () => {
    plans.push({ stallHeaders: true })
    const rejected = expect(fetchMetadata('https://public.example')).rejects.toThrow('获取网页超时')
    await vi.advanceTimersByTimeAsync(8000)
    await rejected
    expect(captured[0].request.destroy).toHaveBeenCalledTimes(1)
  })

  it('无 Content-Length 的分块正文累计超过 1MB 后终止', async () => {
    plans.push({ chunks: [Buffer.alloc(512 * 1024), Buffer.alloc(512 * 1024), Buffer.from('x')], stallBody: true })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('网页内容超过 1 MB')
    expect(captured[0].response.destroyed).toBe(true)
    expect(captured[0].request.destroy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('单块正文超过 1MB 时拒绝', async () => {
    plans.push({ chunks: [Buffer.alloc(1024 * 1024 + 1)] })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('网页内容超过 1 MB')
    expect(captured[0].response.destroyed).toBe(true)
  })

  it('Content-Length 提前声明超过 1MB 时立即拒绝', async () => {
    plans.push({ headers: { 'content-length': String(1024 * 1024 + 1) }, chunks: [], stallBody: true })
    await expect(fetchMetadata('https://public.example')).rejects.toThrow('网页内容超过 1 MB')
    expect(captured[0].response.destroyed).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('恰好 1MB 的正文允许解析', async () => {
    const title = Buffer.from('<title>边界</title>')
    plans.push({ chunks: [title, Buffer.alloc(1024 * 1024 - title.length, ' ')] })
    expect((await fetchMetadata('https://public.example')).title).toBe('边界')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['aborted', 'close', 'error'])('正文 %s 时拒绝并清理请求及计时器', async (event) => {
    plans.push({ stallBody: true })
    const rejected = expect(fetchMetadata('https://public.example')).rejects.toThrow()
    await flushMicrotasks()
    captured[0].response.emit(event, new Error('body failed'))
    await rejected
    expect(captured[0].request.destroy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
