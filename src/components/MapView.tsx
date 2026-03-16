"use client";

import { useEffect, useState, useRef } from "react";
import type {
  MapLayer,
  AirQualityStation,
  WaterQualityPoint,
  RecyclingCenter,
  PollutantCompany,
  Landfill,
  EnvironmentalComplaint,
} from "@/types";
import { getAqiColor, getWaterQualityColor } from "@/lib/data-sources";
import { mapMarkerSvgs } from "@/components/Icons";

export interface MapViewHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface MapViewProps {
  activeLayers: MapLayer[];
  airQuality: AirQualityStation[];
  waterQuality: WaterQualityPoint[];
  recyclingCenters: RecyclingCenter[];
  pollutantCompanies: PollutantCompany[];
  landfills: Landfill[];
  complaints: EnvironmentalComplaint[];
  onMapReady?: (handle: MapViewHandle) => void;
}

// Escape HTML to prevent XSS from external data sources
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Popup HTML helpers - dark glassmorphism style
function popupHtml(content: string) {
  return `<div style="font-family:'Inter',system-ui,sans-serif;min-width:210px;font-size:13px;line-height:1.5">${content}</div>`;
}

function popupTitle(text: string, color?: string) {
  return `<div style="font-weight:700;font-size:14px;margin-bottom:6px;${color ? `color:${color}` : "color:#EBE6E6"}">${esc(text)}</div>`;
}

function popupSubtext(text: string) {
  return `<div style="font-size:11px;color:#94A3B8;margin-bottom:2px">${esc(text)}</div>`;
}

function popupBadge(text: string, bg: string) {
  return `<span style="display:inline-block;background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.05em">${esc(text)}</span>`;
}

function popupRow(label: string, value: string) {
  return `<tr><td style="color:#94A3B8;padding:2px 0">${esc(label)}</td><td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:600;color:#EBE6E6;padding:2px 0">${esc(value)}</td></tr>`;
}

function popupTable(rows: string) {
  return `<table style="width:100%;font-size:12px;margin-top:6px;border-collapse:collapse">${rows}</table>`;
}

function popupDivider() {
  return `<div style="height:1px;background:rgba(255,255,255,0.06);margin:8px 0"></div>`;
}

// Per-layer group type — either a plain LayerGroup or a MarkerClusterGroup
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLayerGroup = L.LayerGroup | any;

export default function MapView({
  activeLayers, airQuality, waterQuality, recyclingCenters, pollutantCompanies, landfills, complaints, onMapReady,
}: MapViewProps) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  // Persistent layer groups keyed by MapLayer name — survive across renders
  const layerGroups = useRef<Record<string, AnyLayerGroup>>({});

  useEffect(() => {
    if (map && onMapReady) {
      onMapReady({
        flyTo: (lat: number, lng: number, zoom = 12) => {
          map.flyTo([lat, lng], zoom, { duration: 1.2 });
        },
      });
    }
  }, [map, onMapReady]);

  useEffect(() => {
    Promise.all([
      import("leaflet"),
      import("leaflet.markercluster"),
    ]).then(([leaflet]) => {
      setL(leaflet.default || leaflet);
    });
  }, []);

  useEffect(() => {
    if (!L || map) return;

    const mapInstance = L.map("map", {
      center: [23.6345, -102.5528],
      zoom: 5,
      zoomControl: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelDebounceTime: 60,
      wheelPxPerZoomLevel: 120,
      preferCanvas: true,
      zoomAnimation: true,
      markerZoomAnimation: true,
      fadeAnimation: true,
    });

    // CARTO Voyager - modern, balanced basemap for data visualization
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
      keepBuffer: 4,
      updateWhenZooming: false,
      updateWhenIdle: true,
    }).addTo(mapInstance);

    setMap(mapInstance);

    return () => {
      mapInstance.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  // --- Air Quality layer (clustered) ---
  useEffect(() => {
    if (!map || !L) return;
    const key = "air-quality";

    // Remove previous group
    if (layerGroups.current[key]) {
      map.removeLayer(layerGroups.current[key]);
      delete layerGroups.current[key];
    }

    if (!activeLayers.includes(key) || airQuality.length === 0) return;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      disableClusteringAtZoom: 12,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      animate: true,
      animateAddingMarkers: false,
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iconCreateFunction: (cluster: any) => {
        const markers: L.Marker[] = cluster.getAllChildMarkers();
        const avgAqi = Math.round(markers.reduce((sum: number, m: L.Marker) => {
          return sum + ((m.options as Record<string, unknown>).aqiValue as number);
        }, 0) / markers.length);
        const color = getAqiColor(avgAqi);
        const textColor = avgAqi <= 100 ? "#000" : "#fff";
        const count = markers.length;
        return L.divIcon({
          html: `<div class="aqi-cluster" style="background:${color};color:${textColor}">
            <span class="aqi-cluster-value">${avgAqi}</span>
            <span class="aqi-cluster-count">${count}</span>
          </div>`,
          iconSize: [44, 44],
          className: "",
        });
      },
    });

    const markers: L.Marker[] = [];
    for (const station of airQuality) {
      const color = getAqiColor(station.aqi);
      const textColor = station.aqi <= 100 ? "#000" : "#fff";

      const icon = L.divIcon({
        html: `<div class="aqi-dot" style="width:34px;height:34px;background:${color};color:${textColor}">${station.aqi}</div>`,
        iconSize: [34, 34],
        className: "",
      });

      const marker = L.marker([station.lat, station.lng], {
        icon,
        aqiValue: station.aqi,
      } as L.MarkerOptions);

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

      markers.push(marker);
    }

    cluster.addLayers(markers);
    map.addLayer(cluster);
    layerGroups.current[key] = cluster;
  }, [map, L, activeLayers, airQuality]);

  // --- Water Quality layer ---
  useEffect(() => {
    if (!map || !L) return;
    const key = "water-quality";

    if (layerGroups.current[key]) {
      map.removeLayer(layerGroups.current[key]);
      delete layerGroups.current[key];
    }

    if (!activeLayers.includes(key) || waterQuality.length === 0) return;

    const group = L.layerGroup();

    for (const point of waterQuality) {
      const color = getWaterQualityColor(point.quality);
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 9,
        fillColor: color,
        color: "rgba(255,255,255,0.2)",
        weight: 2,
        fillOpacity: 0.85,
      });

      const qualityLabel: Record<string, string> = {
        buena: "BUENA",
        aceptable: "ACEPTABLE",
        contaminada: "CONTAMINADA",
        fuertemente_contaminada: "FUERTEMENTE CONTAMINADA",
      };

      marker.bindPopup(popupHtml(
        popupTitle(point.name) +
        `<div style="color:#60A5FA;font-weight:600;font-size:12px;margin-bottom:6px">${esc(point.river)}</div>` +
        popupBadge(qualityLabel[point.quality], color) +
        popupDivider() +
        popupTable(
          popupRow("DBO", `${point.bod} mg/L`) +
          popupRow("DQO", `${point.cod} mg/L`) +
          popupRow("SST", `${point.tss} mg/L`)
        )
      ));

      group.addLayer(marker);
    }

    group.addTo(map);
    layerGroups.current[key] = group;
  }, [map, L, activeLayers, waterQuality]);

  // --- Recycling Centers layer ---
  useEffect(() => {
    if (!map || !L) return;
    const key = "recycling";

    if (layerGroups.current[key]) {
      map.removeLayer(layerGroups.current[key]);
      delete layerGroups.current[key];
    }

    if (!activeLayers.includes(key) || recyclingCenters.length === 0) return;

    const group = L.layerGroup();

    for (const center of recyclingCenters) {
      const icon = L.divIcon({
        html: `<div class="icon-marker" style="background:#059669;width:28px;height:28px">${mapMarkerSvgs.recycle}</div>`,
        iconSize: [28, 28],
        className: "",
      });

      const marker = L.marker([center.lat, center.lng], { icon });

      const materialsHtml = center.materials.map((m) =>
        `<span style="display:inline-block;background:rgba(16,185,129,0.15);color:#6EE7B7;padding:2px 7px;border-radius:4px;font-size:10px;margin:1px;font-weight:500">${esc(m)}</span>`
      ).join("");

      marker.bindPopup(popupHtml(
        popupTitle(center.name, "#6EE7B7") +
        popupSubtext(center.address) +
        popupSubtext(`${center.city}, ${center.state}`) +
        (center.phone ? `<div style="font-size:12px;color:#CBD5E1;margin-top:6px"><span style="color:#64748B">Tel:</span> ${esc(center.phone)}</div>` : "") +
        (center.schedule ? `<div style="font-size:12px;color:#CBD5E1"><span style="color:#64748B">Horario:</span> ${esc(center.schedule)}</div>` : "") +
        popupDivider() +
        `<div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Materiales</div>` +
        materialsHtml
      ));

      group.addLayer(marker);
    }

    group.addTo(map);
    layerGroups.current[key] = group;
  }, [map, L, activeLayers, recyclingCenters]);

  // --- Pollutant Companies layer ---
  useEffect(() => {
    if (!map || !L) return;
    const key = "pollutants";

    if (layerGroups.current[key]) {
      map.removeLayer(layerGroups.current[key]);
      delete layerGroups.current[key];
    }

    if (!activeLayers.includes(key) || pollutantCompanies.length === 0) return;

    const group = L.layerGroup();

    for (const company of pollutantCompanies) {
      const icon = L.divIcon({
        html: `<div class="icon-marker" style="background:#dc2626;width:30px;height:30px">${mapMarkerSvgs.factory}</div>`,
        iconSize: [30, 30],
        className: "",
      });

      const marker = L.marker([company.lat, company.lng], { icon });

      marker.bindPopup(popupHtml(
        popupTitle(company.name, "#FCA5A5") +
        `<div style="font-size:11px;color:#94A3B8;margin-bottom:2px">${esc(company.sector)}</div>` +
        popupSubtext(`${company.municipality}, ${company.state}`) +
        popupDivider() +
        `<div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Emisiones ${company.year}</div>` +
        popupTable(
          company.emissions.map((e) => popupRow(e.substance, `${e.amount.toLocaleString()} ${e.unit}`)).join("")
        )
      ));

      group.addLayer(marker);
    }

    group.addTo(map);
    layerGroups.current[key] = group;
  }, [map, L, activeLayers, pollutantCompanies]);

  // --- Landfills layer ---
  useEffect(() => {
    if (!map || !L) return;
    const key = "landfills";

    if (layerGroups.current[key]) {
      map.removeLayer(layerGroups.current[key]);
      delete layerGroups.current[key];
    }

    if (!activeLayers.includes(key) || landfills.length === 0) return;

    const group = L.layerGroup();

    for (const landfill of landfills) {
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

      const marker = L.marker([landfill.lat, landfill.lng], { icon });

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
        `<div style="font-size:12px;color:#94A3B8;margin-bottom:4px">${esc(typeLabels[landfill.type])}</div>` +
        popupSubtext(`${landfill.municipality}, ${landfill.state}`) +
        `<div style="margin-top:8px">${popupBadge(statusText, statusColor)}</div>` +
        (landfill.capacity
          ? `<div style="font-size:12px;color:#CBD5E1;margin-top:6px"><span style="color:#64748B">Capacidad:</span> <span style="font-family:'JetBrains Mono',monospace;font-weight:600">${(landfill.capacity / 1000000).toFixed(1)}M ton</span></div>`
          : "")
      ));

      group.addLayer(marker);
    }

    group.addTo(map);
    layerGroups.current[key] = group;
  }, [map, L, activeLayers, landfills]);

  // --- Complaints layer ---
  useEffect(() => {
    if (!map || !L) return;
    const key = "complaints";

    if (layerGroups.current[key]) {
      map.removeLayer(layerGroups.current[key]);
      delete layerGroups.current[key];
    }

    if (!activeLayers.includes(key) || complaints.length === 0) return;

    const group = L.layerGroup();

    for (const complaint of complaints) {
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

      const marker = L.marker([complaint.lat, complaint.lng], { icon });

      const statusStyles: Record<string, [string, string]> = {
        recibida: ["RECIBIDA", "#3b82f6"],
        en_proceso: ["EN PROCESO", "#f59e0b"],
        concluida: ["CONCLUIDA", "#22c55e"],
      };

      const [statusText, statusColor] = statusStyles[complaint.status] || ["DESCONOCIDO", "#6b7280"];

      marker.bindPopup(popupHtml(
        popupTitle(complaint.type) +
        `<div style="font-size:12px;color:#CBD5E1;margin:4px 0">${esc(complaint.description)}</div>` +
        popupSubtext(`${complaint.municipality}, ${complaint.state}`) +
        `<div style="display:flex;align-items:center;gap:8px;margin-top:8px">
          ${popupBadge(statusText, statusColor)}
          <span style="font-size:11px;color:#64748B;font-family:'JetBrains Mono',monospace">${esc(complaint.date)}</span>
        </div>`
      ));

      group.addLayer(marker);
    }

    group.addTo(map);
    layerGroups.current[key] = group;
  }, [map, L, activeLayers, complaints]);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
        crossOrigin=""
      />
      <div id="map" className="w-full h-full" />
    </>
  );
}
