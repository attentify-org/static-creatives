import type {
  BackgroundVariant,
  CopyRole,
  CopyVariation,
  CopyVariationsResult,
  LayoutResult,
  TextBlock,
  TextSpan,
  TextTransform,
} from '../types'

export function applyVariationPatches(
  layout: LayoutResult,
  variation: CopyVariation,
  canvasWidth?: number,
  canvasHeight?: number,
): LayoutResult {
  const patchesByBlockId = new Map(variation.patches.map((patch) => [patch.blockId, patch.text]))
  const bounds = getLayoutBounds(layout, canvasWidth, canvasHeight)

  return {
    ...layout,
    blocks: layout.blocks.map((block) => {
      const nextText = patchesByBlockId.get(block.id)
      if (typeof nextText !== 'string') return block

      return fitBlockText({
        ...block,
        text: nextText,
        spans: null,
      }, bounds.width, bounds.height)
    }),
  }
}

export function materializeCopyVariations(
  result: CopyVariationsResult,
  baseLayout: LayoutResult,
  canvasWidth?: number,
  canvasHeight?: number,
): CopyVariationsResult {
  return {
    ...result,
    variations: result.variations.map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        layout: applyVariationPatches(baseLayout, item, canvasWidth, canvasHeight),
      })),
    })),
  }
}

export function mergeCopyVariationResults(
  current: CopyVariationsResult | null,
  incoming: CopyVariationsResult,
): CopyVariationsResult {
  if (!current) return incoming

  const incomingRoles = new Set(incoming.variations.map((group) => group.role))
  const mergedExistingGroups = current.variations.map((currentGroup) => {
    const incomingGroup = incoming.variations.find((group) => group.role === currentGroup.role)
    if (!incomingGroup) return currentGroup

    const nextStartIndex = currentGroup.items.length + 1
    const incomingItems = incomingGroup.items.map((item, index) => ({
      ...item,
      id: `${currentGroup.role}-${nextStartIndex + index}`,
    }))

    return {
      ...currentGroup,
      reason: currentGroup.reason || incomingGroup.reason,
      items: [...currentGroup.items, ...incomingItems],
    }
  })

  const newGroups = incoming.variations
    .filter((group) => !current.variations.some((currentGroup) => currentGroup.role === group.role))
    .map((group) => ({
      ...group,
      items: group.items.map((item, index) => ({
        ...item,
        id: `${group.role}-${index + 1}`,
      })),
    }))

  return {
    variations: [
      ...mergedExistingGroups,
      ...newGroups.filter((group) => incomingRoles.has(group.role)),
    ],
  }
}

export function getVariationKeys(result: CopyVariationsResult, backgroundId: string) {
  return result.variations.flatMap((group) =>
    group.items.map((item) => getVariationKey(backgroundId, group.role, item.id)),
  )
}

export function getVariationKey(backgroundId: string, role: CopyRole, id: string) {
  return `${backgroundId}-${role}-${id}`
}

export function getOriginalVariationKey(backgroundId: string) {
  return `${backgroundId}-original`
}

export function getExportItems(
  backgrounds: BackgroundVariant[],
  result: CopyVariationsResult | null,
  baseLayout: LayoutResult,
  canvasWidth: number,
  canvasHeight: number,
  hiddenVariationKeys = new Set<string>(),
) {
  return backgrounds.flatMap((background) => {
    const originalItem = {
      key: getOriginalVariationKey(background.id),
      background,
      layout: baseLayout,
    }

    const variationItems = result
      ? result.variations.flatMap((group) =>
          group.items
            .map((item) => ({
              key: getVariationKey(background.id, group.role, item.id),
              background,
              layout: item.layout ?? applyVariationPatches(baseLayout, item, canvasWidth, canvasHeight),
            }))
            .filter((item) => !hiddenVariationKeys.has(item.key)),
        )
      : []

    return [originalItem, ...variationItems]
  })
}

export function cloneLayout(layout: LayoutResult): LayoutResult {
  return {
    ...layout,
    blocks: layout.blocks.map((block) => ({
      ...block,
      spans: block.spans ? block.spans.map((span) => ({ ...span })) : null,
    })),
  }
}

export function fitBlockText(block: TextBlock, canvasWidth: number, canvasHeight: number): TextBlock {
  const nextBlock = { ...block }
  const margin = 6
  const originalCenterX = nextBlock.x + nextBlock.width / 2
  const originalFontSize = nextBlock.fontSize
  const minFontSize = Math.max(8, originalFontSize * 0.72)
  const maxWidth = Math.max(8, canvasWidth - margin * 2)
  const maxWidthWithGrowth = Math.min(maxWidth, Math.max(nextBlock.width, canvasWidth * 0.92))

  if (estimateMaxLineWidth(nextBlock) > nextBlock.width) {
    nextBlock.width = Math.min(maxWidthWithGrowth, Math.max(nextBlock.width, estimateMaxLineWidth(nextBlock) + 4))
    preserveHorizontalAnchor(nextBlock, originalCenterX, canvasWidth, margin)
  }

  let fit = getTextFit(nextBlock)

  while (!fit.fits && nextBlock.fontSize > minFontSize) {
    const previousFontSize = nextBlock.fontSize
    nextBlock.fontSize = Math.max(minFontSize, Number((nextBlock.fontSize * 0.94).toFixed(2)))
    nextBlock.lineHeight = Math.max(8, Number((nextBlock.lineHeight * (nextBlock.fontSize / previousFontSize)).toFixed(2)))
    nextBlock.letterSpacing = Math.max(-2, Number((nextBlock.letterSpacing - 0.04).toFixed(2)))

    const desiredWidth = estimateMaxLineWidth(nextBlock) + 4
    if (desiredWidth > nextBlock.width) {
      nextBlock.width = Math.min(maxWidthWithGrowth, desiredWidth)
      preserveHorizontalAnchor(nextBlock, originalCenterX, canvasWidth, margin)
    }

    fit = getTextFit(nextBlock)
  }

  if (!fit.fits && nextBlock.letterSpacing > -1.5) {
    nextBlock.letterSpacing = -1.5
    fit = getTextFit(nextBlock)
  }

  if (!fit.fits && nextBlock.width < maxWidthWithGrowth) {
    nextBlock.width = maxWidthWithGrowth
    preserveHorizontalAnchor(nextBlock, originalCenterX, canvasWidth, margin)
    fit = getTextFit(nextBlock)
  }

  if (!fit.fits) {
    const availableHeight = Math.max(8, canvasHeight - nextBlock.y - margin)
    nextBlock.height = Math.min(availableHeight, Math.max(nextBlock.height, Math.ceil(fit.height)))
  }

  return nextBlock
}

export function getInlineSpans(block: TextBlock): TextSpan[] {
  return Array.isArray(block.spans) ? block.spans : []
}

function preserveHorizontalAnchor(
  block: TextBlock,
  originalCenterX: number,
  canvasWidth: number,
  margin: number,
) {
  if (block.align !== 'center') return

  block.x = clampNumber(
    Math.round(originalCenterX - block.width / 2),
    margin,
    Math.max(margin, canvasWidth - block.width - margin),
  )
}

function getTextFit(block: TextBlock) {
  const lineCount = estimateRenderedLineCount(block)
  const height = lineCount * block.lineHeight
  const width = estimateMaxLineWidth(block)

  return {
    fits: width <= block.width && height <= block.height,
    width,
    height,
  }
}

function estimateRenderedLineCount(block: TextBlock) {
  return block.text.split('\n').reduce((total, line) => {
    const lineWidth = estimateLineWidth(line, block)
    return total + Math.max(1, Math.ceil(lineWidth / Math.max(1, block.width)))
  }, 0)
}

function estimateMaxLineWidth(block: TextBlock) {
  return Math.max(...block.text.split('\n').map((line) => estimateLineWidth(line, block)), 0)
}

function estimateLineWidth(line: string, block: TextBlock) {
  const text = applyTextTransform(line, block.textTransform)
  const uppercaseRatio = text.length ? text.replace(/[^A-Z]/g, '').length / text.length : 0
  const weightFactor = block.fontWeight >= 700 ? 0.62 : 0.56
  const charFactor = weightFactor + uppercaseRatio * 0.05
  const tracking = Math.max(-1, block.letterSpacing) * Math.max(0, text.length - 1)
  return text.length * block.fontSize * charFactor + tracking
}

function applyTextTransform(text: string, transform: TextTransform) {
  if (transform === 'uppercase') return text.toUpperCase()
  if (transform === 'lowercase') return text.toLowerCase()
  if (transform === 'capitalize') {
    return text.replace(/\b\w/g, (char) => char.toUpperCase())
  }
  return text
}

function getLayoutBounds(layout: LayoutResult, canvasWidth?: number, canvasHeight?: number) {
  const width = canvasWidth ?? Math.max(...layout.blocks.map((block) => block.x + block.width), 1)
  const height = canvasHeight ?? Math.max(...layout.blocks.map((block) => block.y + block.height), 1)
  return { width, height }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
