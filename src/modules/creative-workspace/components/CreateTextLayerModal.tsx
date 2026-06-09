import { useState, type ChangeEvent } from 'react'
import type { TextLayerSource } from '../types'

type CreateTextLayerPayload = {
  name: string
  source: Exclude<TextLayerSource, 'original'>
  pastedText: string
  sourceImage: File | null
}

export function CreateTextLayerModal({
  status,
  error,
  defaultName,
  onClose,
  onCreate,
}: {
  status: 'idle' | 'loading' | 'done' | 'error'
  error: string
  defaultName: string
  onClose: () => void
  onCreate: (payload: CreateTextLayerPayload) => void
}) {
  const [name, setName] = useState(defaultName)
  const [source, setSource] = useState<Exclude<TextLayerSource, 'original'>>('manual')
  const [pastedText, setPastedText] = useState('')
  const [sourceImage, setSourceImage] = useState<File | null>(null)
  const isLoading = status === 'loading'
  const canCreate = source === 'manual' ? pastedText.trim().length > 0 : Boolean(sourceImage)

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    setSourceImage(event.target.files?.[0] ?? null)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1f1730]/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-[#e6deee] bg-white p-5 shadow-[0_30px_100px_rgba(21,10,36,0.28)]">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-[#eee8f4] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">Text layer</p>
            <h2 className="mt-1 text-xl font-semibold">Create text layer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[#e0d7ea] text-lg text-[#756c81] transition hover:bg-[#f7f4fb] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="grid gap-5">
          <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
            Layer name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="h-11 rounded-lg border border-[#ddd4e8] bg-white px-3 text-sm font-medium normal-case tracking-normal text-[#17121f] outline-none transition focus:border-[#8b5cf6]"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-[#eee8f4] bg-[#fbf9fe] p-1">
            <button
              type="button"
              onClick={() => setSource('manual')}
              disabled={isLoading}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed',
                source === 'manual' ? 'bg-white text-[#5b21b6] shadow-sm' : 'text-[#756c81] hover:bg-white/70',
              ].join(' ')}
            >
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setSource('creative-import')}
              disabled={isLoading}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed',
                source === 'creative-import' ? 'bg-white text-[#5b21b6] shadow-sm' : 'text-[#756c81] hover:bg-white/70',
              ].join(' ')}
            >
              Import creative
            </button>
          </div>

          {source === 'manual' ? (
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
              Text
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                rows={10}
                maxLength={6000}
                disabled={isLoading}
                className="resize-y rounded-lg border border-[#ddd4e8] p-3 text-sm font-medium normal-case leading-6 tracking-normal text-[#17121f] outline-none transition placeholder:text-[#aaa2b4] focus:border-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-70"
              />
            </label>
          ) : (
            <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#c8b9df] bg-[#fbf9fe] px-5 text-center transition hover:border-[#8b5cf6] hover:bg-[#f6f0ff]">
              <input
                type="file"
                accept="image/*"
                disabled={isLoading}
                onChange={handleImageChange}
                className="sr-only"
              />
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ede7f8] text-xl text-[#6d28d9]">
                +
              </span>
              <span className="mt-3 text-sm font-semibold">
                {sourceImage ? sourceImage.name : 'Choose image'}
              </span>
            </label>
          )}

          <button
            type="button"
            disabled={isLoading || !canCreate}
            onClick={() => onCreate({ name, source, pastedText, sourceImage })}
            className="rounded-xl bg-[#7c3aed] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)] transition hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Creating layer...' : 'Create layer'}
          </button>

          {status === 'error' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}
