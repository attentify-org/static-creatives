import type { TextBlock } from '../types'
import { getBlockSpans, parseStyleDeclarations } from '../utils/render'

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
