import { lookup } from 'node:dns/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import * as cheerio from 'cheerio'
import { normalizeUrl } from './db.js'
import type { MetadataResult } from '../../shared/types.js'

const MAX_BODY_BYTES = 1024 * 1024
const HOP_TIMEOUT_MS = 8000

function blockedIp(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113)
  }
  if (family !== 6 || address.includes('%')) return true

  // Expand IPv6 numerically: textual prefix checks miss compressed and mapped forms.
  let expanded = address
  if (expanded.includes('.')) {
    const index = expanded.lastIndexOf(':')
    const octets = expanded.slice(index + 1).split('.').map(Number)
    expanded = `${expanded.slice(0, index)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
  }
  const halves = expanded.split('::')
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  const words = halves.length === 1 ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
  const value = words.reduce((result, word) => (result << 16n) | BigInt(`0x${word}`), 0n)
  const inPrefix = (prefix: bigint, bits: number) => value >> BigInt(128 - bits) === prefix >> BigInt(128 - bits)

  // Only 2000::/3 global unicast; this also excludes mapped IPv4, NAT64 and local/multicast ranges.
  return !inPrefix(0x20000000000000000000000000000000n, 3)
    || inPrefix(0x20010000000000000000000000000000n, 23) // Special-purpose space, including Teredo and ORCHID.
    || inPrefix(0x20010db8000000000000000000000000n, 32) // Documentation.
    || inPrefix(0x20020000000000000000000000000000n, 16) // 6to4.
    || inPrefix(0x3ffe0000000000000000000000000000n, 16) // Retired 6bone.
    || inPrefix(0x3fff0000000000000000000000000000n, 20) // Documentation.
}

async function assertPublicHost(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 链接')
  if (url.username || url.password) throw new Error('网址不能包含账号或密码')
  const hostname = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname
  const family = isIP(hostname)
  const records = family ? [{ address: hostname, family }] : await lookup(hostname, { all: true, verbatim: true })
  if (!records.length || records.some((record) => blockedIp(record.address) || record.family !== isIP(record.address))) {
    throw new Error('不允许访问内网或本机地址')
  }
  return records[0]
}

type PageResponse = { location: string } | { html: string }

function requestPage(url: URL): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    let request: http.ClientRequest | undefined
    let response: http.IncomingMessage | undefined
    let settled = false
    const finish = (error: Error | null, result?: PageResponse) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      response?.destroy()
      request?.destroy()
      if (error) reject(error)
      else resolve(result!)
    }
    // A single wall-clock deadline covers DNS, connection/TLS, headers and the entire body.
    const timer = setTimeout(() => finish(new Error('获取网页超时')), HOP_TIMEOUT_MS)
    void (async () => {
      const record = await assertPublicHost(url)
      if (settled) return // DNS cannot be cancelled; never start a request after its deadline.
      const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
        if (options.all) callback(null, [{ ...record }])
        else callback(null, record.address, record.family)
      }
      const transport = url.protocol === 'https:' ? https : http
      request = transport.request(url, {
        // Keep the URL hostname (Host and TLS SNI/certificate identity), pin only the socket address.
        lookup: pinnedLookup, family: record.family, agent: false,
        ...(url.protocol === 'https:' ? {
          rejectUnauthorized: true,
          servername: isIP(url.hostname) || url.hostname.startsWith('[') ? undefined : url.hostname,
        } : {}),
        headers: { 'user-agent': 'PersonalNavigationBot/1.0', accept: 'text/html,application/xhtml+xml' },
      }, (incoming) => {
        response = incoming
        if (settled) { incoming.destroy(); return }
        incoming.on('error', (error) => finish(error))
        incoming.on('aborted', () => finish(new Error('网站响应中断')))
        incoming.on('close', () => { if (!settled) finish(new Error('网站响应中断')) })
        const status = incoming.statusCode || 0
        if (status >= 300 && status < 400) {
          const location = incoming.headers.location
          if (!location) finish(new Error('网站返回了无效跳转'))
          else finish(null, { location })
          return
        }
        if (status < 200 || status >= 300) { finish(new Error(`网站返回 HTTP ${status}`)); return }
        const type = incoming.headers['content-type'] || ''
        if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
          finish(new Error('该网址不是网页')); return
        }
        if (Number(incoming.headers['content-length']) > MAX_BODY_BYTES) {
          finish(new Error('网页内容超过 1 MB')); return
        }
        const chunks: Buffer[] = []
        let total = 0
        incoming.on('data', (chunk: Buffer) => {
          if (settled) return
          total += chunk.length
          if (total > MAX_BODY_BYTES) { finish(new Error('网页内容超过 1 MB')); return }
          chunks.push(chunk)
        })
        incoming.on('end', () => finish(null, { html: new TextDecoder().decode(Buffer.concat(chunks)) }))
      })
      request.on('error', (error) => finish(error))
      if (settled) request.destroy()
      else request.end()
    })().catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))))
  })
}

async function fetchPage(input: string): Promise<{ url: URL; html: string }> {
  let url = new URL(normalizeUrl(input))
  for (let redirects = 0; redirects <= 3; redirects++) {
    const page = await requestPage(url)
    if ('html' in page) return { url, html: page.html }
    if (redirects === 3) break
    url = new URL(page.location, url)
  }
  throw new Error('网站跳转次数过多')
}

export async function fetchMetadata(input: string): Promise<MetadataResult> {
  const { url, html } = await fetchPage(input)
  const $ = cheerio.load(html)
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || url.hostname).trim().slice(0, 200)
  const description = ($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '').trim().slice(0, 500)
  const iconHref = $('link[rel~="icon"]').first().attr('href') || $('link[rel="apple-touch-icon"]').first().attr('href')
  let iconUrl: string | null = null
  if (iconHref) {
    try { const candidate = new URL(iconHref, url); if (['http:', 'https:'].includes(candidate.protocol)) iconUrl = candidate.href } catch (_) {}
  }
  return { url: url.href, title, description, iconUrl }
}
