/** Fallback Suspense discret — barre haute, pas de plein écran bloquant. */
export function PageLoader() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-transparent">
      <div
        className="h-full w-1/3 bg-brand-600 animate-[page-load_0.9s_ease-in-out_infinite]"
        style={{
          animationName: 'page-load',
        }}
      />
      <style>{`
        @keyframes page-load {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  )
}
