import { describe, expect, it } from 'vitest'
import { defineMessages, fromAcceptLanguage, isLocale, parentLocale, toLocale } from './locale'

describe('isLocale / toLocale', () => {
  it('accepts only zh / en / ja', () => {
    expect(isLocale('zh')).toBe(true)
    expect(isLocale('ja')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(toLocale('fr')).toBe('en')
    expect(toLocale(undefined, 'zh')).toBe('zh')
    expect(toLocale('ja', 'zh')).toBe('ja')
  })
})

describe('fromAcceptLanguage', () => {
  it('sorts by q and takes the first supported language, ignoring region suffixes', () => {
    expect(fromAcceptLanguage('ja,en-US;q=0.9,zh-CN;q=0.8')).toBe('ja')
    expect(fromAcceptLanguage('fr-FR,fr;q=0.9,zh-CN;q=0.8,en;q=0.7')).toBe('zh')
    expect(fromAcceptLanguage('en;q=0.5,ja;q=0.8')).toBe('ja')
    expect(fromAcceptLanguage('zh-TW')).toBe('zh')
  })

  it('equal q keeps the listed order; q=0 means not acceptable', () => {
    expect(fromAcceptLanguage('en;q=0.8,ja;q=0.8')).toBe('en')
    expect(fromAcceptLanguage('ja;q=0,en')).toBe('en')
  })

  it('empty or nothing supported → null', () => {
    expect(fromAcceptLanguage(null)).toBeNull()
    expect(fromAcceptLanguage('')).toBeNull()
    expect(fromAcceptLanguage('fr,de;q=0.5')).toBeNull()
    expect(fromAcceptLanguage('*')).toBeNull()
  })
})

describe('parentLocale', () => {
  it("the student's setting; otherwise the viewer's browser (never the tutor's language)", () => {
    expect(parentLocale('ja', 'zh')).toBe('ja')
    expect(parentLocale('zh', 'en')).toBe('zh')
    expect(parentLocale(null, 'en')).toBe('en')
    expect(parentLocale('xx', 'ja')).toBe('ja')
  })
})

describe('defineMessages', () => {
  it('returns all three languages unchanged', () => {
    const m = defineMessages({
      zh: { hello: '你好', count: (n: number) => `${n} 节` },
      en: { hello: 'Hello', count: (n: number) => `${n} lessons` },
      ja: { hello: 'こんにちは', count: (n: number) => `${n} コマ` },
    })
    expect(m.ja.hello).toBe('こんにちは')
    expect(m.en.count(3)).toBe('3 lessons')
  })

  it('a missing key or different parameters → type error (checked by tsc)', () => {
    // @ts-expect-error en is missing b
    defineMessages({ zh: { a: '', b: '' }, en: { a: '' }, ja: { a: '', b: '' } })
    // @ts-expect-error the ja function takes a different parameter
    defineMessages({ zh: { f: (n: number) => `${n}` }, en: { f: (n: number) => `${n}` }, ja: { f: (s: string) => s } })
  })
})
