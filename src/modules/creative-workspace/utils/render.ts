import type { CSSProperties } from 'react'
import type { TextBlock, TextSpan } from '../types'

export function getBlockSpans(block: TextBlock): TextSpan[] {
  if (Array.isArray(block.spans) && block.spans.length) return block.spans

  return [{
    id: 'span-1',
    text: block.text,
    fontSize: block.fontSize,
    fontWeight: block.fontWeight,
    letterSpacing: block.letterSpacing,
    color: block.color,
  }]
}

export function parseStyleDeclarations(value: string): CSSProperties {
  if (!value) return {}

  const blockedProperties = new Set([
    'position',
    'left',
    'top',
    'right',
    'bottom',
    'width',
    'height',
    'transform',
    'fontFamily',
    'fontSize',
    'lineHeight',
    'fontWeight',
    'letterSpacing',
    'color',
    'textAlign',
    'textTransform',
    'zIndex',
    'overflow',
    'whiteSpace',
    'display',
    'margin',
  ])

  return value.split(';').reduce<CSSProperties>((styles, declaration) => {
    const [rawProperty, ...rawValue] = declaration.split(':')
    const property = rawProperty?.trim()
    const propertyValue = rawValue.join(':').trim()

    if (!property || !propertyValue) return styles

    const camelProperty = property.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
    if (blockedProperties.has(camelProperty)) return styles

    return { ...styles, [camelProperty]: propertyValue }
  }, {})
}
