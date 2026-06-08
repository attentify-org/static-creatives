export type Step1Result = {
  imagePath: string
  width: number
  height: number
  sourceWidth?: number
  sourceHeight?: number
}

export type TextBlockRole = 'hook' | 'body' | 'cta' | 'badge' | 'price' | 'disclaimer' | 'logo' | 'other'
export type TextAlign = 'left' | 'center' | 'right'
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
export type CopyRole = 'hook' | 'cta' | 'body'
export type HookVariationMode = 'light' | 'medium' | 'strong'
export type BackgroundMode = 'original' | 'light' | 'medium' | 'strong'

export type TextSpan = {
  id: string
  text: string
  fontSize: number
  fontWeight: number
  letterSpacing: number
  color: string
}

export type TextBlock = {
  id: string
  role: TextBlockRole
  text: string
  spans: TextSpan[] | null
  x: number
  y: number
  width: number
  height: number
  fontFamily: string
  fontSize: number
  lineHeight: number
  fontWeight: number
  letterSpacing: number
  color: string
  align: TextAlign
  textTransform: TextTransform
  zIndex: number
  otherStyles: string
}

export type LayoutResult = {
  globalStyles: string
  blocks: TextBlock[]
}

export type CopyVariation = {
  id: string
  patches: Array<{
    blockId: string
    text: string
  }>
  layout?: LayoutResult
}

export type CopyVariationGroup = {
  role: CopyRole
  items: CopyVariation[]
  reason: string
}

export type CopyVariationsResult = {
  variations: CopyVariationGroup[]
}

export type SelectedVariationKey = {
  backgroundId: string
  role: CopyRole
  id: string
} | null

export type BackgroundVariant = {
  id: string
  label: string
  imagePath: string
  mode: BackgroundMode
}
