export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3f7f3] px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-brand-100/60 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-52 -right-32 h-[560px] w-[560px] rounded-full bg-emerald-100/70 blur-3xl" />
      <div className="relative w-full max-w-[420px]">
        <div className="mb-7 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-lg font-bold text-white shadow-lg shadow-brand-900/20">
            K
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">Khaja Ghar</h1>
          <p className="mt-1.5 text-sm text-gray-500">Canteen management, made simple.</p>
        </div>
        <div className="rounded-3xl border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(23,55,35,0.12)] backdrop-blur sm:p-8">{children}</div>
        <p className="mt-6 text-center text-[10px] font-medium tracking-wide text-gray-400">
          KHATA GHAR · ADMINISTRATION
        </p>
      </div>
    </div>
  );
}
