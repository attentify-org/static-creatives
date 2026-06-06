'use client'

import { useState, useRef } from 'react'

type Step1Result = {
  imagePath: string
  width: number
  height: number
  sourceWidth?: number
  sourceHeight?: number
}

type TextBlockRole = 'hook' | 'body' | 'cta' | 'badge' | 'price' | 'disclaimer' | 'logo' | 'other'
type TextAlign = 'left' | 'center' | 'right'
type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'

type TextSpan = {
  id: string
  text: string
  fontSize: number
  fontWeight: number
  letterSpacing: number
  color: string
}

type TextBlock = {
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

type LayoutResult = {
  globalStyles: string
  blocks: TextBlock[]
}

export default function Home() {
  const [step1Status, setStep1Status] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [step1Result, setStep1Result] = useState<Step1Result | null>(null)
  const [step1Error, setStep1Error] = useState('')

  const [layoutStatus, setLayoutStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [layoutResult, setLayoutResult] = useState<LayoutResult | null>(null)
  const [layoutError, setLayoutError] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState('')
  const [selectedSpanIndex, setSelectedSpanIndex] = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)

  async function handleRemoveText(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setStep1Status('loading')
    setStep1Error('')
    setStep1Result(null)
    setLayoutStatus('idle')
    setLayoutResult(null)
    setEditMode(false)
    setSelectedBlockId('')
    setSelectedSpanIndex(0)

    const { width, height } = await getImageDimensions(file)

    const formData = new FormData()
    formData.append('image', file)
    formData.append('width', String(width))
    formData.append('height', String(height))

    try {
      const res = await fetch('/api/remove-text', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setStep1Result(data)
      setStep1Status('done')
    } catch (err) {
      setStep1Error(err instanceof Error ? err.message : 'Unknown error')
      setStep1Status('error')
    }
  }

  async function handleExtractLayout() {
    const file = fileRef.current?.files?.[0]
    if (!file || !step1Result) return

    setLayoutStatus('loading')
    setLayoutError('')
    setLayoutResult(null)
    setEditMode(false)
    setSelectedBlockId('')
    setSelectedSpanIndex(0)

    const formData = new FormData()
    formData.append('image', file)
    formData.append('width', String(step1Result.width))
    formData.append('height', String(step1Result.height))

    try {
      const res = await fetch('/api/extract-layout', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setLayoutResult(data)
      setSelectedBlockId(data.blocks?.[0]?.id ?? '')
      setSelectedSpanIndex(0)
      setLayoutStatus('done')
    } catch (err) {
      setLayoutError(err instanceof Error ? err.message : 'Unknown error')
      setLayoutStatus('error')
    }
  }

  function updateSelectedBlock(patch: Partial<TextBlock>) {
    if (!selectedBlockId) return
    setLayoutResult((current) => {
      if (!current) return current
      return {
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== selectedBlockId) return block
          const nextBlock = { ...block, ...patch }

          if (typeof patch.text === 'string' && !patch.spans) {
            nextBlock.spans = null
            setSelectedSpanIndex(0)
          }

          return nextBlock
        }),
      }
    })
  }

  function updateSelectedSpan(patch: Partial<TextSpan>) {
    if (!selectedBlockId) return
    setLayoutResult((current) => {
      if (!current) return current

      return {
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== selectedBlockId) return block
          const spans = getInlineSpans(block)
          if (!spans.length) return block
          const safeSpanIndex = Math.min(selectedSpanIndex, spans.length - 1)
          const nextSpans = spans.map((span, index) =>
            index === safeSpanIndex ? { ...span, ...patch } : span,
          )

          return {
            ...block,
            spans: nextSpans,
            text: nextSpans.map((span) => span.text).join(''),
          }
        }),
      }
    })
  }

  function selectBlock(id: string) {
    setSelectedBlockId(id)
    setSelectedSpanIndex(0)
  }

  function deleteSelectedBlock() {
    if (!selectedBlockId) return
    setLayoutResult((current) => {
      if (!current) return current

      const selectedIndex = current.blocks.findIndex((block) => block.id === selectedBlockId)
      const blocks = current.blocks.filter((block) => block.id !== selectedBlockId)
      const nextSelectedBlock = blocks[Math.min(selectedIndex, blocks.length - 1)] ?? blocks[0]
      setSelectedBlockId(nextSelectedBlock?.id ?? '')
      setSelectedSpanIndex(0)

      return { ...current, blocks }
    })
  }

  function nudgeSelectedBlock(dx: number, dy: number) {
    const block = layoutResult?.blocks.find((item) => item.id === selectedBlockId)
    if (!block) return
    updateSelectedBlock({ x: block.x + dx, y: block.y + dy })
  }

  function centerSelectedRow() {
    const selectedBlock = layoutResult?.blocks.find((item) => item.id === selectedBlockId)
    if (!layoutResult || !step1Result || !selectedBlock) return

    const rowBlocks = getRowBlocks(layoutResult.blocks, selectedBlock)
    const left = Math.min(...rowBlocks.map((block) => block.x))
    const right = Math.max(...rowBlocks.map((block) => block.x + block.width))
    const targetLeft = Math.round((step1Result.width - (right - left)) / 2)
    const deltaX = targetLeft - left
    const rowBlockIds = new Set(rowBlocks.map((block) => block.id))

    setLayoutResult({
      ...layoutResult,
      blocks: layoutResult.blocks.map((block) =>
        rowBlockIds.has(block.id) ? { ...block, x: block.x + deltaX } : block,
      ),
    })
  }

  const selectedBlock = layoutResult?.blocks.find((block) => block.id === selectedBlockId) ?? null
  const selectedSpans = selectedBlock ? getInlineSpans(selectedBlock) : []
  const selectedSpan = selectedSpans[selectedSpanIndex] ?? selectedSpans[0] ?? null

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-6">
      <h1 className="text-2xl font-semibold mt-8">Creatives App</h1>

      {/* Step 1 */}
      <section className="flex flex-col items-center gap-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Step 1 — Remove Text</h2>
        <form onSubmit={handleRemoveText} className="flex flex-col items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            required
            className="border border-gray-300 rounded p-2 text-sm"
          />
          <button
            type="submit"
            disabled={step1Status === 'loading'}
            className="bg-black text-white rounded-full px-6 py-2 text-sm disabled:opacity-50"
          >
            {step1Status === 'loading' ? 'Removing text…' : 'Remove Text'}
          </button>
        </form>
        {step1Status === 'loading' && (
          <p className="text-sm text-gray-400">Processing with AI, ~20–30s…</p>
        )}
        {step1Status === 'error' && (
          <p className="text-sm text-red-500">{step1Error}</p>
        )}
        {step1Status === 'done' && step1Result && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-gray-400">{step1Result.width}×{step1Result.height}px</p>
            <CreativeCanvas
              imagePath={step1Result.imagePath}
              width={step1Result.width}
              height={step1Result.height}
            />
          </div>
        )}
      </section>

      {/* Step 2 */}
      {step1Status === 'done' && step1Result && (
        <section className="flex w-full max-w-5xl flex-col items-center gap-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Step 2 — Build Editable Replica</h2>
          <button
            onClick={handleExtractLayout}
            disabled={layoutStatus === 'loading'}
            className="bg-black text-white rounded-full px-6 py-2 text-sm disabled:opacity-50"
          >
            {layoutStatus === 'loading' ? 'Analyzing…' : 'Build Text Layout'}
          </button>
          {layoutStatus === 'loading' && (
            <p className="text-sm text-gray-400">Reconstructing editable text blocks…</p>
          )}
          {layoutStatus === 'error' && (
            <p className="text-sm text-red-500">{layoutError}</p>
          )}
          {layoutStatus === 'done' && layoutResult && (
            <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditMode((value) => !value)}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm"
                  >
                    {editMode ? 'Done Editing' : 'Edit'}
                  </button>
                  <p className="text-xs text-gray-400">{layoutResult.blocks.length} text blocks</p>
                </div>
                <CreativeCanvas
                  imagePath={step1Result.imagePath}
                  width={step1Result.width}
                  height={step1Result.height}
                  globalStyles={layoutResult.globalStyles}
                  blocks={layoutResult.blocks}
                  editMode={editMode}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={selectBlock}
                />
              </div>
              <EditorPanel
                blocks={layoutResult.blocks}
                selectedBlock={selectedBlock}
                selectedBlockId={selectedBlockId}
                selectedSpan={selectedSpan}
                selectedSpanIndex={Math.min(selectedSpanIndex, Math.max(0, selectedSpans.length - 1))}
                editMode={editMode}
                canvasWidth={step1Result.width}
                onSelectBlock={selectBlock}
                onSelectSpan={setSelectedSpanIndex}
                onUpdateBlock={updateSelectedBlock}
                onUpdateSpan={updateSelectedSpan}
                onNudgeBlock={nudgeSelectedBlock}
                onCenterRow={centerSelectedRow}
                onDeleteBlock={deleteSelectedBlock}
              />
            </div>
          )}
        </section>
      )}
    </main>
  )
}

const PREVIEW_MAX_WIDTH = 430

function CreativeCanvas({
  imagePath,
  width,
  height,
  globalStyles = '',
  blocks = [],
  editMode = false,
  selectedBlockId = '',
  onSelectBlock,
}: {
  imagePath: string
  width: number
  height: number
  globalStyles?: string
  blocks?: TextBlock[]
  editMode?: boolean
  selectedBlockId?: string
  onSelectBlock?: (id: string) => void
}) {
  const scale = Math.min(PREVIEW_MAX_WIDTH / width, 1)
  const previewWidth = Math.round(width * scale)
  const previewHeight = Math.round(height * scale)

  return (
    <div
      style={{ width: previewWidth, height: previewHeight }}
      className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm"
    >
      <style>{globalStyles}</style>
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          backgroundImage: `url('${imagePath}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
        className="relative"
      >
        {blocks.map((block) => (
          <div
            key={block.id}
            role={editMode ? 'button' : undefined}
            tabIndex={editMode ? 0 : undefined}
            onClick={() => {
              if (editMode) onSelectBlock?.(block.id)
            }}
            onKeyDown={(event) => {
              if (editMode && (event.key === 'Enter' || event.key === ' ')) {
                onSelectBlock?.(block.id)
              }
            }}
            style={{
              left: block.x,
              top: block.y,
              width: block.width,
              height: block.height,
              fontFamily: block.fontFamily,
              fontSize: block.fontSize,
              lineHeight: `${block.lineHeight}px`,
              fontWeight: block.fontWeight,
              letterSpacing: block.letterSpacing,
              color: block.color,
              textAlign: block.align,
              textTransform: block.textTransform,
              zIndex: block.zIndex,
              boxSizing: 'border-box',
              whiteSpace: 'pre-line',
              overflowWrap: 'normal',
              wordBreak: 'normal',
              ...parseStyleDeclarations(block.otherStyles),
            }}
            className={[
              'absolute m-0 block overflow-hidden border-0 bg-transparent p-0',
              editMode ? 'cursor-pointer' : 'pointer-events-none',
              editMode && selectedBlockId === block.id ? 'outline outline-2 outline-blue-500' : '',
              editMode && selectedBlockId !== block.id ? 'outline outline-1 outline-blue-300/60' : '',
            ].join(' ')}
          >
            {getBlockSpans(block).map((span) => (
              <span
                key={span.id}
                style={{
                  fontSize: span.fontSize,
                  fontWeight: span.fontWeight,
                  letterSpacing: span.letterSpacing,
                  color: span.color,
                }}
              >
                {span.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function EditorPanel({
  blocks,
  selectedBlock,
  selectedBlockId,
  selectedSpan,
  selectedSpanIndex,
  editMode,
  canvasWidth,
  onSelectBlock,
  onSelectSpan,
  onUpdateBlock,
  onUpdateSpan,
  onNudgeBlock,
  onCenterRow,
  onDeleteBlock,
}: {
  blocks: TextBlock[]
  selectedBlock: TextBlock | null
  selectedBlockId: string
  selectedSpan: TextSpan | null
  selectedSpanIndex: number
  editMode: boolean
  canvasWidth: number
  onSelectBlock: (id: string) => void
  onSelectSpan: (index: number) => void
  onUpdateBlock: (patch: Partial<TextBlock>) => void
  onUpdateSpan: (patch: Partial<TextSpan>) => void
  onNudgeBlock: (dx: number, dy: number) => void
  onCenterRow: () => void
  onDeleteBlock: () => void
}) {
  const spans = selectedBlock ? getInlineSpans(selectedBlock) : []

  return (
    <aside className="flex flex-col gap-3 rounded border border-gray-200 p-4">
      <label className="flex flex-col gap-1 text-xs text-gray-500">
        Block
        <select
          value={selectedBlockId}
          onChange={(event) => onSelectBlock(event.target.value)}
          className="rounded border border-gray-300 bg-white p-2 text-sm text-black"
        >
          {blocks.map((block) => (
            <option key={block.id} value={block.id}>
              {block.id} ({block.role})
            </option>
          ))}
        </select>
      </label>

      {!editMode && (
        <p className="text-xs text-gray-400">Click Edit to adjust text and position.</p>
      )}

      {editMode && selectedBlock && (
        <>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Text
            <textarea
              value={selectedBlock.text}
              onChange={(event) => onUpdateBlock({ text: event.target.value })}
              rows={4}
              className="rounded border border-gray-300 p-2 text-sm text-black"
            />
          </label>

          {spans.length > 0 && (
          <div className="flex flex-col gap-3 rounded border border-gray-200 p-3">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              Inline span
              <select
                value={selectedSpanIndex}
                onChange={(event) => onSelectSpan(Number(event.target.value))}
                className="rounded border border-gray-300 bg-white p-2 text-sm text-black"
              >
                {spans.map((span, index) => (
                  <option key={span.id} value={index}>
                    {span.id}: {span.text.slice(0, 24) || 'empty'}
                  </option>
                ))}
              </select>
            </label>

            {selectedSpan && (
              <>
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                  Span text
                  <input
                    value={selectedSpan.text}
                    onChange={(event) => onUpdateSpan({ text: event.target.value })}
                    className="rounded border border-gray-300 p-2 text-sm text-black"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Span size" value={selectedSpan.fontSize} onChange={(fontSize) => onUpdateSpan({ fontSize })} />
                  <NumberField label="Span weight" value={selectedSpan.fontWeight} step={100} onChange={(fontWeight) => onUpdateSpan({ fontWeight })} />
                  <NumberField label="Span tracking" value={selectedSpan.letterSpacing} step={0.1} onChange={(letterSpacing) => onUpdateSpan({ letterSpacing })} />
                  <label className="flex flex-col gap-1 text-xs text-gray-500">
                    Span color
                    <input
                      value={selectedSpan.color}
                      onChange={(event) => onUpdateSpan({ color: event.target.value })}
                      className="min-w-0 rounded border border-gray-300 p-2 text-sm text-black"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button className="rounded border border-gray-300 p-2 text-sm" onClick={() => onNudgeBlock(0, -10)}>Up 10</button>
            <button className="rounded border border-gray-300 p-2 text-sm" onClick={() => onNudgeBlock(0, -1)}>Up 1</button>
            <button className="rounded border border-gray-300 p-2 text-sm" onClick={() => onNudgeBlock(0, 1)}>Down 1</button>
            <button className="rounded border border-gray-300 p-2 text-sm" onClick={() => onNudgeBlock(-10, 0)}>Left 10</button>
            <button className="rounded border border-gray-300 p-2 text-sm" onClick={() => onNudgeBlock(10, 0)}>Right 10</button>
            <button className="rounded border border-gray-300 p-2 text-sm" onClick={() => onNudgeBlock(0, 10)}>Down 10</button>
          </div>

          <button
            className="rounded border border-gray-300 p-2 text-sm"
            onClick={() =>
              onUpdateBlock({
                x: Math.round((canvasWidth - selectedBlock.width) / 2),
                align: 'center',
              })
            }
          >
            Center horizontally
          </button>

          <button
            className="rounded border border-gray-300 p-2 text-sm"
            onClick={onCenterRow}
          >
            Center row
          </button>

          <button
            className="rounded border border-red-300 p-2 text-sm text-red-600"
            onClick={onDeleteBlock}
          >
            Delete block
          </button>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={selectedBlock.x} onChange={(x) => onUpdateBlock({ x })} />
            <NumberField label="Y" value={selectedBlock.y} onChange={(y) => onUpdateBlock({ y })} />
            <NumberField label="Width" value={selectedBlock.width} onChange={(width) => onUpdateBlock({ width })} />
            <NumberField label="Height" value={selectedBlock.height} onChange={(height) => onUpdateBlock({ height })} />
            <NumberField label="Font size" value={selectedBlock.fontSize} onChange={(fontSize) => onUpdateBlock({ fontSize })} />
            <NumberField label="Line height" value={selectedBlock.lineHeight} onChange={(lineHeight) => onUpdateBlock({ lineHeight })} />
            <NumberField label="Weight" value={selectedBlock.fontWeight} step={100} onChange={(fontWeight) => onUpdateBlock({ fontWeight })} />
            <NumberField label="Tracking" value={selectedBlock.letterSpacing} step={0.1} onChange={(letterSpacing) => onUpdateBlock({ letterSpacing })} />
          </div>

          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Color
            <input
              value={selectedBlock.color}
              onChange={(event) => onUpdateBlock({ color: event.target.value })}
              className="rounded border border-gray-300 p-2 text-sm text-black"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Other styles
            <textarea
              value={selectedBlock.otherStyles ?? ''}
              onChange={(event) => onUpdateBlock({ otherStyles: event.target.value })}
              rows={3}
              placeholder="text-shadow: 0 2px 4px rgba(0,0,0,.25);"
              className="rounded border border-gray-300 p-2 text-sm text-black"
            />
          </label>
        </>
      )}
    </aside>
  )
}

function NumberField({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-500">
      {label}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 rounded border border-gray-300 p-2 text-sm text-black"
      />
    </label>
  )
}

function getBlockSpans(block: TextBlock): TextSpan[] {
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

function getInlineSpans(block: TextBlock): TextSpan[] {
  return Array.isArray(block.spans) ? block.spans : []
}

function parseStyleDeclarations(value: string): React.CSSProperties {
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

  return value.split(';').reduce<React.CSSProperties>((styles, declaration) => {
    const [rawProperty, ...rawValue] = declaration.split(':')
    const property = rawProperty?.trim()
    const propertyValue = rawValue.join(':').trim()

    if (!property || !propertyValue) return styles

    const camelProperty = property.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
    if (blockedProperties.has(camelProperty)) return styles

    return { ...styles, [camelProperty]: propertyValue }
  }, {})
}

function getRowBlocks(blocks: TextBlock[], selectedBlock: TextBlock) {
  const selectedCenterY = selectedBlock.y + selectedBlock.height / 2
  const selectedTop = selectedBlock.y
  const selectedBottom = selectedBlock.y + selectedBlock.height

  return blocks.filter((block) => {
    const blockCenterY = block.y + block.height / 2
    const blockTop = block.y
    const blockBottom = block.y + block.height
    const verticalOverlap = Math.min(selectedBottom, blockBottom) - Math.max(selectedTop, blockTop)
    const minHeight = Math.max(1, Math.min(selectedBlock.height, block.height))

    return (
      Math.abs(blockCenterY - selectedCenterY) <= Math.max(6, minHeight * 0.65) ||
      verticalOverlap / minHeight >= 0.45
    )
  })
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
