import type { BackgroundMode, CopyRole, HookVariationMode } from '../types'
import { NumberField } from './NumberField'

export function VariationSettingsModal({
  mode,
  counts,
  hookMode,
  copyPrompt,
  backgroundMode,
  backgroundPrompt,
  copyStatus,
  backgroundStatus,
  copyError,
  backgroundError,
  onClose,
  onChangeCounts,
  onChangeHookMode,
  onChangeCopyPrompt,
  onChangeBackgroundMode,
  onChangeBackgroundPrompt,
  onGenerateCopy,
  onGenerateBackground,
}: {
  mode: 'text' | 'visual'
  counts: Record<CopyRole, number>
  hookMode: HookVariationMode
  copyPrompt: string
  backgroundMode: Exclude<BackgroundMode, 'original'>
  backgroundPrompt: string
  copyStatus: 'idle' | 'loading' | 'done' | 'error'
  backgroundStatus: 'idle' | 'loading' | 'done' | 'error'
  copyError: string
  backgroundError: string
  onClose: () => void
  onChangeCounts: (counts: Record<CopyRole, number>) => void
  onChangeHookMode: (mode: HookVariationMode) => void
  onChangeCopyPrompt: (prompt: string) => void
  onChangeBackgroundMode: (mode: Exclude<BackgroundMode, 'original'>) => void
  onChangeBackgroundPrompt: (prompt: string) => void
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

        <div className="grid gap-5">
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

              <label className="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a8294]">
                Background prompt
                <textarea
                  value={backgroundPrompt}
                  onChange={(event) => onChangeBackgroundPrompt(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. make it cleaner, use colder colors, keep the top half empty for text"
                  className="resize-y rounded-lg border border-[#ddd4e8] p-3 text-sm font-medium normal-case leading-6 tracking-normal text-[#17121f] outline-none transition placeholder:text-[#aaa2b4] focus:border-[#8b5cf6]"
                />
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
