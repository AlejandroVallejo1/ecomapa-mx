"use client";

import { useEffect, useState } from "react";
import type { MapLayer } from "@/types";
import { getAqiColor, getWaterQualityColor } from "@/lib/data-sources";
import { mapMarkerSvgs } from "@/components/Icons";
import {
  sampleAirQuality,
  sampleWaterQuality,
  sampleRecyclingCenters,
  samplePollutantCompanies,
  sampleLandfills,
  sampleComplaints,
} from "@/lib/sample-data";

interface MapViewProps {
  activeLayers: MapLayer[];
  selectedState?: string;
}

export default function MapView({ activeLayers, selectedState }: MapViewProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    import("leaflet").then((leaflet) => {
      setL(leaflet.default || leaflet);
    });
  }, []);

  useEffect(() => {
    if (!L || map) return;

    const mapInstance = L.map("map", {
      center: [23.6345, -102.5528],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(mapInstance);

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  useEffect(() => {
    if (!map || !L) return;

    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    // Air Quality layer
    if (activeLayers.includes("air-quality")) {
      const data = selectedState
        ? sampleAirQuality.filter((s) => s.state === selectedState)
        : sampleAirQuality;

      data.forEach((station) => {
        const marker = L.circleMarker([station.lat, station.lng], {
          radius: 12,
          fillColor: getAqiColor(station.aqi),
          color: "#fff",
          weight: 2,
          fillOpacity: 0.85,
        }).addTo(map);

        marker.bindPopup(`
          <div style="min-width:200px;font-family:system-ui,sans-serif">
            <h3 style="font-weight:700;margin:0 0 8px;font-size:14px">${station.name}</h3>
            <p style="margin:2px 0;color:#666;font-size:12px">${station.city}, ${station.state}</p>
            <div style="background:${getAqiColor(station.aqi)};color:${station.aqi > 100 ? "#fff" : "#000"};padding:8px;border-radius:6px;text-align:center;margin:8px 0">
              <div style="font-size:24px;font-weight:bold">AQI ${station.aqi}</div>
            </div>
            <table style="width:100%;font-size:12px">
              <tr><td>PM2.5</td><td style="text-align:right">${station.pm25} ug/m3</td></tr>
              <tr><td>PM10</td><td style="text-align:right">${station.pm10} ug/m3</td></tr>
              <tr><td>O3</td><td style="text-align:right">${station.o3} ppb</td></tr>
              <tr><td>NO2</td><td style="text-align:right">${station.no2} ppb</td></tr>
            </table>
          </div>
        `);
      });
    }

    // Water Quality layer
    if (activeLayers.includes("water-quality")) {
      const data = selectedState
        ? sampleWaterQuality.filter((s) => s.state === selectedState)
        : sampleWaterQuality;

      data.forEach((point) => {
        const marker = L.circleMarker([point.lat, point.lng], {
          radius: 10,
          fillColor: getWaterQualityColor(point.quality),
          color: "#1e40af",
          weight: 2,
          fillOpacity: 0.8,
        }).addTo(map);

        const qualityLabel: Record<string, string> = {
          buena: "Buena",
          aceptable: "Aceptable",
          contaminada: "Contaminada",
          fuertemente_contaminada: "Fuertemente Contaminada",
        };

        marker.bindPopup(`
          <div style="min-width:200px;font-family:system-ui,sans-serif">
            <h3 style="font-weight:700;margin:0 0 4px;font-size:14px">${point.name}</h3>
            <p style="margin:2px 0;color:#1e40af;font-weight:600;font-size:13px">${point.river}</p>
            <div style="background:${getWaterQualityColor(point.quality)};color:#fff;padding:6px;border-radius:6px;text-align:center;margin:8px 0;font-weight:600;font-size:13px">
              ${qualityLabel[point.quality]}
            </div>
            <table style="width:100%;font-size:12px">
              <tr><td>DBO</td><td style="text-align:right">${point.bod} mg/L</td></tr>
              <tr><td>DQO</td><td style="text-align:right">${point.cod} mg/L</td></tr>
              <tr><td>SST</td><td style="text-align:right">${point.tss} mg/L</td></tr>
            </table>
          </div>
        `);
      });
    }

    // Recycling Centers layer
    if (activeLayers.includes("recycling")) {
      const data = selectedState
        ? sampleRecyclingCenters.filter((s) => s.state === selectedState)
        : sampleRecyclingCenters;

      data.forEach((center) => {
        const icon = L.divIcon({
          html: `<div style="background:#059669;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25)">${mapMarkerSvgs.recycle}</div>`,
          iconSize: [28, 28],
          className: "",
        });

        const marker = L.marker([center.lat, center.lng], { icon }).addTo(map);

        marker.bindPopup(`
          <div style="min-width:220px;font-family:system-ui,sans-serif">
            <h3 style="font-weight:700;margin:0 0 8px;color:#059669;font-size:14px">${center.name}</h3>
            <p style="margin:2px 0;font-size:13px">${center.address}</p>
            <p style="margin:2px 0;color:#666;font-size:12px">${center.city}, ${center.state}</p>
            ${center.phone ? `<p style="margin:4px 0;font-size:12px;color:#374151"><span style="font-weight:600">Tel:</span> ${center.phone}</p>` : ""}
            ${center.schedule ? `<p style="margin:2px 0;font-size:12px;color:#374151"><span style="font-weight:600">Horario:</span> ${center.schedule}</p>` : ""}
            <div style="margin-top:8px">
              <strong style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Materiales</strong><br/>
              ${center.materials.map((m) => `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:11px;margin:2px;display:inline-block">${m}</span>`).join("")}
            </div>
          </div>
        `);
      });
    }

    // Pollutant Companies layer
    if (activeLayers.includes("pollutants")) {
      const data = selectedState
        ? samplePollutantCompanies.filter((s) => s.state === selectedState)
        : samplePollutantCompanies;

      data.forEach((company) => {
        const icon = L.divIcon({
          html: `<div style="background:#dc2626;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25)">${mapMarkerSvgs.factory}</div>`,
          iconSize: [30, 30],
          className: "",
        });

        const marker = L.marker([company.lat, company.lng], { icon }).addTo(map);

        marker.bindPopup(`
          <div style="min-width:240px;font-family:system-ui,sans-serif">
            <h3 style="font-weight:700;margin:0 0 4px;color:#dc2626;font-size:14px">${company.name}</h3>
            <p style="margin:2px 0;font-size:12px;color:#666">${company.sector}</p>
            <p style="margin:2px 0;font-size:13px">${company.municipality}, ${company.state}</p>
            <div style="margin-top:8px">
              <strong style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Emisiones (${company.year})</strong>
              <table style="width:100%;font-size:12px;margin-top:4px">
                ${company.emissions.map((e) => `<tr><td>${e.substance}</td><td style="text-align:right;font-weight:600">${e.amount.toLocaleString()} ${e.unit}</td></tr>`).join("")}
              </table>
            </div>
          </div>
        `);
      });
    }

    // Landfills layer
    if (activeLayers.includes("landfills")) {
      const data = selectedState
        ? sampleLandfills.filter((s) => s.state === selectedState)
        : sampleLandfills;

      data.forEach((landfill) => {
        const typeColors: Record<string, string> = {
          relleno_sanitario: "#854d0e",
          tiradero_cielo_abierto: "#991b1b",
          sitio_controlado: "#92400e",
        };

        const icon = L.divIcon({
          html: `<div style="background:${typeColors[landfill.type] || "#666"};border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25)">${mapMarkerSvgs.trash}</div>`,
          iconSize: [28, 28],
          className: "",
        });

        const marker = L.marker([landfill.lat, landfill.lng], { icon }).addTo(map);

        const typeLabels: Record<string, string> = {
          relleno_sanitario: "Relleno Sanitario",
          tiradero_cielo_abierto: "Tiradero a Cielo Abierto",
          sitio_controlado: "Sitio Controlado",
        };

        const statusLabels: Record<string, [string, string]> = {
          activo: ["Activo", "#16a34a"],
          clausurado: ["Clausurado", "#dc2626"],
          en_proceso: ["En proceso", "#ca8a04"],
        };

        const [statusText, statusColor] = statusLabels[landfill.status] || ["Desconocido", "#6b7280"];

        marker.bindPopup(`
          <div style="min-width:200px;font-family:system-ui,sans-serif">
            <h3 style="font-weight:700;margin:0 0 8px;font-size:14px">${landfill.name}</h3>
            <p style="margin:2px 0;font-size:12px"><strong>Tipo:</strong> ${typeLabels[landfill.type]}</p>
            <p style="margin:2px 0;font-size:12px"><strong>Estado:</strong> <span style="color:${statusColor};font-weight:600">${statusText}</span></p>
            <p style="margin:2px 0;font-size:12px;color:#666">${landfill.municipality}, ${landfill.state}</p>
            ${landfill.capacity ? `<p style="margin:4px 0;font-size:12px"><strong>Capacidad:</strong> ${(landfill.capacity / 1000000).toFixed(1)}M ton</p>` : ""}
          </div>
        `);
      });
    }

    // Complaints layer
    if (activeLayers.includes("complaints")) {
      const data = selectedState
        ? sampleComplaints.filter((s) => s.state === selectedState)
        : sampleComplaints;

      data.forEach((complaint) => {
        const resourceSvgs: Record<string, string> = {
          agua: mapMarkerSvgs.droplet,
          aire: mapMarkerSvgs.wind,
          suelo: mapMarkerSvgs.shovel,
          forestal: mapMarkerSvgs.leaf,
          fauna: mapMarkerSvgs.bird,
        };

        const icon = L.divIcon({
          html: `<div style="background:#f59e0b;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25)">${resourceSvgs[complaint.resource] || mapMarkerSvgs.alert}</div>`,
          iconSize: [26, 26],
          className: "",
        });

        const marker = L.marker([complaint.lat, complaint.lng], { icon }).addTo(map);

        const statusStyles: Record<string, [string, string]> = {
          recibida: ["RECIBIDA", "#3b82f6"],
          en_proceso: ["EN PROCESO", "#f59e0b"],
          concluida: ["CONCLUIDA", "#22c55e"],
        };

        const [statusText, statusColor] = statusStyles[complaint.status] || ["DESCONOCIDO", "#6b7280"];

        marker.bindPopup(`
          <div style="min-width:220px;font-family:system-ui,sans-serif">
            <h3 style="font-weight:700;margin:0 0 4px;font-size:14px">${complaint.type}</h3>
            <p style="margin:4px 0;font-size:13px;color:#374151">${complaint.description}</p>
            <p style="margin:2px 0;color:#666;font-size:12px">${complaint.municipality}, ${complaint.state}</p>
            <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
              <span style="background:${statusColor};color:white;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.05em">${statusText}</span>
              <span style="color:#666;font-size:12px">${complaint.date}</span>
            </div>
          </div>
        `);
      });
    }
  }, [map, L, activeLayers, selectedState]);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <div id="map" className="w-full h-full rounded-lg" />
    </>
  );
}
