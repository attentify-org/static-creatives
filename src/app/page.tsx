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
  const [activeTab, setActiveTab] = useState<'upload' | 'workspace'>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [variationModalOpen, setVariationModalOpen] = useState<'text' | 'visual' | null>(null)
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
  const [copyPrompt, setCopyPrompt] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [copyResult, setCopyResult] = useState<CopyVariationsResult | null>(null)
  const [baseCreativeLayout, setBaseCreativeLayout] = useState<LayoutResult | null>(null)
  const [copyError, setCopyError] = useState('')
  const [selectedVariationKey, setSelectedVariationKey] = useState<SelectedVariationKey>(null)
  const [selectedDownloadKeys, setSelectedDownloadKeys] = useState<Set<string>>(new Set())
  const [backgroundMode, setBackgroundMode] = useState<Exclude<BackgroundMode, 'original'>>('medium')
  const [backgroundStatus, setBackgroundStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [backgroundError, setBackgroundError] = useState('')
  const [backgroundVariants, setBackgroundVariants] = useState<BackgroundVariant[]>([])
  const [editorBackgroundId, setEditorBackgroundId] = useState('original')

  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null)
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) {
      setSelectedFile(file)
    }
  }

  async function handleBuildCreative(e: React.FormEvent) {
    e.preventDefault()
    const file = selectedFile ?? fileRef.current?.files?.[0]
    if (!file) return

    setActiveTab('upload')
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
    setCopyPrompt('')
    setBaseCreativeLayout(null)
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
      setBaseCreativeLayout(cloneLayout(layoutData))
      setSelectedBlockId(layoutData.blocks?.[0]?.id ?? '')
      setSelectedSpanIndex(0)
      setStep1Status('done')
      setLayoutStatus('done')
      setSelectedDownloadKeys(new Set([getOriginalVariationKey('original')]))
      setActiveTab('workspace')
      setEditMode(true)
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

    commitCurrentEditorEdits()
    setBaseCreativeLayout(layoutForVariations)
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
          userPrompt: copyPrompt,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      const materializedResult = materializeCopyVariations(data, layoutForVariations, step1Result?.width, step1Result?.height)
      setCopyResult(materializedResult)
      setSelectedDownloadKeys(new Set([getOriginalVariationKey('original'), ...getVariationKeys(materializedResult, 'original')]))
      setSelectedVariationKey(null)
      setCopyStatus('done')
      setVariationModalOpen(null)
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Unknown error')
      setCopyStatus('error')
    }
  }

  async function handleGenerateBackgroundVariant() {
    const file = selectedFile ?? fileRef.current?.files?.[0]
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
        const nextKeys = [getOriginalVariationKey(numberedBackground.id)]
        if (copyResult) nextKeys.push(...getVariationKeys(copyResult, numberedBackground.id))
        return new Set([...current, ...nextKeys])
      })
      setBackgroundStatus('done')
      setVariationModalOpen(null)
    } catch (err) {
      setBackgroundError(err instanceof Error ? err.message : 'Unknown error')
      setBackgroundStatus('error')
    }
  }

  function selectCopyVariation(backgroundId: string, role: CopyRole, variation: CopyVariation) {
    if (!layoutResult) return

    commitCurrentEditorEdits()

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

  function selectOriginalCreative(backgroundId: string) {
    const sourceLayout = baseCreativeLayout ?? layoutResult
    if (!sourceLayout) return

    commitCurrentEditorEdits()
    const nextLayout = cloneLayout(sourceLayout)
    setLayoutResult(nextLayout)
    setSelectedBlockId(nextLayout.blocks[0]?.id ?? '')
    setSelectedSpanIndex(0)
    setEditorBackgroundId(backgroundId)
    setSelectedVariationKey(null)
    setEditMode(true)
  }

  function toggleEditMode() {
    if (editMode) {
      commitCurrentEditorEdits()
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

  function commitCurrentEditorEdits() {
    if (!layoutResult) return

    if (selectedVariationKey) {
      commitSelectedVariationEdits()
      return
    }

    setBaseCreativeLayout(cloneLayout(layoutResult))
  }

  function nudgeSelectedBlock(dx: number, dy: number) {
    const block = layoutResult?.blocks.find((item) => item.id === selectedBlockId)
    if (!block) return
    updateSelectedBlock({ x: block.x + dx, y: block.y + dy })
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
  const canOpenWorkspace = step1Status === 'done' && layoutStatus === 'done' && Boolean(step1Result && layoutResult)
  const isBuilding = step1Status === 'loading' || layoutStatus === 'loading'

  return (
    <main className="min-h-screen bg-[#f7f4fb] text-[#17121f]">
      <header className="sticky top-0 z-30 border-b border-[#e6deee] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#7c3aed] text-sm font-black text-white">
              C
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">Creatives App</h1>
              <p className="text-xs text-[#8a8294]">Editable AI creative workspace</p>
            </div>
          </div>

          <nav className="flex rounded-full border border-[#e4ddeb] bg-[#f8f5fb] p-1 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={[
                'rounded-full px-4 py-2 transition',
                activeTab === 'upload' ? 'bg-white text-[#5b21b6] shadow-sm' : 'text-[#756c81]',
              ].join(' ')}
            >
              Upload
            </button>
            <button
              type="button"
              disabled={!canOpenWorkspace}
              onClick={() => setActiveTab('workspace')}
              className={[
                'rounded-full px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-40',
                activeTab === 'workspace' ? 'bg-white text-[#5b21b6] shadow-sm' : 'text-[#756c81]',
              ].join(' ')}
            >
              Workspace
            </button>
          </nav>
        </div>
      </header>

      {activeTab === 'upload' && (
        <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl place-items-center px-5 py-10">
          <form
            onSubmit={handleBuildCreative}
            className="w-full max-w-2xl rounded-2xl border border-[#e5ddec] bg-white p-6 shadow-[0_24px_80px_rgba(35,20,55,0.08)]"
          >
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">Upload creative</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Analyze a static ad creative</h2>
              <p className="mt-2 text-sm leading-6 text-[#766d81]">
                Upload an image, then the app will remove text and extract an editable text layout in parallel.
              </p>
            </div>

            <input
              id="creative-upload"
              ref={fileRef}
              type="file"
              accept="image/*"
              required={!selectedFile}
              onChange={handleFileInputChange}
              className="sr-only"
            />
            <label
              htmlFor="creative-upload"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#c8b9df] bg-[#fbf9fe] px-5 text-center transition hover:border-[#8b5cf6] hover:bg-[#f6f0ff]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#ede7f8] text-xl text-[#6d28d9]">
                +
              </span>
              <span className="mt-4 text-sm font-semibold">
                {selectedFile ? selectedFile.name : 'Choose image or drop it here'}
              </span>
              <span className="mt-1 text-xs text-[#8f8799]">PNG, JPG, WebP creative screenshot</span>
            </label>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="submit"
                disabled={isBuilding || !selectedFile}
                className="rounded-xl bg-[#7c3aed] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.28)] transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBuilding ? 'Analyzing creative...' : 'Analyze creative'}
              </button>
              {canOpenWorkspace && (
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace')}
                  className="rounded-xl border border-[#ddd4e8] px-5 py-3 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff]"
                >
                  Open workspace
                </button>
              )}
            </div>

            {isBuilding && <AnalyzeCreativeLoader />}

            {(step1Status === 'error' || layoutStatus === 'error') && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{step1Error || layoutError}</p>
            )}
          </form>
        </section>
      )}

      {activeTab === 'workspace' && step1Result && layoutResult && editorBackground && (
        <section className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 rounded-2xl border border-[#e5ddec] bg-white p-4 shadow-[0_24px_80px_rgba(35,20,55,0.08)]">
              <div className="mb-4 flex flex-col gap-3 border-b border-[#eee8f4] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">Workspace</p>
                  <h2 className="mt-1 text-lg font-semibold">Current creative</h2>
                  <p className="text-xs text-[#8a8294]">{layoutResult.blocks.length} text blocks · {editorBackground.label}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleEditMode}
                    className="rounded-xl border border-[#ddd4e8] px-4 py-2 text-sm font-semibold text-[#4c3b63] transition hover:bg-[#f8f4ff]"
                  >
                    {editMode ? 'Done editing' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariationModalOpen('text')}
                    className="rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)] transition hover:bg-[#6d28d9]"
                  >
                    Generate text variations
                  </button>
                  <button
                    type="button"
                    onClick={() => setVariationModalOpen('visual')}
                    className="rounded-xl border border-[#cfc2df] bg-white px-4 py-2 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff]"
                  >
                    Generate visual variations
                  </button>
                </div>
              </div>

              <div className="flex min-h-[620px] items-start justify-center overflow-auto rounded-xl bg-[#f3eff8] p-6">
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
              onDeleteBlock={deleteSelectedBlock}
            />
          </div>

          <CopyVariationsPanel
            backgrounds={backgrounds}
            canvasWidth={step1Result.width}
            canvasHeight={step1Result.height}
            baseLayout={baseCreativeLayout ?? layoutResult}
            status={copyStatus}
            result={copyResult}
            error={copyError}
            onSelectOriginal={selectOriginalCreative}
            onSelectVariation={selectCopyVariation}
            selectedBackgroundId={editorBackground.id}
            selectedVariationKey={selectedVariationKey}
            selectedDownloadKeys={selectedDownloadKeys}
            onToggleDownloadSelection={toggleDownloadSelection}
          />
        </section>
      )}

      {variationModalOpen && (
        <VariationSettingsModal
          mode={variationModalOpen}
          counts={copyCounts}
          hookMode={hookVariationMode}
          copyPrompt={copyPrompt}
          backgroundMode={backgroundMode}
          copyStatus={copyStatus}
          backgroundStatus={backgroundStatus}
          copyError={copyError}
          backgroundError={backgroundError}
          onClose={() => setVariationModalOpen(null)}
          onChangeCounts={setCopyCounts}
          onChangeHookMode={setHookVariationMode}
          onChangeCopyPrompt={setCopyPrompt}
          onChangeBackgroundMode={setBackgroundMode}
          onGenerateCopy={handleGenerateCopyVariations}
          onGenerateBackground={handleGenerateBackgroundVariant}
        />
      )}
    </main>
  )
}

function CopyVariationsPanel({
  backgrounds,
  canvasWidth,
  canvasHeight,
  baseLayout,
  status,
  result,
  error,
  onSelectOriginal,
  onSelectVariation,
  selectedBackgroundId,
  selectedVariationKey,
  selectedDownloadKeys,
  onToggleDownloadSelection,
}: {
  backgrounds: BackgroundVariant[]
  canvasWidth: number
  canvasHeight: number
  baseLayout: LayoutResult
  status: 'idle' | 'loading' | 'done' | 'error'
  result: CopyVariationsResult | null
  error: string
  onSelectOriginal: (backgroundId: string) => void
  onSelectVariation: (backgroundId: string, role: CopyRole, variation: CopyVariation) => void
  selectedBackgroundId: string
  selectedVariationKey: SelectedVariationKey
  selectedDownloadKeys: Set<string>
  onToggleDownloadSelection: (key: string, selected: boolean) => void
}) {
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [downloadError, setDownloadError] = useState('')
  const exportNodeRefs = useRef<Record<string, HTMLDivElement | null>>({})

  async function handleDownloadSelected() {
    if (selectedDownloadKeys.size === 0) return

    setDownloadStatus('loading')
    setDownloadError('')

    try {
      await document.fonts?.ready
      const selectedItems = getExportItems(backgrounds, result, baseLayout, canvasWidth, canvasHeight).filter((item) =>
        selectedDownloadKeys.has(item.key),
      )

      if (selectedItems.length === 1) {
        const [{ key }] = selectedItems
        const node = exportNodeRefs.current[key]
        if (!node) throw new Error('Selected variation is not ready for export')
        const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 1, backgroundColor: '#ffffff' })
        downloadDataUrl(dataUrl, `${safeFilename(key)}.png`)
        setDownloadStatus('idle')
        return
      }

      const zip = new JSZip()

      for (const { key } of selectedItems) {
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
    <section className="rounded-2xl border border-[#e5ddec] bg-white p-5 shadow-[0_24px_80px_rgba(35,20,55,0.08)]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">Creative set</p>
          <h2 className="mt-1 text-lg font-semibold">Original and generated variations</h2>
        </div>
        <button
          className="rounded-xl bg-[#7c3aed] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)] transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={downloadStatus === 'loading' || selectedDownloadKeys.size === 0}
          onClick={handleDownloadSelected}
        >
          {downloadStatus === 'loading'
            ? 'Preparing PNG...'
            : `Download selected PNG (${selectedDownloadKeys.size})`}
        </button>
      </div>

      {status === 'error' && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {downloadStatus === 'error' && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{downloadError}</p>}

      <div className="flex flex-col gap-8">
        {backgrounds.map((background) => {
          const originalKey = getOriginalVariationKey(background.id)

          return (
            <div key={background.id} className="flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-[#eee8f4] pb-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#756c81]">{background.label}</h3>
                <span className="rounded-full bg-[#f2edf8] px-3 py-1 text-xs font-medium text-[#6d28d9]">{background.mode}</span>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a8294]">Original creative</h4>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <VariationCard
                    title="Original creative"
                    subtitle="Edited base layout"
                    exportKey={originalKey}
                    checked={selectedDownloadKeys.has(originalKey)}
                    selected={!selectedVariationKey && selectedBackgroundId === background.id}
                    onToggleExport={(checked) => onToggleDownloadSelection(originalKey, checked)}
                    onSelect={() => onSelectOriginal(background.id)}
                  >
                    <CreativeCanvas
                      imagePath={background.imagePath}
                      width={canvasWidth}
                      height={canvasHeight}
                      maxPreviewWidth={190}
                      globalStyles={baseLayout.globalStyles}
                      blocks={baseLayout.blocks}
                    />
                  </VariationCard>
                </div>
              </div>

              {result ? (
                result.variations.map((group) => (
                  <div key={`${background.id}-${group.role}`} className="flex flex-col gap-3">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a8294]">{group.role}</h4>
                    {group.reason && <p className="text-sm text-[#8a8294]">{group.reason}</p>}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {group.items.map((item) => {
                        const variationLayout = item.layout ?? applyVariationPatches(baseLayout, item, canvasWidth, canvasHeight)
                        const isSelected =
                          selectedVariationKey?.backgroundId === background.id &&
                          selectedVariationKey.role === group.role &&
                          selectedVariationKey.id === item.id
                        const variationKey = getVariationKey(background.id, group.role, item.id)

                        return (
                          <VariationCard
                            key={variationKey}
                            title={`${group.role} ${item.id.split('-').at(-1) ?? ''}`.trim()}
                            subtitle={item.patches.map((patch) => patch.blockId).join(', ')}
                            exportKey={variationKey}
                            checked={selectedDownloadKeys.has(variationKey)}
                            selected={isSelected}
                            onToggleExport={(checked) => onToggleDownloadSelection(variationKey, checked)}
                            onSelect={() => onSelectVariation(background.id, group.role, item)}
                          >
                            <CreativeCanvas
                              imagePath={background.imagePath}
                              width={canvasWidth}
                              height={canvasHeight}
                              maxPreviewWidth={190}
                              globalStyles={variationLayout.globalStyles}
                              blocks={variationLayout.blocks}
                            />
                          </VariationCard>
                        )
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[#d9cfe7] bg-[#fbf9fe] p-5 text-sm text-[#756c81]">
                  Generate copy or background variants to fill this section.
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        style={{
          position: 'fixed',
          left: -100000,
          top: 0,
          pointerEvents: 'none',
        }}
      >
        {getExportItems(backgrounds, result, baseLayout, canvasWidth, canvasHeight).map((item) => (
          <div
            key={item.key}
            ref={(node) => {
              exportNodeRefs.current[item.key] = node
            }}
          >
            <CreativeCanvas
              imagePath={item.background.imagePath}
              width={canvasWidth}
              height={canvasHeight}
              maxPreviewWidth={canvasWidth}
              frame={false}
              globalStyles={item.layout.globalStyles}
              blocks={item.layout.blocks}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function VariationSettingsModal({
  mode,
  counts,
  hookMode,
  copyPrompt,
  backgroundMode,
  copyStatus,
  backgroundStatus,
  copyError,
  backgroundError,
  onClose,
  onChangeCounts,
  onChangeHookMode,
  onChangeCopyPrompt,
  onChangeBackgroundMode,
  onGenerateCopy,
  onGenerateBackground,
}: {
  mode: 'text' | 'visual'
  counts: Record<CopyRole, number>
  hookMode: HookVariationMode
  copyPrompt: string
  backgroundMode: Exclude<BackgroundMode, 'original'>
  copyStatus: 'idle' | 'loading' | 'done' | 'error'
  backgroundStatus: 'idle' | 'loading' | 'done' | 'error'
  copyError: string
  backgroundError: string
  onClose: () => void
  onChangeCounts: (counts: Record<CopyRole, number>) => void
  onChangeHookMode: (mode: HookVariationMode) => void
  onChangeCopyPrompt: (prompt: string) => void
  onChangeBackgroundMode: (mode: Exclude<BackgroundMode, 'original'>) => void
  onGenerateCopy: () => void
  onGenerateBackground: () => void
}) {
  const totalCount = counts.hook + counts.cta + counts.body

  function updateCount(role: CopyRole, value: number) {
    onChangeCounts({
      ...counts,
      [role]: Math.max(0, Math.min(10, Math.floor(value || 0))),
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1f1730]/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-[#e6deee] bg-white p-5 shadow-[0_30px_100px_rgba(21,10,36,0.28)]">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-[#eee8f4] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">
              {mode === 'text' ? 'Text generation' : 'Visual generation'}
            </p>
            <h2 className="mt-1 text-xl font-semibold">
              {mode === 'text' ? 'Create text variations' : 'Create background variants'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[#e0d7ea] text-lg text-[#756c81] transition hover:bg-[#f7f4fb]"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className={mode === 'text' ? 'grid gap-5' : 'grid gap-5'}>
          {mode === 'text' && (
          <div className="rounded-xl border border-[#eee8f4] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#756c81]">Copy variations</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <NumberField label="Hook" value={counts.hook} onChange={(value) => updateCount('hook', value)} />
              <NumberField label="CTA" value={counts.cta} onChange={(value) => updateCount('cta', value)} />
              <NumberField label="Body" value={counts.body} onChange={(value) => updateCount('body', value)} />
            </div>

            <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
              Hook mode
              <select
                value={hookMode}
                onChange={(event) => onChangeHookMode(event.target.value as HookVariationMode)}
                className="h-11 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
              >
                <option value="light">Light variation</option>
                <option value="medium">Medium variation</option>
                <option value="strong">Strong variation</option>
              </select>
            </label>

            <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
              Generation prompt
              <textarea
                value={copyPrompt}
                onChange={(event) => onChangeCopyPrompt(event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="e.g. focus hooks on time savings, keep tone direct, avoid hype"
                className="resize-y rounded-lg border border-[#ddd4e8] p-3 text-sm font-medium normal-case leading-6 tracking-normal text-[#17121f] outline-none transition placeholder:text-[#aaa2b4] focus:border-[#8b5cf6]"
              />
            </label>

            <button
              type="button"
              disabled={copyStatus === 'loading' || totalCount === 0}
              onClick={onGenerateCopy}
              className="mt-4 w-full rounded-xl bg-[#7c3aed] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)] transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copyStatus === 'loading' ? 'Generating copy...' : 'Generate copy variations'}
            </button>
            {copyStatus === 'error' && <p className="mt-3 text-sm text-red-600">{copyError}</p>}
          </div>
          )}

          {mode === 'visual' && (
          <div className="rounded-xl border border-[#eee8f4] p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#756c81]">Background</h3>
            <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
              Mode
              <select
                value={backgroundMode}
                onChange={(event) => onChangeBackgroundMode(event.target.value as Exclude<BackgroundMode, 'original'>)}
                className="h-11 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
              >
                <option value="light">Light background</option>
                <option value="medium">Medium background</option>
                <option value="strong">Strong background</option>
              </select>
            </label>
            <button
              type="button"
              disabled={backgroundStatus === 'loading'}
              onClick={onGenerateBackground}
              className="mt-4 w-full rounded-xl border border-[#cfc2df] px-5 py-3 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {backgroundStatus === 'loading' ? 'Generating...' : 'Generate background'}
            </button>
            {backgroundStatus === 'error' && <p className="mt-3 text-sm text-red-600">{backgroundError}</p>}
          </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AnalyzeCreativeLoader() {
  const steps = [
    'Removing original text from the image',
    'Rebuilding clean background',
    'Detecting text blocks and roles',
    'Laying the creative into editable layers',
  ]

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-[#e6deee] bg-[#fbf9fe] p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-[#f1ebfa] sm:w-36">
          <div className="absolute left-8 top-7 h-16 w-20 animate-[layerFloat_2.8s_ease-in-out_infinite] rounded-lg border border-[#c4b5fd] bg-white/80 shadow-lg" />
          <div className="absolute left-12 top-10 h-16 w-20 animate-[layerFloat_2.8s_ease-in-out_infinite_0.18s] rounded-lg border border-[#a78bfa] bg-white/70 shadow-lg" />
          <div className="absolute left-16 top-5 h-16 w-20 animate-[layerFloat_2.8s_ease-in-out_infinite_0.36s] rounded-lg border border-[#8b5cf6] bg-white/90 shadow-lg" />
          <div className="absolute left-6 top-20 h-1 w-24 animate-pulse rounded-full bg-[#7c3aed]/30" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">Analyzing</p>
            <p className="text-xs font-medium text-[#8a8294]">~1-2 min</p>
          </div>
          <h3 className="mt-2 text-lg font-semibold">Раскладываю креатив на слои</h3>
          <p className="mt-1 text-sm leading-6 text-[#756c81]">
            Отделяю фон от текста и собираю редактируемую структуру блоков.
          </p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e8e1f1]">
            <div className="h-full w-1/2 animate-[progressSweep_1.8s_ease-in-out_infinite] rounded-full bg-[#7c3aed]" />
          </div>

          <div className="mt-4 grid gap-2 text-sm text-[#685f73] sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function VariationCard({
  title,
  subtitle,
  exportKey,
  checked,
  selected,
  children,
  onToggleExport,
  onSelect,
}: {
  title: string
  subtitle: string
  exportKey: string
  checked: boolean
  selected: boolean
  children: React.ReactNode
  onToggleExport: (checked: boolean) => void
  onSelect: () => void
}) {
  return (
    <div
      className={[
        'flex flex-col gap-3 rounded-xl border bg-[#fbf9fe] p-3 transition',
        selected ? 'border-[#7c3aed] shadow-[0_12px_34px_rgba(124,58,237,0.16)]' : 'border-[#e5ddec]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-[#8a8294]">{subtitle}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[#756c81]">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onToggleExport(event.target.checked)}
            className="h-4 w-4 accent-[#7c3aed]"
          />
          Export
        </label>
      </div>
      <div className="flex justify-center">{children}</div>
      <button
        type="button"
        className={[
          'rounded-lg px-4 py-2 text-sm font-semibold transition',
          selected ? 'bg-[#7c3aed] text-white' : 'border border-[#ddd4e8] bg-white text-[#5b21b6] hover:bg-[#f6f0ff]',
        ].join(' ')}
        onClick={onSelect}
      >
        {selected ? 'Selected' : 'Select'}
      </button>
      <span className="sr-only">{exportKey}</span>
    </div>
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
      className={frame ? 'overflow-hidden rounded-lg border border-[#e3dbea] bg-white shadow-sm' : 'overflow-hidden bg-white'}
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
              editMode && selectedBlockId === block.id ? 'outline outline-2 outline-[#7c3aed]' : '',
              editMode && selectedBlockId !== block.id ? 'outline outline-1 outline-[#a78bfa]/70' : '',
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
  onDeleteBlock: () => void
}) {
  const spans = selectedBlock ? getInlineSpans(selectedBlock) : []
  const selectedBlockIndex = Math.max(0, blocks.findIndex((block) => block.id === selectedBlockId))

  return (
    <aside className="h-fit rounded-2xl border border-[#e5ddec] bg-white shadow-[0_24px_80px_rgba(35,20,55,0.08)] lg:sticky lg:top-20">
      <div className="border-b border-[#eee8f4] p-4">
        <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
          Block
        <select
          value={selectedBlockId}
          onChange={(event) => onSelectBlock(event.target.value)}
            className="h-10 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
        >
          {blocks.map((block) => (
            <option key={block.id} value={block.id}>
              {block.id} ({block.role})
            </option>
          ))}
        </select>
      </label>
        <div className="mt-2 flex items-center gap-2 text-xs text-[#9a91a5]">
          {selectedBlock && <span className="rounded bg-[#eee8f4] px-2 py-1 font-semibold uppercase text-[#6a6075]">{selectedBlock.role}</span>}
          <span>Block {blocks.length ? selectedBlockIndex + 1 : 0} / {blocks.length}</span>
        </div>
        <button
          type="button"
          disabled={!editMode || !selectedBlock}
          className="mt-3 w-full rounded-lg border border-[#ddd4e8] bg-white p-2 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => {
            if (!selectedBlock) return
            onUpdateBlock({
              x: Math.round((canvasWidth - selectedBlock.width) / 2),
              align: 'center',
            })
          }}
        >
          Center horizontally
        </button>
      </div>

      {!editMode && (
        <p className="p-4 text-sm text-[#8a8294]">Click Edit to adjust text and position.</p>
      )}

      {editMode && selectedBlock && (
        <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
          <EditorSection title="Text">
            <label className="flex flex-col gap-2">
            <textarea
              value={selectedBlock.text}
              onChange={(event) => onUpdateBlock({ text: event.target.value })}
                rows={5}
                className="resize-y rounded-lg border border-[#ddd4e8] p-3 text-sm leading-6 text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
            />
          </label>

          {spans.length > 0 && (
              <div className="mt-4 rounded-xl border border-[#eee8f4] bg-[#fbf9fe] p-3">
                <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
              Inline span
              <select
                value={selectedSpanIndex}
                onChange={(event) => onSelectSpan(Number(event.target.value))}
                    className="h-10 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
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
                    <label className="mt-3 flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
                  Span text
                  <input
                    value={selectedSpan.text}
                    onChange={(event) => onUpdateSpan({ text: event.target.value })}
                        className="h-10 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
                  />
                </label>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                  <NumberField label="Span size" value={selectedSpan.fontSize} onChange={(fontSize) => onUpdateSpan({ fontSize })} />
                  <NumberField label="Span weight" value={selectedSpan.fontWeight} step={100} onChange={(fontWeight) => onUpdateSpan({ fontWeight })} />
                  <NumberField label="Span tracking" value={selectedSpan.letterSpacing} step={0.1} onChange={(letterSpacing) => onUpdateSpan({ letterSpacing })} />
                      <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
                    Span color
                    <input
                      value={selectedSpan.color}
                      onChange={(event) => onUpdateSpan({ color: event.target.value })}
                          className="h-10 min-w-0 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
                    />
                  </label>
                </div>
              </>
            )}
          </div>
          )}
          </EditorSection>

          <EditorSection title="Typography">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Font size" value={selectedBlock.fontSize} onChange={(fontSize) => onUpdateBlock({ fontSize })} />
              <NumberField label="Line height" value={selectedBlock.lineHeight} onChange={(lineHeight) => onUpdateBlock({ lineHeight })} />
              <NumberField label="Weight" value={selectedBlock.fontWeight} step={100} onChange={(fontWeight) => onUpdateBlock({ fontWeight })} />
              <NumberField label="Tracking" value={selectedBlock.letterSpacing} step={0.1} onChange={(letterSpacing) => onUpdateBlock({ letterSpacing })} />
            </div>

            <label className="mt-3 flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
              Color
              <input
                value={selectedBlock.color}
                onChange={(event) => onUpdateBlock({ color: event.target.value })}
                className="h-10 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
              />
            </label>

            <label className="mt-3 flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
              Other styles
              <textarea
                value={selectedBlock.otherStyles ?? ''}
                onChange={(event) => onUpdateBlock({ otherStyles: event.target.value })}
                rows={3}
                placeholder="e.g. text-shadow: 0 2px 4px rgba(0,0,0,.25);"
                className="resize-y rounded-lg border border-[#ddd4e8] p-3 text-sm leading-5 text-[#17121f] outline-none transition placeholder:text-[#aaa2b4] focus:border-[#8b5cf6]"
              />
            </label>
          </EditorSection>

          <EditorSection title="Position & size">
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="X" value={selectedBlock.x} onChange={(x) => onUpdateBlock({ x })} />
              <NumberField label="Y" value={selectedBlock.y} onChange={(y) => onUpdateBlock({ y })} />
              <NumberField label="Width" value={selectedBlock.width} onChange={(width) => onUpdateBlock({ width })} />
              <NumberField label="Height" value={selectedBlock.height} onChange={(height) => onUpdateBlock({ height })} />
            </div>
          </EditorSection>

          <EditorSection title="Nudge & align">
            <div className="grid grid-cols-3 gap-2">
              <button className="rounded-lg border border-[#ddd4e8] bg-white p-2 text-sm font-medium transition hover:bg-[#f6f0ff]" onClick={() => onNudgeBlock(0, -10)}>↑ 10</button>
              <button className="rounded-lg border border-[#ddd4e8] bg-white p-2 text-sm font-medium transition hover:bg-[#f6f0ff]" onClick={() => onNudgeBlock(0, -1)}>↑ 1</button>
              <button className="rounded-lg border border-[#ddd4e8] bg-white p-2 text-sm font-medium transition hover:bg-[#f6f0ff]" onClick={() => onNudgeBlock(0, 1)}>↓ 1</button>
              <button className="rounded-lg border border-[#ddd4e8] bg-white p-2 text-sm font-medium transition hover:bg-[#f6f0ff]" onClick={() => onNudgeBlock(-10, 0)}>← 10</button>
              <button className="rounded-lg border border-[#ddd4e8] bg-white p-2 text-sm font-medium transition hover:bg-[#f6f0ff]" onClick={() => onNudgeBlock(10, 0)}>→ 10</button>
              <button className="rounded-lg border border-[#ddd4e8] bg-white p-2 text-sm font-medium transition hover:bg-[#f6f0ff]" onClick={() => onNudgeBlock(0, 10)}>↓ 10</button>
          </div>

          </EditorSection>

          <div className="p-4">
          <button
              className="w-full rounded-xl bg-[#ef4444] p-3 text-sm font-semibold text-white transition hover:bg-[#dc2626]"
            onClick={onDeleteBlock}
          >
            Delete block
          </button>
          </div>
        </div>
      )}
    </aside>
  )
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[#eee8f4] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#756c81]">{title}</h3>
        <span className="text-[#aaa2b4]">⌄</span>
      </div>
      {children}
    </section>
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
  function formatValue(nextValue: number) {
    return Number.isInteger(nextValue) ? String(nextValue) : String(Number(nextValue.toFixed(2)))
  }

  function increment(delta: number) {
    onChange(Number(formatValue(value + delta)))
  }

  return (
    <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
      {label}
      <div className="grid h-10 grid-cols-[30px_1fr_30px] overflow-hidden rounded-lg border border-[#ddd4e8] bg-white">
        <button
          type="button"
          onClick={() => increment(-step)}
          className="border-r border-[#eee8f4] text-sm font-semibold text-[#8a8294] transition hover:bg-[#f6f0ff]"
        >
          -
        </button>
        <input
          type="number"
          value={formatValue(value)}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 border-0 bg-white px-2 text-center text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none"
        />
        <button
          type="button"
          onClick={() => increment(step)}
          className="border-l border-[#eee8f4] text-sm font-semibold text-[#8a8294] transition hover:bg-[#f6f0ff]"
        >
          +
        </button>
      </div>
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

function getOriginalVariationKey(backgroundId: string) {
  return `${backgroundId}-original`
}

function getExportItems(
  backgrounds: BackgroundVariant[],
  result: CopyVariationsResult | null,
  baseLayout: LayoutResult,
  canvasWidth: number,
  canvasHeight: number,
) {
  return backgrounds.flatMap((background) => {
    const originalItem = {
      key: getOriginalVariationKey(background.id),
      background,
      layout: baseLayout,
    }

    const variationItems = result
      ? result.variations.flatMap((group) =>
          group.items.map((item) => ({
            key: getVariationKey(background.id, group.role, item.id),
            background,
            layout: item.layout ?? applyVariationPatches(baseLayout, item, canvasWidth, canvasHeight),
          })),
        )
      : []

    return [originalItem, ...variationItems]
  })
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
