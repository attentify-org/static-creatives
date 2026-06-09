import { useState, type PointerEvent } from 'react'
import type { TextBlock } from '../types'
import { getBlockSpans, parseStyleDeclarations } from '../utils/render'
import { isWatermarkBlock } from '../utils/watermark'
import { AttainifyWatermark } from './AttainifyWatermark'

const PREVIEW_MAX_WIDTH = 430

export function CreativeCanvas({
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
  onMoveBlock,
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
  onMoveBlock?: (id: string, x: number, y: number) => void
}) {
  const scale = Math.min(maxPreviewWidth / width, 1)
  const previewWidth = Math.round(width * scale)
  const previewHeight = Math.round(height * scale)
  const [dragState, setDragState] = useState<{
    blockId: string
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    maxX: number
    maxY: number
    moved: boolean
  } | null>(null)

  function startBlockDrag(event: PointerEvent<HTMLDivElement>, block: TextBlock) {
    if (!editMode) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelectBlock?.(block.id)
    setDragState({
      blockId: block.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: block.x,
      startY: block.y,
      maxX: Math.max(0, width - block.width),
      maxY: Math.max(0, height - block.height),
      moved: false,
    })
  }

  function moveBlockDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) return

    event.preventDefault()
    event.stopPropagation()

    const nextX = clampNumber(
      Math.round(dragState.startX + (event.clientX - dragState.startClientX) / scale),
      0,
      dragState.maxX,
    )
    const nextY = clampNumber(
      Math.round(dragState.startY + (event.clientY - dragState.startClientY) / scale),
      0,
      dragState.maxY,
    )
    const moved =
      dragState.moved ||
      Math.abs(event.clientX - dragState.startClientX) > 2 ||
      Math.abs(event.clientY - dragState.startClientY) > 2

    setDragState({ ...dragState, moved })
    onMoveBlock?.(dragState.blockId, nextX, nextY)
  }

  function endBlockDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) return

    event.preventDefault()
    event.stopPropagation()
    setDragState(null)
  }

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
              if (editMode && !dragState?.moved) onSelectBlock?.(block.id)
            }}
            onPointerDown={(event) => startBlockDrag(event, block)}
            onPointerMove={moveBlockDrag}
            onPointerUp={endBlockDrag}
            onPointerCancel={endBlockDrag}
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
              editMode ? 'cursor-grab touch-none active:cursor-grabbing' : 'pointer-events-none',
              editMode && selectedBlockId === block.id ? 'outline outline-2 outline-[#7c3aed]' : '',
              editMode && selectedBlockId !== block.id ? 'outline outline-1 outline-[#a78bfa]/70' : '',
            ].join(' ')}
          >
            {isWatermarkBlock(block) ? (
              <AttainifyWatermark block={block} />
            ) : (
              getBlockSpans(block).map((span) => (
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
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
