'use client'

import { useState, useRef } from 'react'

type Step1Result = {
  imagePath: string
  width: number
  height: number
  sourceWidth?: number
  sourceHeight?: number
}

type Step2Result = { res: string; htmlPath?: string }

export default function Home() {
  const [step1Status, setStep1Status] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [step1Result, setStep1Result] = useState<Step1Result | null>(null)
  const [step1Error, setStep1Error] = useState('')

  const [step2Status, setStep2Status] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [step2Result, setStep2Result] = useState<Step2Result | null>(null)
  const [step2Error, setStep2Error] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  async function handleRemoveText(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return

    setStep1Status('loading')
    setStep1Error('')
    setStep1Result(null)
    setStep2Status('idle')
    setStep2Result(null)

    const { width, height } = await getImageDimensions(file)

    const formData = new FormData()
    formData.append('image', file)
    formData.append('width', String(width))
    formData.append('height', String(height))

    try {
      const res = await fetch('/api/remove-text', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setStep1Result(data)
      setStep1Status('done')
    } catch (err) {
      setStep1Error(err instanceof Error ? err.message : 'Unknown error')
      setStep1Status('error')
    }
  }

  async function handleGenerateVariations() {
    const file = fileRef.current?.files?.[0]
    if (!file || !step1Result) return

    setStep2Status('loading')
    setStep2Error('')
    setStep2Result(null)

    const formData = new FormData()
    formData.append('image', file)
    formData.append('width', String(step1Result.width))
    formData.append('height', String(step1Result.height))
    formData.append('baseHtml', baseHtml)

    try {
      const res = await fetch('/api/generate-variations', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setStep2Result(data)
      setStep2Status('done')
    } catch (err) {
      setStep2Error(err instanceof Error ? err.message : 'Unknown error')
      setStep2Status('error')
    }
  }

  const baseHtml = step1Result
    ? buildBaseHtml(step1Result.imagePath, step1Result.width, step1Result.height)
    : ''

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-8">
      <h1 className="text-2xl font-semibold mt-8">Creatives App</h1>

      {/* Step 1 */}
      <section className="flex flex-col items-center gap-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Step 1 — Remove Text</h2>
        <form onSubmit={handleRemoveText} className="flex flex-col items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            required
            className="border border-gray-300 rounded p-2 text-sm"
          />
          <button
            type="submit"
            disabled={step1Status === 'loading'}
            className="bg-black text-white rounded-full px-6 py-2 text-sm disabled:opacity-50"
          >
            {step1Status === 'loading' ? 'Removing text…' : 'Remove Text'}
          </button>
        </form>
        {step1Status === 'loading' && (
          <p className="text-sm text-gray-400">Processing with AI, ~20–30s…</p>
        )}
        {step1Status === 'error' && (
          <p className="text-sm text-red-500">{step1Error}</p>
        )}
        {step1Status === 'done' && step1Result && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-gray-400">{step1Result.width}×{step1Result.height}px</p>
            <CardPreview
              width={step1Result.width}
              height={step1Result.height}
              htmlContent={baseHtml}
            />
          </div>
        )}
      </section>

      {/* Step 2 */}
      {step1Status === 'done' && step1Result && (
        <section className="flex flex-col items-center gap-4">
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Step 2 — Generate Variations</h2>
          <button
            onClick={handleGenerateVariations}
            disabled={step2Status === 'loading'}
            className="bg-black text-white rounded-full px-6 py-2 text-sm disabled:opacity-50"
          >
            {step2Status === 'loading' ? 'Generating…' : 'Generate 1 Variation'}
          </button>
          {step2Status === 'loading' && (
            <p className="text-sm text-gray-400">Analyzing layout and generating copy…</p>
          )}
          {step2Status === 'error' && (
            <p className="text-sm text-red-500">{step2Error}</p>
          )}
          {step2Status === 'done' && step2Result && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-gray-400">Variation 1</p>
              <CardPreview
                width={step1Result.width}
                height={step1Result.height}
                htmlContent={step2Result.res}
              />
              {step2Result.htmlPath && (
                <a
                  href={step2Result.htmlPath}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 underline"
                >
                  Open saved HTML
                </a>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  )
}

const PREVIEW_WIDTH = 150

function CardPreview({ width, height, htmlContent }: { width: number; height: number; htmlContent: string }) {
  const scale = PREVIEW_WIDTH / width
  const previewHeight = Math.round(height * scale)

  return (
    <div style={{ width: PREVIEW_WIDTH, height: previewHeight, overflow: 'hidden', border: '1px solid #e5e7eb', borderRadius: 4 }}>
      <iframe
        srcDoc={htmlContent}
        style={{
          width,
          height,
          border: 'none',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
        title="Card preview"
        sandbox="allow-same-origin"
      />
    </div>
  )
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

function buildBaseHtml(imagePath: string, width: number, height: number): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background-image: url('${origin}${imagePath}');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
  </style>
</head>
<body></body>
</html>`
}
