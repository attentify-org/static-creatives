import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { AnalyzeCreativeLoader } from './AnalyzeCreativeLoader'

export function UploadCreativePanel({
  selectedFile,
  isBuilding,
  canOpenWorkspace,
  error,
  onSelectFile,
  onBuildCreative,
  onOpenWorkspace,
}: {
  selectedFile: File | null
  isBuilding: boolean
  canOpenWorkspace: boolean
  error: string
  onSelectFile: (file: File | null) => void
  onBuildCreative: () => void
  onOpenWorkspace: () => void
}) {
  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    onSelectFile(event.target.files?.[0] ?? null)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) {
      onSelectFile(file)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onBuildCreative()
  }

  return (
    <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl place-items-center px-5 py-10">
      <form
        onSubmit={handleSubmit}
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
              onClick={onOpenWorkspace}
              className="rounded-xl border border-[#ddd4e8] px-5 py-3 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#f6f0ff]"
            >
              Open workspace
            </button>
          )}
        </div>

        {isBuilding && <AnalyzeCreativeLoader />}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
      </form>
    </section>
  )
}
