"use client";

import { useState, useEffect } from "react";
import {
  WindIcon,
  DropletIcon,
  RecycleIcon,
  FactoryIcon,
  TrashBinIcon,
  AlertTriangleIcon,
} from "@/components/Icons";

interface Stats {
  avgAqi: number;
  contaminatedRivers: number;
  totalRivers: number;
  recyclingCenters: number;
  pollutantCompanies: number;
  landfills: number;
  complaints: number;
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const items = stats
    ? [
        {
          icon: WindIcon,
          iconColor: "text-blue-400",
          label: "AQI Promedio",
          value: String(stats.avgAqi),
          valueColor:
            stats.avgAqi > 100
              ? "text-red-400"
              : stats.avgAqi > 50
              ? "text-yellow-400"
              : "text-emerald-400",
        },
        {
          icon: DropletIcon,
          iconColor: "text-cyan-400",
          label: "Rios Contaminados",
          value: `${stats.contaminatedRivers}/${stats.totalRivers}`,
          valueColor: "text-red-400",
        },
        {
          icon: RecycleIcon,
          iconColor: "text-emerald-400",
          label: "Centros de Reciclaje",
          value: String(stats.recyclingCenters),
          valueColor: "text-emerald-400",
        },
        {
          icon: FactoryIcon,
          iconColor: "text-red-400",
          label: "Empresas RETC",
          value: String(stats.pollutantCompanies),
          valueColor: "text-red-400",
        },
        {
          icon: TrashBinIcon,
          iconColor: "text-amber-400",
          label: "Rellenos/Tiraderos",
          value: String(stats.landfills),
          valueColor: "text-slate-200",
        },
        {
          icon: AlertTriangleIcon,
          iconColor: "text-yellow-400",
          label: "Denuncias",
          value: String(stats.complaints),
          valueColor: "text-yellow-400",
        },
      ]
    : null;

  return (
    <div className="glass border-b border-white/[0.06] px-5 py-2.5">
      <div className="flex items-center gap-6 text-sm overflow-x-auto">
        {items
          ? items.map((stat, i) => {
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
                      <div
                        className={`font-mono-data text-sm font-bold ${stat.valueColor}`}
                      >
                        {stat.value}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6">
                {i > 0 && <div className="h-6 w-px bg-white/[0.06]" />}
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 skeleton" />
                  <div>
                    <div className="w-16 h-2.5 skeleton mb-1" />
                    <div className="w-8 h-4 skeleton" />
                  </div>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
