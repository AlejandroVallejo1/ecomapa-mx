"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapLayer } from "@/types";
import Sidebar from "@/components/Sidebar";
import StatsBar from "@/components/StatsBar";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0F1419]">
      <div className="text-center">
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-emerald-400"
              style={{
                animation: "pulse 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
        <p className="text-slate-500 text-sm">Cargando mapa...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const [activeLayers, setActiveLayers] = useState<MapLayer[]>(["air-quality"]);
  const [selectedState, setSelectedState] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleToggleLayer = (layer: MapLayer) => {
    setActiveLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]
    );
  };

  return (
    <div className="h-screen flex flex-col bg-[#0F1419]">
      <StatsBar />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden absolute top-3 left-3 z-50 glass p-2.5 rounded-lg border border-white/[0.08] text-slate-300 hover:text-white transition-colors"
        >
          {sidebarOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          )}
        </button>

        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 transition-transform duration-300 absolute lg:relative z-40 h-full`}
        >
          <Sidebar
            activeLayers={activeLayers}
            onToggleLayer={handleToggleLayer}
            selectedState={selectedState}
            onSelectState={setSelectedState}
          />
        </div>

        {/* Map */}
        <div className="flex-1">
          <MapView activeLayers={activeLayers} selectedState={selectedState} />
        </div>
      </div>
    </div>
  );
}
