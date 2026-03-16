"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapLayer } from "@/types";
import Sidebar from "@/components/Sidebar";
import StatsBar from "@/components/StatsBar";

// Dynamic import to avoid SSR issues with Leaflet
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
        <p className="text-gray-500">Cargando mapa...</p>
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
    <div className="h-screen flex flex-col">
      {/* Stats Bar */}
      <StatsBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden absolute top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-lg border border-gray-200"
        >
          {sidebarOpen ? "✕" : "☰"}
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
