"use client";

import {
  sampleAirQuality,
  sampleWaterQuality,
  sampleRecyclingCenters,
  samplePollutantCompanies,
  sampleLandfills,
  sampleComplaints,
} from "@/lib/sample-data";
import {
  WindIcon,
  DropletIcon,
  RecycleIcon,
  FactoryIcon,
  TrashBinIcon,
  AlertTriangleIcon,
} from "@/components/Icons";

export default function StatsBar() {
  const avgAqi = Math.round(
    sampleAirQuality.reduce((sum, s) => sum + s.aqi, 0) / sampleAirQuality.length
  );

  const contaminatedRivers = sampleWaterQuality.filter(
    (w) => w.quality === "contaminada" || w.quality === "fuertemente_contaminada"
  ).length;

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center gap-8 text-sm overflow-x-auto">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <WindIcon className="text-blue-500" size={20} />
          <div>
            <div className="text-gray-500 text-xs">AQI Promedio</div>
            <div className="font-bold text-gray-900">{avgAqi}</div>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="flex items-center gap-2 whitespace-nowrap">
          <DropletIcon className="text-cyan-500" size={20} />
          <div>
            <div className="text-gray-500 text-xs">Rios Contaminados</div>
            <div className="font-bold text-red-600">
              {contaminatedRivers}/{sampleWaterQuality.length}
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="flex items-center gap-2 whitespace-nowrap">
          <RecycleIcon className="text-emerald-500" size={20} />
          <div>
            <div className="text-gray-500 text-xs">Centros de Reciclaje</div>
            <div className="font-bold text-emerald-600">
              {sampleRecyclingCenters.length}
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="flex items-center gap-2 whitespace-nowrap">
          <FactoryIcon className="text-red-500" size={20} />
          <div>
            <div className="text-gray-500 text-xs">Empresas RETC</div>
            <div className="font-bold text-red-600">
              {samplePollutantCompanies.length}
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="flex items-center gap-2 whitespace-nowrap">
          <TrashBinIcon className="text-amber-700" size={20} />
          <div>
            <div className="text-gray-500 text-xs">Rellenos/Tiraderos</div>
            <div className="font-bold text-gray-900">{sampleLandfills.length}</div>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div className="flex items-center gap-2 whitespace-nowrap">
          <AlertTriangleIcon className="text-yellow-500" size={20} />
          <div>
            <div className="text-gray-500 text-xs">Denuncias</div>
            <div className="font-bold text-yellow-600">{sampleComplaints.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
