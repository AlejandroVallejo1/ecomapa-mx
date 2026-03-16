"use client";

interface DataSourceBannerProps {
  isLoading: boolean;
  isFallback: boolean;
}

export default function DataSourceBanner({ isLoading, isFallback }: DataSourceBannerProps) {
  if (!isLoading && !isFallback) return null;

  return (
    <div className="absolute top-3 right-3 z-30">
      {isLoading && (
        <div className="glass rounded-lg px-3 py-1.5 flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400">Cargando datos...</span>
        </div>
      )}
      {!isLoading && isFallback && (
        <div className="glass rounded-lg px-3 py-1.5 flex items-center gap-2 border border-yellow-500/20">
          <svg
            className="w-3.5 h-3.5 text-yellow-400 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <span className="text-xs text-yellow-400">Datos de muestra (API no disponible)</span>
        </div>
      )}
    </div>
  );
}
