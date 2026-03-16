"use client";

import type { MapLayer } from "@/types";
import { MEXICAN_STATES } from "@/lib/data-sources";
import {
  WindIcon,
  DropletIcon,
  RecycleIcon,
  FactoryIcon,
  TrashBinIcon,
  AlertTriangleIcon,
  LeafIcon,
} from "@/components/Icons";

interface SidebarProps {
  activeLayers: MapLayer[];
  onToggleLayer: (layer: MapLayer) => void;
  selectedState: string;
  onSelectState: (state: string) => void;
}

const LAYERS: {
  id: MapLayer;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  activeColor: string;
  description: string;
}[] = [
  {
    id: "air-quality",
    label: "Calidad del Aire",
    icon: WindIcon,
    activeColor: "text-blue-400",
    description: "Estaciones SINAICA / OpenAQ",
  },
  {
    id: "water-quality",
    label: "Calidad del Agua",
    icon: DropletIcon,
    activeColor: "text-cyan-400",
    description: "Monitoreo CONAGUA / RENAMECA",
  },
  {
    id: "recycling",
    label: "Centros de Reciclaje",
    icon: RecycleIcon,
    activeColor: "text-emerald-400",
    description: "Centros de acopio y reciclaje",
  },
  {
    id: "pollutants",
    label: "Empresas Contaminantes",
    icon: FactoryIcon,
    activeColor: "text-red-400",
    description: "Registro RETC / SEMARNAT",
  },
  {
    id: "landfills",
    label: "Rellenos y Tiraderos",
    icon: TrashBinIcon,
    activeColor: "text-amber-400",
    description: "Sitios de disposicion final",
  },
  {
    id: "complaints",
    label: "Denuncias Ambientales",
    icon: AlertTriangleIcon,
    activeColor: "text-yellow-400",
    description: "Denuncias PROFEPA",
  },
];

const AQI_LEGEND = [
  { color: "#00E400", label: "Buena" },
  { color: "#FFFF00", label: "Aceptable" },
  { color: "#FF7E00", label: "Sensible" },
  { color: "#FF0000", label: "Danina" },
  { color: "#8F3F97", label: "Muy danina" },
  { color: "#7E0023", label: "Peligrosa" },
];

const WATER_LEGEND = [
  { color: "#22c55e", label: "Buena" },
  { color: "#eab308", label: "Aceptable" },
  { color: "#f97316", label: "Contaminada" },
  { color: "#ef4444", label: "F. Contaminada" },
];

export default function Sidebar({
  activeLayers,
  onToggleLayer,
  selectedState,
  onSelectState,
}: SidebarProps) {
  return (
    <aside className="w-72 glass flex flex-col h-full overflow-y-auto border-r border-white/[0.06]">
      {/* Header */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <LeafIcon className="text-emerald-400" size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              EcoMapa MX
            </h1>
            <p className="text-[11px] text-slate-400 tracking-wide uppercase">
              Monitoreo Ambiental
            </p>
          </div>
        </div>
      </div>

      {/* State Filter */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <label className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1.5">
          Estado
        </label>
        <select
          value={selectedState}
          onChange={(e) => onSelectState(e.target.value)}
          className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 focus:outline-none transition-colors"
        >
          <option value="" className="bg-[#1A2332]">Toda la Republica</option>
          {MEXICAN_STATES.map((state) => (
            <option key={state} value={state} className="bg-[#1A2332]">
              {state}
            </option>
          ))}
        </select>
      </div>

      {/* Layers */}
      <div className="px-3 py-3 flex-1">
        <h2 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2 px-1">
          Capas
        </h2>
        <div className="space-y-1">
          {LAYERS.map((layer) => {
            const isActive = activeLayers.includes(layer.id);
            const IconComponent = layer.icon;
            return (
              <button
                key={layer.id}
                onClick={() => onToggleLayer(layer.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                  isActive
                    ? "bg-white/[0.08] border border-white/[0.1]"
                    : "border border-transparent hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex-shrink-0 transition-colors ${isActive ? layer.activeColor : "text-slate-500 group-hover:text-slate-400"}`}>
                    <IconComponent size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium transition-colors ${isActive ? "text-slate-100" : "text-slate-400 group-hover:text-slate-300"}`}>
                        {layer.label}
                      </span>
                      <div
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          isActive ? "bg-emerald-400" : "bg-slate-600"
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {layer.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* AQI Legend */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
          Indice de Calidad del Aire
        </h3>
        <div className="flex gap-0.5 rounded-md overflow-hidden mb-1.5">
          {AQI_LEGEND.map((item) => (
            <div
              key={item.label}
              className="h-2 flex-1"
              style={{ background: item.color }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>Buena</span>
          <span>Peligrosa</span>
        </div>

        <h3 className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-3 mb-2">
          Calidad del Agua
        </h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {WATER_LEGEND.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-[10px] text-slate-400">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Data Sources */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Fuentes: SINAICA, CONAGUA, SEMARNAT (RETC), PROFEPA, OpenAQ, datos.gob.mx
        </p>
      </div>
    </aside>
  );
}
