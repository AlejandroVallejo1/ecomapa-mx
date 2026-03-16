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
  iconColor: string;
  description: string;
}[] = [
  {
    id: "air-quality",
    label: "Calidad del Aire",
    icon: WindIcon,
    iconColor: "text-blue-500",
    description: "Estaciones de monitoreo atmosferico (SINAICA/OpenAQ)",
  },
  {
    id: "water-quality",
    label: "Calidad del Agua",
    icon: DropletIcon,
    iconColor: "text-cyan-500",
    description: "Puntos de monitoreo en rios y cuerpos de agua (CONAGUA)",
  },
  {
    id: "recycling",
    label: "Centros de Reciclaje",
    icon: RecycleIcon,
    iconColor: "text-emerald-500",
    description: "Centros de acopio y reciclaje",
  },
  {
    id: "pollutants",
    label: "Empresas Contaminantes",
    icon: FactoryIcon,
    iconColor: "text-red-500",
    description: "Registro de Emisiones y Transferencia de Contaminantes (RETC)",
  },
  {
    id: "landfills",
    label: "Rellenos y Tiraderos",
    icon: TrashBinIcon,
    iconColor: "text-amber-700",
    description: "Rellenos sanitarios y sitios de disposicion final",
  },
  {
    id: "complaints",
    label: "Denuncias Ambientales",
    icon: AlertTriangleIcon,
    iconColor: "text-yellow-500",
    description: "Denuncias ciudadanas ante PROFEPA",
  },
];

export default function Sidebar({
  activeLayers,
  onToggleLayer,
  selectedState,
  onSelectState,
}: SidebarProps) {
  return (
    <aside className="w-80 bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-emerald-600 text-white">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <LeafIcon className="text-emerald-200" size={24} />
          EcoMapa MX
        </h1>
        <p className="text-emerald-100 text-sm mt-1">
          Mapa ambiental de Mexico
        </p>
      </div>

      {/* State Filter */}
      <div className="p-4 border-b border-gray-100">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filtrar por estado
        </label>
        <select
          value={selectedState}
          onChange={(e) => onSelectState(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <option value="">Toda la Republica</option>
          {MEXICAN_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </div>

      {/* Layers */}
      <div className="p-4 flex-1">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Capas del mapa
        </h2>
        <div className="space-y-2">
          {LAYERS.map((layer) => {
            const isActive = activeLayers.includes(layer.id);
            const IconComponent = layer.icon;
            return (
              <button
                key={layer.id}
                onClick={() => onToggleLayer(layer.id)}
                className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                  isActive
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex-shrink-0 ${layer.iconColor}`}>
                    <IconComponent size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">
                        {layer.label}
                      </span>
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isActive ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {layer.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
          Leyenda AQI
        </h3>
        <div className="grid grid-cols-3 gap-1 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#00e400" }} />
            <span>Buena</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#ffff00" }} />
            <span>Aceptable</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#ff7e00" }} />
            <span>Danina*</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#ff0000" }} />
            <span>Danina</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#8f3f97" }} />
            <span>Muy danina</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#7e0023" }} />
            <span>Peligrosa</span>
          </div>
        </div>

        <h3 className="text-xs font-semibold text-gray-500 uppercase mt-3 mb-2">
          Calidad del agua
        </h3>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#22c55e" }} />
            <span>Buena</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#eab308" }} />
            <span>Aceptable</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#f97316" }} />
            <span>Contaminada</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
            <span>F. Contaminada</span>
          </div>
        </div>
      </div>

      {/* Data Sources */}
      <div className="p-4 border-t border-gray-200 text-xs text-gray-400">
        <p>Fuentes: SINAICA, CONAGUA, SEMARNAT (RETC), PROFEPA, OpenAQ, datos.gob.mx</p>
      </div>
    </aside>
  );
}
