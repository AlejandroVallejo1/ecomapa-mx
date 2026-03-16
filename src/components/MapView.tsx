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

// Popup HTML helper - dark glassmorphism style
function popupHtml(content: string) {
  return `<div style="font-family:'Inter',system-ui,sans-serif;min-width:210px;font-size:13px;line-height:1.5">${content}</div>`;
}

function popupTitle(text: string, color?: string) {
  return `<div style="font-weight:700;font-size:14px;margin-bottom:6px;${color ? `color:${color}` : "color:#EBE6E6"}">${text}</div>`;
}

function popupSubtext(text: string) {
  return `<div style="font-size:11px;color:#94A3B8;margin-bottom:2px">${text}</div>`;
}

function popupBadge(text: string, bg: string) {
  return `<span style="display:inline-block;background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.05em">${text}</span>`;
}

function popupRow(label: string, value: string) {
  return `<tr><td style="color:#94A3B8;padding:2px 0">${label}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;color:#EBE6E6;padding:2px 0">${value}</td></tr>`;
}

function popupTable(rows: string) {
  return `<table style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse">${rows}</table>`;
}

function popupDivider() {
  return `<div style="height:1px;background:rgba(255,255,255,0.06);margin:8px 0"></div>`;
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

    // CARTO Dark Matter - desaturated basemap for data visualization
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
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

    // Air Quality - AQICN-style numbered dots
    if (activeLayers.includes("air-quality")) {
      const data = selectedState
        ? sampleAirQuality.filter((s) => s.state === selectedState)
        : sampleAirQuality;

      data.forEach((station) => {
        const color = getAqiColor(station.aqi);
        const textColor = station.aqi <= 100 ? "#000" : "#fff";

        const icon = L.divIcon({
          html: `<div class="aqi-dot" style="width:34px;height:34px;background:${color};color:${textColor}">${station.aqi}</div>`,
          iconSize: [34, 34],
          className: "",
        });

        const marker = L.marker([station.lat, station.lng], { icon }).addTo(map);

        marker.bindPopup(popupHtml(
          popupTitle(station.name) +
          popupSubtext(`${station.city}, ${station.state}`) +
          `<div style="background:${color};color:${textColor};padding:10px;border-radius:8px;text-align:center;margin:10px 0">
            <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700">${station.aqi}</div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.8;margin-top:2px">AQI</div>
          </div>` +
          popupTable(
            popupRow("PM2.5", `${station.pm25} ug/m3`) +
            popupRow("PM10", `${station.pm10} ug/m3`) +
            popupRow("O3", `${station.o3} ppb`) +
            popupRow("NO2", `${station.no2} ppb`)
          )
        ));
      });
    }

    // Water Quality
    if (activeLayers.includes("water-quality")) {
      const data = selectedState
        ? sampleWaterQuality.filter((s) => s.state === selectedState)
        : sampleWaterQuality;

      data.forEach((point) => {
        const color = getWaterQualityColor(point.quality);
        const marker = L.circleMarker([point.lat, point.lng], {
          radius: 9,
          fillColor: color,
          color: "rgba(255,255,255,0.2)",
          weight: 2,
          fillOpacity: 0.85,
        }).addTo(map);

        const qualityLabel: Record<string, string> = {
          buena: "BUENA",
          aceptable: "ACEPTABLE",
          contaminada: "CONTAMINADA",
          fuertemente_contaminada: "FUERTEMENTE CONTAMINADA",
        };

        marker.bindPopup(popupHtml(
          popupTitle(point.name) +
          `<div style="color:#60A5FA;font-weight:600;font-size:12px;margin-bottom:6px">${point.river}</div>` +
          popupBadge(qualityLabel[point.quality], color) +
          popupDivider() +
          popupTable(
            popupRow("DBO", `${point.bod} mg/L`) +
            popupRow("DQO", `${point.cod} mg/L`) +
            popupRow("SST", `${point.tss} mg/L`)
          )
        ));
      });
    }

    // Recycling Centers
    if (activeLayers.includes("recycling")) {
      const data = selectedState
        ? sampleRecyclingCenters.filter((s) => s.state === selectedState)
        : sampleRecyclingCenters;

      data.forEach((center) => {
        const icon = L.divIcon({
          html: `<div class="icon-marker" style="background:#059669;width:28px;height:28px">${mapMarkerSvgs.recycle}</div>`,
          iconSize: [28, 28],
          className: "",
        });

        const marker = L.marker([center.lat, center.lng], { icon }).addTo(map);

        const materialsHtml = center.materials.map((m) =>
          `<span style="display:inline-block;background:rgba(16,185,129,0.15);color:#6EE7B7;padding:2px 7px;border-radius:4px;font-size:10px;margin:1px;font-weight:500">${m}</span>`
        ).join("");

        marker.bindPopup(popupHtml(
          popupTitle(center.name, "#6EE7B7") +
          popupSubtext(center.address) +
          popupSubtext(`${center.city}, ${center.state}`) +
          (center.phone ? `<div style="font-size:12px;color:#CBD5E1;margin-top:6px"><span style="color:#64748B">Tel:</span> ${center.phone}</div>` : "") +
          (center.schedule ? `<div style="font-size:12px;color:#CBD5E1"><span style="color:#64748B">Horario:</span> ${center.schedule}</div>` : "") +
          popupDivider() +
          `<div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Materiales</div>` +
          materialsHtml
        ));
      });
    }

    // Pollutant Companies
    if (activeLayers.includes("pollutants")) {
      const data = selectedState
        ? samplePollutantCompanies.filter((s) => s.state === selectedState)
        : samplePollutantCompanies;

      data.forEach((company) => {
        const icon = L.divIcon({
          html: `<div class="icon-marker" style="background:#dc2626;width:30px;height:30px">${mapMarkerSvgs.factory}</div>`,
          iconSize: [30, 30],
          className: "",
        });

        const marker = L.marker([company.lat, company.lng], { icon }).addTo(map);

        marker.bindPopup(popupHtml(
          popupTitle(company.name, "#FCA5A5") +
          `<div style="font-size:11px;color:#94A3B8;margin-bottom:2px">${company.sector}</div>` +
          popupSubtext(`${company.municipality}, ${company.state}`) +
          popupDivider() +
          `<div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Emisiones ${company.year}</div>` +
          popupTable(
            company.emissions.map((e) => popupRow(e.substance, `${e.amount.toLocaleString()} ${e.unit}`)).join("")
          )
        ));
      });
    }

    // Landfills
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
          html: `<div class="icon-marker icon-marker--square" style="background:${typeColors[landfill.type] || "#666"};width:28px;height:28px">${mapMarkerSvgs.trash}</div>`,
          iconSize: [28, 28],
          className: "",
        });

        const marker = L.marker([landfill.lat, landfill.lng], { icon }).addTo(map);

        const typeLabels: Record<string, string> = {
          relleno_sanitario: "Relleno Sanitario",
          tiradero_cielo_abierto: "Tiradero a Cielo Abierto",
          sitio_controlado: "Sitio Controlado",
        };

        const statusStyles: Record<string, [string, string]> = {
          activo: ["ACTIVO", "#22c55e"],
          clausurado: ["CLAUSURADO", "#ef4444"],
          en_proceso: ["EN PROCESO", "#eab308"],
        };

        const [statusText, statusColor] = statusStyles[landfill.status] || ["DESCONOCIDO", "#6b7280"];

        marker.bindPopup(popupHtml(
          popupTitle(landfill.name) +
          `<div style="font-size:12px;color:#94A3B8;margin-bottom:4px">${typeLabels[landfill.type]}</div>` +
          popupSubtext(`${landfill.municipality}, ${landfill.state}`) +
          `<div style="margin-top:8px">${popupBadge(statusText, statusColor)}</div>` +
          (landfill.capacity
            ? `<div style="font-size:12px;color:#CBD5E1;margin-top:6px"><span style="color:#64748B">Capacidad:</span> <span style="font-family:'JetBrains Mono',monospace;font-weight:600">${(landfill.capacity / 1000000).toFixed(1)}M ton</span></div>`
            : "")
        ));
      });
    }

    // Complaints
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
          html: `<div class="icon-marker" style="background:#f59e0b;width:26px;height:26px">${resourceSvgs[complaint.resource] || mapMarkerSvgs.alert}</div>`,
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

        marker.bindPopup(popupHtml(
          popupTitle(complaint.type) +
          `<div style="font-size:12px;color:#CBD5E1;margin:4px 0">${complaint.description}</div>` +
          popupSubtext(`${complaint.municipality}, ${complaint.state}`) +
          `<div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            ${popupBadge(statusText, statusColor)}
            <span style="font-size:11px;color:#64748B;font-family:'JetBrains Mono',monospace">${complaint.date}</span>
          </div>`
        ));
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
      <div id="map" className="w-full h-full" />
    </>
  );
}
