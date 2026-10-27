import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBytes, parsePageRanges, sanitizePdfName } from '../src/utils/pdfTools.js'

test('parsePageRanges: 基础范围与单页', () => {
  const { ranges, errors } = parsePageRanges('1-3,5', 10)
  assert.deepEqual(ranges, [
    { start: 1, end: 3 },
    { start: 5, end: 5 },
  ])
  assert.deepEqual(errors, [])
})

test('parsePageRanges: 开区间到末页', () => {
  const { ranges } = parsePageRanges('8-', 10)
  assert.deepEqual(ranges, [{ start: 8, end: 10 }])
})

test('parsePageRanges: 逆序自动交换', () => {
  const { ranges } = parsePageRanges('5-2', 10)
  assert.deepEqual(ranges, [{ start: 2, end: 5 }])
})

test('parsePageRanges: 越界夹取与整段丢弃', () => {
  const { ranges } = parsePageRanges('9-12, 7, 15', 10)
  assert.deepEqual(ranges, [
    { start: 7, end: 7 },
    { start: 9, end: 10 },
  ])
})

test('parsePageRanges: 非法 token 收集不中断', () => {
  const { ranges, errors } = parsePageRanges('abc,1,x2', 10)
  assert.deepEqual(ranges, [{ start: 1, end: 1 }])
  assert.deepEqual(errors, ['abc', 'x2'])
})

test('parsePageRanges: 去重 + 排序 + 中文逗号', () => {
  const { ranges } = parsePageRanges('5，1-3,5', 10)
  assert.deepEqual(ranges, [
    { start: 1, end: 3 },
    { start: 5, end: 5 },
  ])
})

test('parsePageRanges: 空输入返回空', () => {
  assert.deepEqual(parsePageRanges('', 10).ranges, [])
  assert.deepEqual(parsePageRanges('  ', 10).ranges, [])
})

test('sanitizePdfName: Windows 非法字符/多余后缀/结尾点', () => {
  assert.equal(sanitizePdfName('报告<1>.pdf'), '报告1')
  assert.equal(sanitizePdfName('my file.pdf'), 'my file')
  assert.equal(sanitizePdfName('a:b*c?.PDF'), 'abc')
  assert.equal(sanitizePdfName('file..pdf..'), 'file')
  assert.equal(sanitizePdfName('file.pdf.'), 'file')
  assert.equal(sanitizePdfName('final.v2.pdf'), 'final.v2')
  assert.equal(sanitizePdfName('  测试  '), '测试')
})

test('sanitizePdfName: 空值回退 fallback', () => {
  assert.equal(sanitizePdfName('.pdf', 'fallback'), 'fallback')
  assert.equal(sanitizePdfName('///', 'dft'), 'dft')
})

test('formatBytes: 三档展示', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(3 * 1024 * 1024), '3.0 MB')
})
