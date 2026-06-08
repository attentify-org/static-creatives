import type { TextBlock } from '../types'

export const WATERMARK_TEXT = 'Attainify'

export function isWatermarkBlock(block: TextBlock) {
  return block.role === 'logo' || normalizeWatermarkText(block.text) === 'attainify'
}

function normalizeWatermarkText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}
