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

  const stats = [
    {
      icon: WindIcon,
      iconColor: "text-blue-400",
      label: "AQI Promedio",
      value: String(avgAqi),
      valueColor: avgAqi > 100 ? "text-red-400" : avgAqi > 50 ? "text-yellow-400" : "text-emerald-400",
    },
    {
      icon: DropletIcon,
      iconColor: "text-cyan-400",
      label: "Rios Contaminados",
      value: `${contaminatedRivers}/${sampleWaterQuality.length}`,
      valueColor: "text-red-400",
    },
    {
      icon: RecycleIcon,
      iconColor: "text-emerald-400",
      label: "Centros de Reciclaje",
      value: String(sampleRecyclingCenters.length),
      valueColor: "text-emerald-400",
    },
    {
      icon: FactoryIcon,
      iconColor: "text-red-400",
      label: "Empresas RETC",
      value: String(samplePollutantCompanies.length),
      valueColor: "text-red-400",
    },
    {
      icon: TrashBinIcon,
      iconColor: "text-amber-400",
      label: "Rellenos/Tiraderos",
      value: String(sampleLandfills.length),
      valueColor: "text-slate-200",
    },
    {
      icon: AlertTriangleIcon,
      iconColor: "text-yellow-400",
      label: "Denuncias",
      value: String(sampleComplaints.length),
      valueColor: "text-yellow-400",
    },
  ];

  return (
    <div className="glass border-b border-white/[0.06] px-5 py-2.5">
      <div className="flex items-center gap-6 text-sm overflow-x-auto">
        {stats.map((stat, i) => {
          const IconComponent = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-6">
              {i > 0 && <div className="h-6 w-px bg-white/[0.06]" />}
              <div className="flex items-center gap-2.5 whitespace-nowrap">
                <IconComponent className={stat.iconColor} size={16} />
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                    {stat.label}
                  </div>
                  <div className={`font-mono-data text-sm font-bold ${stat.valueColor}`}>
                    {stat.value}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
