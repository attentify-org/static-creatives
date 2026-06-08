'use client'

import { useRef, useState, type ReactNode } from 'react'
import { toPng } from 'html-to-image'
import JSZip from 'jszip'
import type {
  BackgroundVariant,
  CopyRole,
  CopyVariation,
  CopyVariationsResult,
  LayoutResult,
  SelectedVariationKey,
} from '../types'
import {
  applyVariationPatches,
  getExportItems,
  getOriginalVariationKey,
  getVariationKey,
} from '../utils/layout'
import { downloadBlob, downloadDataUrl, safeFilename } from '../utils/dom-export'
import { CreativeCanvas } from './CreativeCanvas'

export function CopyVariationsPanel({
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
  onDeleteVariation,
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
  onDeleteVariation: (role: CopyRole, variationId: string) => void
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
                            onDelete={() => onDeleteVariation(group.role, item.id)}
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

function VariationCard({
  title,
  subtitle,
  exportKey,
  checked,
  selected,
  children,
  onToggleExport,
  onSelect,
  onDelete,
}: {
  title: string
  subtitle: string
  exportKey: string
  checked: boolean
  selected: boolean
  children: ReactNode
  onToggleExport: (checked: boolean) => void
  onSelect: () => void
  onDelete?: () => void
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
      {onDelete && (
        <button
          type="button"
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          onClick={onDelete}
        >
          Delete variation
        </button>
      )}
      <span className="sr-only">{exportKey}</span>
    </div>
  )
}
