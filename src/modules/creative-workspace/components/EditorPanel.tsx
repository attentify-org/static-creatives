import type { ReactNode } from 'react'
import type { TextBlock, TextSpan } from '../types'
import { getInlineSpans } from '../utils/layout'
import { NumberField } from './NumberField'

export function EditorPanel({
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
  onAddWatermark,
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
  onAddWatermark: () => void
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
        <button
          type="button"
          disabled={!editMode}
          className="mt-2 w-full rounded-lg border border-[#cfc2df] bg-white p-2 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff] disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onAddWatermark}
        >
          Add watermark
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

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
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
