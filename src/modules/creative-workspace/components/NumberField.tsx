export function NumberField({
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
