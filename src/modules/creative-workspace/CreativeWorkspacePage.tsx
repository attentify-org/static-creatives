'use client'

import { useState } from 'react'
import { CopyVariationsPanel } from './components/CopyVariationsPanel'
import { CreativeCanvas } from './components/CreativeCanvas'
import { EditorPanel } from './components/EditorPanel'
import { UploadCreativePanel } from './components/UploadCreativePanel'
import { VariationSettingsModal } from './components/VariationSettingsModal'
import type {
  BackgroundMode,
  BackgroundVariant,
  CopyRole,
  CopyVariation,
  CopyVariationsResult,
  HookVariationMode,
  LayoutResult,
  SelectedVariationKey,
  Step1Result,
  TextBlock,
  TextSpan,
} from './types'
import { postForm } from './utils/api'
import { getImageDimensions, getImageEditSize } from './utils/image'
import {
  applyVariationPatches,
  cloneLayout,
  getInlineSpans,
  getOriginalVariationKey,
  getVariationKey,
  getVariationKeys,
  materializeCopyVariations,
  mergeCopyVariationResults,
} from './utils/layout'
import { WATERMARK_TEXT } from './utils/watermark'

export function CreativeWorkspacePage() {
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
  const [backgroundPrompt, setBackgroundPrompt] = useState('')
  const [backgroundStatus, setBackgroundStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [backgroundError, setBackgroundError] = useState('')
  const [backgroundVariants, setBackgroundVariants] = useState<BackgroundVariant[]>([])
  const [editorBackgroundId, setEditorBackgroundId] = useState('original')

  async function handleBuildCreative() {
    const file = selectedFile
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
    setBackgroundPrompt('')
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

  function addWatermarkBlock() {
    if (!layoutResult || !step1Result) return

    const fontSize = Math.max(24, Math.round(step1Result.width * 0.045))
    const width = Math.min(Math.round(step1Result.width * 0.42), Math.max(220, fontSize * 5.8))
    const height = Math.max(Math.round(fontSize * 1.25), 42)
    const block: TextBlock = {
      id: `watermark-${Date.now()}`,
      role: 'logo',
      text: WATERMARK_TEXT,
      spans: null,
      x: Math.round((step1Result.width - width) / 2),
      y: Math.round((step1Result.height - height) / 2),
      width,
      height,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize,
      lineHeight: height,
      fontWeight: 700,
      letterSpacing: 0,
      color: '#ffffff',
      align: 'center',
      textTransform: 'none',
      zIndex: Math.max(1, ...layoutResult.blocks.map((item) => item.zIndex + 1)),
      otherStyles: 'opacity: 0.5;',
    }

    setLayoutResult({
      ...layoutResult,
      blocks: [...layoutResult.blocks, block],
    })
    setSelectedBlockId(block.id)
    setSelectedSpanIndex(0)
    setEditMode(true)
  }

  async function handleGenerateCopyVariations() {
    if (!layoutResult) return
    const layoutForVariations = cloneLayout(layoutResult)

    commitCurrentEditorEdits()
    setBaseCreativeLayout(layoutForVariations)
    setCopyStatus('loading')
    setCopyError('')

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
      const mergedResult = mergeCopyVariationResults(copyResult, materializedResult)
      setCopyResult(mergedResult)
      setSelectedDownloadKeys((current) => {
        const next = new Set(current)
        backgrounds.forEach((background) => {
          next.add(getOriginalVariationKey(background.id))
          const existingKeys = copyResult ? new Set(getVariationKeys(copyResult, background.id)) : new Set<string>()
          getVariationKeys(mergedResult, background.id).forEach((key) => {
            if (!existingKeys.has(key)) next.add(key)
          })
        })
        return next
      })
      setSelectedVariationKey(null)
      setCopyStatus('done')
      setVariationModalOpen(null)
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Unknown error')
      setCopyStatus('error')
    }
  }

  async function handleGenerateBackgroundVariant() {
    const file = selectedFile
    if (!file || !step1Result) return

    setBackgroundStatus('loading')
    setBackgroundError('')

    const formData = new FormData()
    formData.append('sourceImage', file)
    formData.append('cleanImagePath', step1Result.imagePath)
    formData.append('width', String(step1Result.width))
    formData.append('height', String(step1Result.height))
    formData.append('mode', backgroundMode)
    formData.append('userPrompt', backgroundPrompt)

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

  function deleteCopyVariation(role: CopyRole, variationId: string) {
    setCopyResult((current) => {
      if (!current) return current

      return {
        ...current,
        variations: current.variations.map((group) =>
          group.role === role
            ? {
                ...group,
                items: group.items.filter((item) => item.id !== variationId),
              }
            : group,
        ),
      }
    })

    setSelectedDownloadKeys((current) => {
      const next = new Set(current)
      backgrounds.forEach((background) => {
        next.delete(getVariationKey(background.id, role, variationId))
      })
      return next
    })

    if (selectedVariationKey?.role === role && selectedVariationKey.id === variationId) {
      setSelectedVariationKey(null)
      const sourceLayout = baseCreativeLayout ?? layoutResult
      if (sourceLayout) {
        const nextLayout = cloneLayout(sourceLayout)
        setLayoutResult(nextLayout)
        setSelectedBlockId(nextLayout.blocks[0]?.id ?? '')
        setSelectedSpanIndex(0)
      }
    }
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

  function moveBlock(blockId: string, x: number, y: number) {
    setLayoutResult((current) => {
      if (!current) return current

      return {
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId ? { ...block, x, y } : block,
        ),
      }
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
        <UploadCreativePanel
          selectedFile={selectedFile}
          isBuilding={isBuilding}
          canOpenWorkspace={canOpenWorkspace}
          error={step1Error || layoutError}
          onSelectFile={setSelectedFile}
          onBuildCreative={handleBuildCreative}
          onOpenWorkspace={() => setActiveTab('workspace')}
        />
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
                  onMoveBlock={moveBlock}
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
              onAddWatermark={addWatermarkBlock}
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
            onDeleteVariation={deleteCopyVariation}
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
          backgroundPrompt={backgroundPrompt}
          copyStatus={copyStatus}
          backgroundStatus={backgroundStatus}
          copyError={copyError}
          backgroundError={backgroundError}
          onClose={() => setVariationModalOpen(null)}
          onChangeCounts={setCopyCounts}
          onChangeHookMode={setHookVariationMode}
          onChangeCopyPrompt={setCopyPrompt}
          onChangeBackgroundMode={setBackgroundMode}
          onChangeBackgroundPrompt={setBackgroundPrompt}
          onGenerateCopy={handleGenerateCopyVariations}
          onGenerateBackground={handleGenerateBackgroundVariant}
        />
      )}
    </main>
  )
}
