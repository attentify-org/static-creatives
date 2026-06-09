export function AnalyzeCreativeLoader() {
  const steps = [
    "Removing original text from the image",
    "Rebuilding clean background",
    "Detecting text blocks and roles",
    "Laying the creative into editable layers",
  ];

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-[#e6deee] bg-[#fbf9fe] p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-[#f1ebfa] sm:w-36">
          <div className="absolute left-8 top-7 h-16 w-20 animate-[layerFloat_2.8s_ease-in-out_infinite] rounded-lg border border-[#c4b5fd] bg-white/80 shadow-lg" />
          <div className="absolute left-12 top-10 h-16 w-20 animate-[layerFloat_2.8s_ease-in-out_infinite_0.18s] rounded-lg border border-[#a78bfa] bg-white/70 shadow-lg" />
          <div className="absolute left-16 top-5 h-16 w-20 animate-[layerFloat_2.8s_ease-in-out_infinite_0.36s] rounded-lg border border-[#8b5cf6] bg-white/90 shadow-lg" />
          <div className="absolute left-6 top-20 h-1 w-24 animate-pulse rounded-full bg-[#7c3aed]/30" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b5cf6]">
              Analyzing
            </p>
            <p className="text-xs font-medium text-[#8a8294]">~1-2 min</p>
          </div>
          <h3 className="mt-2 text-lg font-semibold">
            Lay out creative into layers
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#756c81]">
            Separating background from text and building an editable block
            structure.
          </p>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e8e1f1]">
            <div className="h-full w-1/2 animate-[progressSweep_1.8s_ease-in-out_infinite] rounded-full bg-[#7c3aed]" />
          </div>

          <div className="mt-4 grid gap-2 text-sm text-[#685f73] sm:grid-cols-2">
            {steps.map((step) => (
              <div key={step} className="flex items-center gap-2">
                <span className="h-2 w-2 min-w-2 min-h-2 rounded-full bg-[#8b5cf6]" />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
