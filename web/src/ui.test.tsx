import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Bookmark, Category } from '../../shared/types'
import { Favicon, searchBookmarks } from './ui'

const category: Category = { id: 'category', name: '开发', visibility: 'public', sortOrder: 0, bookmarkCount: 1, createdAt: '', updatedAt: '' }
const bookmark: Bookmark = { id: 'bookmark', categoryId: category.id, title: '哔哩哔哩', url: 'https://www.bilibili.com/', pinyin: 'bi li bi li', description: '视频学习', tags: ['视频'], iconUrl: null, pinned: false, sortOrder: 0, visitCount: 0, lastVisitedAt: null, createdAt: '', updatedAt: '' }

describe('书签图标预览', () => {
  it.each(['', 'https://', 'http://[', '不是合法的网址'])('输入未完成的网址 %s 不会导致页面崩溃', (url) => {
    expect(() => renderToStaticMarkup(<Favicon bookmark={{ ...bookmark, url }} />)).not.toThrow()
  })
})

describe('全局搜索', () => {
  it.each(['bilibili', 'blbl', 'bi li', '#视频', '开发', '学习', 'bilibili.com'])('支持拼音、首字母、标签、分类、描述和网址 %s', (query) => {
    expect(searchBookmarks([bookmark], [category], query)).toEqual([bookmark])
  })

  it('无匹配结果返回空数组', () => {
    expect(searchBookmarks([bookmark], [category], '不存在')).toEqual([])
  })
})
