'use client'

import { useState, useRef } from 'react'
import { toPng } from 'html-to-image'
import JSZip from 'jszip'

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
type CopyRole = 'hook' | 'cta' | 'body'
type HookVariationMode = 'light' | 'medium' | 'strong'
type BackgroundMode = 'original' | 'light' | 'medium' | 'strong'

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

type CopyVariation = {
  id: string
  patches: Array<{
    blockId: string
    text: string
  }>
  layout?: LayoutResult
}

type CopyVariationGroup = {
  role: CopyRole
  items: CopyVariation[]
  reason: string
}

type CopyVariationsResult = {
  variations: CopyVariationGroup[]
}

type SelectedVariationKey = {
  backgroundId: string
  role: CopyRole
  id: string
} | null

type BackgroundVariant = {
  id: string
  label: string
  imagePath: string
  mode: BackgroundMode
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
  const [copyCounts, setCopyCounts] = useState<Record<CopyRole, number>>({ hook: 5, cta: 0, body: 0 })
  const [hookVariationMode, setHookVariationMode] = useState<HookVariationMode>('medium')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [copyResult, setCopyResult] = useState<CopyVariationsResult | null>(null)
  const [copyError, setCopyError] = useState('')
  const [selectedVariationKey, setSelectedVariationKey] = useState<SelectedVariationKey>(null)
  const [selectedDownloadKeys, setSelectedDownloadKeys] = useState<Set<string>>(new Set())
  const [backgroundMode, setBackgroundMode] = useState<Exclude<BackgroundMode, 'original'>>('medium')
  const [backgroundStatus, setBackgroundStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [backgroundError, setBackgroundError] = useState('')
  const [backgroundVariants, setBackgroundVariants] = useState<BackgroundVariant[]>([])
  const [editorBackgroundId, setEditorBackgroundId] = useState('original')

  const fileRef = useRef<HTMLInputElement>(null)

  async function handleBuildCreative(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setStep1Status('loading')
    setStep1Error('')
    setStep1Result(null)
    setLayoutStatus('loading')
    setLayoutError('')
    setLayoutResult(null)
    setEditMode(false)
    setSelectedBlockId('')
    setSelectedSpanIndex(0)
    setCopyStatus('idle')
    setCopyResult(null)
    setSelectedVariationKey(null)
    setSelectedDownloadKeys(new Set())
    setBackgroundStatus('idle')
    setBackgroundError('')
    setBackgroundVariants([])
    setEditorBackgroundId('original')

    const sourceSize = await getImageDimensions(file)
    const targetSize = getImageEditSize(sourceSize.width, sourceSize.height)

    const removeTextFormData = new FormData()
    removeTextFormData.append('image', file)
    removeTextFormData.append('width', String(sourceSize.width))
    removeTextFormData.append('height', String(sourceSize.height))

    const extractLayoutFormData = new FormData()
    extractLayoutFormData.append('image', file)
    extractLayoutFormData.append('width', String(targetSize.width))
    extractLayoutFormData.append('height', String(targetSize.height))

    try {
      const [removeTextResult, layoutData] = await Promise.all([
        postForm<Step1Result>('/api/remove-text', removeTextFormData),
        postForm<LayoutResult>('/api/extract-layout', extractLayoutFormData),
      ])

      setStep1Result(removeTextResult)
      setLayoutResult(layoutData)
      setSelectedBlockId(layoutData.blocks?.[0]?.id ?? '')
      setSelectedSpanIndex(0)
      setStep1Status('done')
      setLayoutStatus('done')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setStep1Error(message)
      setLayoutError(message)
      setStep1Status('error')
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

  async function handleGenerateCopyVariations() {
    if (!layoutResult) return
    const layoutForVariations = cloneLayout(layoutResult)

    commitSelectedVariationEdits()
    setCopyStatus('loading')
    setCopyError('')
    setCopyResult(null)

    try {
      const res = await fetch('/api/generate-copy-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout: layoutForVariations,
          counts: copyCounts,
          hookMode: hookVariationMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      const materializedResult = materializeCopyVariations(data, layoutForVariations, step1Result?.width, step1Result?.height)
      setCopyResult(materializedResult)
      setSelectedDownloadKeys(new Set(getVariationKeys(materializedResult, 'original')))
      setSelectedVariationKey(null)
      setCopyStatus('done')
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Unknown error')
      setCopyStatus('error')
    }
  }

  async function handleGenerateBackgroundVariant() {
    const file = fileRef.current?.files?.[0]
    if (!file || !step1Result) return

    setBackgroundStatus('loading')
    setBackgroundError('')

    const formData = new FormData()
    formData.append('sourceImage', file)
    formData.append('cleanImagePath', step1Result.imagePath)
    formData.append('width', String(step1Result.width))
    formData.append('height', String(step1Result.height))
    formData.append('mode', backgroundMode)

    try {
      const data = await postForm<BackgroundVariant>('/api/generate-background-variant', formData)
      const numberedBackground = {
        ...data,
        label: `Background variant ${backgroundVariants.length + 1} (${backgroundMode})`,
      }
      setBackgroundVariants((current) => [...current, numberedBackground])
      setSelectedDownloadKeys((current) => {
        if (!copyResult) return current
        return new Set([...current, ...getVariationKeys(copyResult, numberedBackground.id)])
      })
      setBackgroundStatus('done')
    } catch (err) {
      setBackgroundError(err instanceof Error ? err.message : 'Unknown error')
      setBackgroundStatus('error')
    }
  }

  function selectCopyVariation(backgroundId: string, role: CopyRole, variation: CopyVariation) {
    if (!layoutResult) return

    commitSelectedVariationEdits()

    const nextLayout = cloneLayout(variation.layout ?? applyVariationPatches(
      layoutResult,
      variation,
      step1Result?.width,
      step1Result?.height,
    ))
    setLayoutResult(nextLayout)
    setSelectedBlockId(nextLayout.blocks[0]?.id ?? '')
    setSelectedSpanIndex(0)
    setEditorBackgroundId(backgroundId)
    setSelectedVariationKey({ backgroundId, role, id: variation.id })
    setEditMode(true)
  }

  function toggleEditMode() {
    if (editMode) {
      commitSelectedVariationEdits()
      setEditMode(false)
      return
    }

    setEditMode(true)
  }

  function toggleDownloadSelection(key: string, selected: boolean) {
    setSelectedDownloadKeys((current) => {
      const next = new Set(current)
      if (selected) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }

  function commitSelectedVariationEdits() {
    if (!selectedVariationKey || !layoutResult) return

    setCopyResult((current) => {
      if (!current) return current

      return {
        ...current,
        variations: current.variations.map((group) => {
          if (group.role !== selectedVariationKey.role) return group

          return {
            ...group,
            items: group.items.map((item) =>
              item.id === selectedVariationKey.id
                ? { ...item, layout: cloneLayout(layoutResult) }
                : item,
            ),
          }
        }),
      }
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
  const backgrounds: BackgroundVariant[] = step1Result
    ? [
        {
          id: 'original',
          label: 'Original background',
          imagePath: step1Result.imagePath,
          mode: 'original',
        },
        ...backgroundVariants,
      ]
    : []
  const editorBackground = backgrounds.find((background) => background.id === editorBackgroundId) ?? backgrounds[0]

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-6">
      <h1 className="text-2xl font-semibold mt-8">Creatives App</h1>

      {/* Step 1 */}
      <section className="flex flex-col items-center gap-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Build Editable Creative</h2>
        <form onSubmit={handleBuildCreative} className="flex flex-col items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            required
            className="border border-gray-300 rounded p-2 text-sm"
          />
          <button
            type="submit"
            disabled={step1Status === 'loading' || layoutStatus === 'loading'}
            className="bg-black text-white rounded-full px-6 py-2 text-sm disabled:opacity-50"
          >
            {step1Status === 'loading' || layoutStatus === 'loading' ? 'Building…' : 'Build Creative'}
          </button>
        </form>
        {(step1Status === 'loading' || layoutStatus === 'loading') && (
          <p className="text-sm text-gray-400">Removing text and extracting editable layout in parallel…</p>
        )}
        {(step1Status === 'error' || layoutStatus === 'error') && (
          <p className="text-sm text-red-500">{step1Error || layoutError}</p>
        )}
      </section>

      {step1Status === 'done' && layoutStatus === 'done' && step1Result && layoutResult && (
        <section className="flex w-full max-w-5xl flex-col items-center gap-4">
          <>
            <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleEditMode}
                    className="rounded-full border border-gray-300 px-4 py-2 text-sm"
                  >
                    {editMode ? 'Done Editing' : 'Edit'}
                  </button>
                  <p className="text-xs text-gray-400">{layoutResult.blocks.length} text blocks</p>
                </div>
                  <CreativeCanvas
                  imagePath={editorBackground.imagePath}
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
              <CopyVariationsPanel
              backgrounds={backgrounds}
              canvasWidth={step1Result.width}
              canvasHeight={step1Result.height}
              baseLayout={layoutResult}
              counts={copyCounts}
              hookMode={hookVariationMode}
              backgroundMode={backgroundMode}
              backgroundStatus={backgroundStatus}
              status={copyStatus}
              result={copyResult}
              error={copyError}
              backgroundError={backgroundError}
              onChangeCounts={setCopyCounts}
              onChangeHookMode={setHookVariationMode}
              onChangeBackgroundMode={setBackgroundMode}
              onGenerate={handleGenerateCopyVariations}
              onGenerateBackground={handleGenerateBackgroundVariant}
              onSelectVariation={selectCopyVariation}
              selectedVariationKey={selectedVariationKey}
              selectedDownloadKeys={selectedDownloadKeys}
              onToggleDownloadSelection={toggleDownloadSelection}
            />
          </>
        </section>
      )}
    </main>
  )
}

function CopyVariationsPanel({
  backgrounds,
  canvasWidth,
  canvasHeight,
  baseLayout,
  counts,
  hookMode,
  backgroundMode,
  backgroundStatus,
  status,
  result,
  error,
  backgroundError,
  onChangeCounts,
  onChangeHookMode,
  onChangeBackgroundMode,
  onGenerate,
  onGenerateBackground,
  onSelectVariation,
  selectedVariationKey,
  selectedDownloadKeys,
  onToggleDownloadSelection,
}: {
  backgrounds: BackgroundVariant[]
  canvasWidth: number
  canvasHeight: number
  baseLayout: LayoutResult
  counts: Record<CopyRole, number>
  hookMode: HookVariationMode
  backgroundMode: Exclude<BackgroundMode, 'original'>
  backgroundStatus: 'idle' | 'loading' | 'done' | 'error'
  status: 'idle' | 'loading' | 'done' | 'error'
  result: CopyVariationsResult | null
  error: string
  backgroundError: string
  onChangeCounts: (counts: Record<CopyRole, number>) => void
  onChangeHookMode: (mode: HookVariationMode) => void
  onChangeBackgroundMode: (mode: Exclude<BackgroundMode, 'original'>) => void
  onGenerate: () => void
  onGenerateBackground: () => void
  onSelectVariation: (backgroundId: string, role: CopyRole, variation: CopyVariation) => void
  selectedVariationKey: SelectedVariationKey
  selectedDownloadKeys: Set<string>
  onToggleDownloadSelection: (key: string, selected: boolean) => void
}) {
  const totalCount = counts.hook + counts.cta + counts.body
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [downloadError, setDownloadError] = useState('')
  const exportNodeRefs = useRef<Record<string, HTMLDivElement | null>>({})

  function updateCount(role: CopyRole, value: number) {
    onChangeCounts({
      ...counts,
      [role]: Math.max(0, Math.min(10, Math.floor(value || 0))),
    })
  }

  async function handleDownloadSelected() {
    if (!result || selectedDownloadKeys.size === 0) return

    setDownloadStatus('loading')
    setDownloadError('')

    try {
      await document.fonts?.ready
      const selectedItems = result.variations.flatMap((group) =>
        group.items.flatMap((item) =>
          backgrounds
            .filter((background) => selectedDownloadKeys.has(getVariationKey(background.id, group.role, item.id)))
            .map((background) => ({ background, role: group.role, item })),
        ),
      )

      if (selectedItems.length === 1) {
        const [{ background, role, item }] = selectedItems
        const key = getVariationKey(background.id, role, item.id)
        const node = exportNodeRefs.current[key]
        if (!node) throw new Error('Selected variation is not ready for export')
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1, backgroundColor: '#ffffff' })
        downloadDataUrl(dataUrl, `${safeFilename(key)}.png`)
        setDownloadStatus('idle')
        return
      }

      const zip = new JSZip()

      for (const { background, role, item } of selectedItems) {
        const key = getVariationKey(background.id, role, item.id)
        const node = exportNodeRefs.current[key]
        if (!node) continue
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1, backgroundColor: '#ffffff' })
        zip.file(`${safeFilename(key)}.png`, dataUrl.split(',')[1], { base64: true })
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, 'creative-variations.zip')
      setDownloadStatus('idle')
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed')
      setDownloadStatus('error')
    }
  }

  return (
    <section className="flex w-full max-w-5xl flex-col gap-4 rounded border border-gray-200 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <NumberField label="Hook variations" value={counts.hook} onChange={(value) => updateCount('hook', value)} />
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Hook mode
            <select
              value={hookMode}
              onChange={(event) => onChangeHookMode(event.target.value as HookVariationMode)}
              className="rounded border border-gray-300 bg-white p-2 text-sm text-black"
            >
              <option value="light">Light variation</option>
              <option value="medium">Medium variation</option>
              <option value="strong">Strong variation</option>
            </select>
          </label>
        </div>
        <NumberField label="CTA variations" value={counts.cta} onChange={(value) => updateCount('cta', value)} />
        <NumberField label="Body variations" value={counts.body} onChange={(value) => updateCount('body', value)} />
      </div>

      <button
        className="self-start rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-50"
        disabled={status === 'loading' || totalCount === 0}
        onClick={onGenerate}
      >
        {status === 'loading' ? 'Generating copy…' : 'Generate Copy Variations'}
      </button>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          Background mode
          <select
            value={backgroundMode}
            onChange={(event) => onChangeBackgroundMode(event.target.value as Exclude<BackgroundMode, 'original'>)}
            className="rounded border border-gray-300 bg-white p-2 text-sm text-black"
          >
            <option value="light">Light background</option>
            <option value="medium">Medium background</option>
            <option value="strong">Strong background</option>
          </select>
        </label>
        <button
          className="self-start rounded-full border border-gray-300 px-5 py-2 text-sm disabled:opacity-50"
          disabled={backgroundStatus === 'loading'}
          onClick={onGenerateBackground}
        >
          {backgroundStatus === 'loading' ? 'Generating background…' : 'Generate Background Variant'}
        </button>
      </div>
      {backgroundStatus === 'error' && <p className="text-sm text-red-500">{backgroundError}</p>}

      {status === 'error' && <p className="text-sm text-red-500">{error}</p>}

      {status === 'done' && result && (
        <div className="flex flex-col gap-6">
          {backgrounds.map((background) => (
            <div key={background.id} className="flex flex-col gap-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{background.label}</h3>
              {result.variations.map((group) => (
                <div key={`${background.id}-${group.role}`} className="flex flex-col gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group.role}</h4>
                  {group.reason && <p className="text-sm text-gray-400">{group.reason}</p>}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {group.items.map((item) => {
                      const variationLayout = item.layout ?? applyVariationPatches(baseLayout, item, canvasWidth, canvasHeight)
                      const isSelected =
                        selectedVariationKey?.backgroundId === background.id &&
                        selectedVariationKey.role === group.role &&
                        selectedVariationKey.id === item.id
                      const variationKey = getVariationKey(background.id, group.role, item.id)

                      return (
                        <div
                          key={variationKey}
                          className={[
                            'flex flex-col items-center gap-2 rounded border p-3',
                            isSelected ? 'border-blue-500' : 'border-gray-200',
                          ].join(' ')}
                        >
                          <label className="flex w-full items-center gap-2 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={selectedDownloadKeys.has(variationKey)}
                              onChange={(event) => onToggleDownloadSelection(variationKey, event.target.checked)}
                            />
                            Export
                          </label>
                          <CreativeCanvas
                            imagePath={background.imagePath}
                            width={canvasWidth}
                            height={canvasHeight}
                            maxPreviewWidth={190}
                            globalStyles={variationLayout.globalStyles}
                            blocks={variationLayout.blocks}
                          />
                          <button
                            className="rounded-full border border-gray-300 px-4 py-2 text-sm"
                            onClick={() => onSelectVariation(background.id, group.role, item)}
                          >
                            {isSelected ? 'Selected' : 'Select'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="border-b border-gray-200" />
            </div>
          ))}
          <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
            <button
              className="self-start rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-50"
              disabled={downloadStatus === 'loading' || selectedDownloadKeys.size === 0}
              onClick={handleDownloadSelected}
            >
              {downloadStatus === 'loading'
                ? 'Preparing PNG…'
                : `Download selected PNG (${selectedDownloadKeys.size})`}
            </button>
            {downloadStatus === 'error' && <p className="text-sm text-red-500">{downloadError}</p>}
          </div>
          <div
            style={{
              position: 'fixed',
              left: -100000,
              top: 0,
              pointerEvents: 'none',
            }}
          >
            {backgrounds.flatMap((background) =>
              result.variations.flatMap((group) =>
                group.items.map((item) => {
                  const variationKey = getVariationKey(background.id, group.role, item.id)
                  const variationLayout = item.layout ?? applyVariationPatches(baseLayout, item, canvasWidth, canvasHeight)

                  return (
                    <div
                      key={variationKey}
                      ref={(node) => {
                        exportNodeRefs.current[variationKey] = node
                      }}
                    >
                      <CreativeCanvas
                        imagePath={background.imagePath}
                        width={canvasWidth}
                        height={canvasHeight}
                        maxPreviewWidth={canvasWidth}
                        frame={false}
                        globalStyles={variationLayout.globalStyles}
                        blocks={variationLayout.blocks}
                      />
                    </div>
                  )
                }),
              ),
            )}
          </div>
        </div>
      )}
    </section>
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
  maxPreviewWidth = PREVIEW_MAX_WIDTH,
  frame = true,
  onSelectBlock,
}: {
  imagePath: string
  width: number
  height: number
  globalStyles?: string
  blocks?: TextBlock[]
  editMode?: boolean
  selectedBlockId?: string
  maxPreviewWidth?: number
  frame?: boolean
  onSelectBlock?: (id: string) => void
}) {
  const scale = Math.min(maxPreviewWidth / width, 1)
  const previewWidth = Math.round(width * scale)
  const previewHeight = Math.round(height * scale)

  return (
    <div
      style={{ width: previewWidth, height: previewHeight }}
      className={frame ? 'overflow-hidden rounded border border-gray-200 bg-white shadow-sm' : 'overflow-hidden bg-white'}
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

async function postForm<T>(url: string, formData: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
  return data
}

function applyVariationPatches(
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

function materializeCopyVariations(
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

function getVariationKeys(result: CopyVariationsResult, backgroundId: string) {
  return result.variations.flatMap((group) =>
    group.items.map((item) => getVariationKey(backgroundId, group.role, item.id)),
  )
}

function getVariationKey(backgroundId: string, role: CopyRole, id: string) {
  return `${backgroundId}-${role}-${id}`
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function cloneLayout(layout: LayoutResult): LayoutResult {
  return {
    ...layout,
    blocks: layout.blocks.map((block) => ({
      ...block,
      spans: block.spans ? block.spans.map((span) => ({ ...span })) : null,
    })),
  }
}

function fitBlockText(block: TextBlock, canvasWidth: number, canvasHeight: number): TextBlock {
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

function getImageEditSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 1024, height: 1024 }
  }

  const aspectRatio = width / height
  let outputWidth = width
  let outputHeight = height

  if (aspectRatio > 3) {
    outputWidth = height * 3
  } else if (aspectRatio < 1 / 3) {
    outputHeight = width * 3
  }

  const maxPixels = 3840 * 2160
  if (outputWidth * outputHeight > maxPixels) {
    const scale = Math.sqrt(maxPixels / (outputWidth * outputHeight))
    outputWidth *= scale
    outputHeight *= scale
  }

  return {
    width: roundToMultiple(outputWidth, 16),
    height: roundToMultiple(outputHeight, 16),
  }
}

function roundToMultiple(value: number, multiple: number) {
  return Math.max(multiple, Math.round(value / multiple) * multiple)
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
