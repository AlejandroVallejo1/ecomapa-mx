"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

// ── Helpers ─────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

// ── GeoJSON builders ────────────────────────────────────────────────

type GeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point>;

function toGeoJSON<T extends { lat: number; lng: number }>(
  items: T[],
  propsMapper: (item: T) => Record<string, unknown>
): GeoJSON {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [item.lng, item.lat] },
      properties: propsMapper(item),
    })),
  };
}

// All layer source/layer IDs we manage
const LAYER_IDS = {
  "air-quality": {
    source: "air-quality-src",
    clusterCircle: "aq-cluster-circle",
    clusterLabel: "aq-cluster-label",
    unclustered: "aq-unclustered",
    unclusteredLabel: "aq-unclustered-label",
  },
  "water-quality": {
    source: "water-quality-src",
    circle: "wq-circle",
    outline: "wq-outline",
  },
  recycling: {
    source: "recycling-src",
    circle: "rc-circle",
    icon: "rc-icon",
  },
  pollutants: {
    source: "pollutants-src",
    circle: "pl-circle",
    icon: "pl-icon",
  },
  landfills: {
    source: "landfills-src",
    circle: "lf-circle",
  },
  complaints: {
    source: "complaints-src",
    circle: "cm-circle",
  },
} as const;

// ── Component ───────────────────────────────────────────────────────

export default function MapView({
  activeLayers,
  airQuality,
  waterQuality,
  recyclingCenters,
  pollutantCompanies,
  landfills,
  complaints,
  onMapReady,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Stable popup instance
  const getPopup = useCallback(() => {
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "320px",
        className: "eco-popup",
      });
    }
    return popupRef.current;
  }, []);

  // ── Initialize map ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
              "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
          },
        },
        layers: [
          {
            id: "carto-tiles",
            type: "raster",
            source: "carto",
            minzoom: 0,
            maxzoom: 20,
          },
        ],
      },
      center: [-102.5528, 23.6345],
      zoom: 4.8,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: {},
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      mapRef.current = map;
      setMapReady(true);
    });

    if (onMapReady) {
      onMapReady({
        flyTo: (lat: number, lng: number, zoom = 12) => {
          map.flyTo({ center: [lng, lat], zoom, duration: 1500 });
        },
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helper: safely add/update a source + layers ─────────────────
  const upsertSource = useCallback(
    (sourceId: string, data: GeoJSON, options?: Partial<maplibregl.GeoJSONSourceSpecification>) => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
      } else {
        map.addSource(sourceId, {
          type: "geojson",
          data,
          ...options,
        });
      }
    },
    []
  );

  const setLayerVisibility = useCallback(
    (layerIds: string[], visible: boolean) => {
      const map = mapRef.current;
      if (!map || !mapReady) return;
      for (const id of layerIds) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
        }
      }
    },
    []
  );

  // ── Air Quality (clustered) ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ids = LAYER_IDS["air-quality"];
    const visible = activeLayers.includes("air-quality");

    const geojson = toGeoJSON(airQuality, (s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      state: s.state,
      aqi: s.aqi,
      color: getAqiColor(s.aqi),
      textColor: s.aqi <= 100 ? "#000000" : "#ffffff",
      pm25: s.pm25,
      pm10: s.pm10,
      o3: s.o3,
      no2: s.no2,
    }));

    upsertSource(ids.source, geojson, {
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 12,
      clusterProperties: {
        aqiSum: ["+", ["get", "aqi"]],
        aqiMax: ["max", ["get", "aqi"]],
      },
    });

    // Cluster circles
    if (!map.getLayer(ids.clusterCircle)) {
      map.addLayer({
        id: ids.clusterCircle,
        type: "circle",
        source: ids.source,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["/", ["get", "aqiSum"], ["get", "point_count"]],
            0, "#00e400",
            50, "#00e400",
            51, "#ffff00",
            100, "#ffff00",
            101, "#ff7e00",
            150, "#ff7e00",
            151, "#ff0000",
            200, "#ff0000",
            201, "#8f3f97",
            300, "#8f3f97",
            301, "#7e0023",
          ],
          "circle-radius": ["step", ["get", "point_count"], 20, 10, 25, 50, 32],
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
          "circle-opacity": 0.9,
        },
      });

      // Cluster labels
      map.addLayer({
        id: ids.clusterLabel,
        type: "symbol",
        source: ids.source,
        filter: ["has", "point_count"],
        layout: {
          "text-field": [
            "concat",
            ["to-string", ["round", ["/", ["get", "aqiSum"], ["get", "point_count"]]]],
            "\n",
            ["to-string", ["get", "point_count"]],
          ],
          "text-size": 11,
          "text-font": ["Open Sans Bold"],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.5)",
          "text-halo-width": 1,
        },
      });

      // Unclustered circles
      map.addLayer({
        id: ids.unclustered,
        type: "circle",
        source: ids.source,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 14,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.25)",
        },
      });

      // Unclustered labels
      map.addLayer({
        id: ids.unclusteredLabel,
        type: "symbol",
        source: ids.source,
        filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["to-string", ["get", "aqi"]],
          "text-size": 10,
          "text-font": ["Open Sans Bold"],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": ["get", "textColor"],
          "text-halo-color": "rgba(0,0,0,0.3)",
          "text-halo-width": 0.5,
        },
      });

      // Click handlers
      map.on("click", ids.clusterCircle, (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: [ids.clusterCircle] });
        if (!features.length) return;
        const clusterId = features[0].properties.cluster_id;
        (map.getSource(ids.source) as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (features[0].geometry as GeoJSON.Point).coordinates;
          map.easeTo({ center: [coords[0], coords[1]], zoom: zoom + 1 });
        });
      });

      map.on("click", ids.unclustered, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = (f.geometry as GeoJSON.Point).coordinates;
        const color = p.color;
        const textColor = p.textColor;
        getPopup()
          .setLngLat([coords[0], coords[1]])
          .setHTML(
            popupHtml(
              popupTitle(p.name as string) +
              popupSubtext(`${p.city}, ${p.state}`) +
              `<div style="background:${color};color:${textColor};padding:10px;border-radius:8px;text-align:center;margin:10px 0">
                <div style="font-family:'JetBrains Mono',monospace;font-size:28px;font-weight:700">${p.aqi}</div>
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;opacity:0.8;margin-top:2px">AQI</div>
              </div>` +
              popupTable(
                popupRow("PM2.5", `${p.pm25} ug/m3`) +
                popupRow("PM10", `${p.pm10} ug/m3`) +
                popupRow("O3", `${p.o3} ppb`) +
                popupRow("NO2", `${p.no2} ppb`)
              )
            )
          )
          .addTo(map);
      });

      // Cursor
      map.on("mouseenter", ids.clusterCircle, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ids.clusterCircle, () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", ids.unclustered, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ids.unclustered, () => { map.getCanvas().style.cursor = ""; });
    }

    setLayerVisibility(
      [ids.clusterCircle, ids.clusterLabel, ids.unclustered, ids.unclusteredLabel],
      visible
    );
  }, [mapReady, activeLayers, airQuality, upsertSource, setLayerVisibility, getPopup]);

  // ── Water Quality ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ids = LAYER_IDS["water-quality"];
    const visible = activeLayers.includes("water-quality");

    const qualityLabel: Record<string, string> = {
      buena: "BUENA", aceptable: "ACEPTABLE",
      contaminada: "CONTAMINADA", fuertemente_contaminada: "FUERTEMENTE CONTAMINADA",
    };

    const geojson = toGeoJSON(waterQuality, (p) => ({
      id: p.id, name: p.name, river: p.river, state: p.state,
      color: getWaterQualityColor(p.quality),
      qualityLabel: qualityLabel[p.quality] ?? p.quality,
      bod: p.bod, cod: p.cod, tss: p.tss,
    }));

    upsertSource(ids.source, geojson);

    if (!map.getLayer(ids.circle)) {
      map.addLayer({
        id: ids.circle,
        type: "circle",
        source: ids.source,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 7,
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
        },
      });

      map.on("click", ids.circle, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = (f.geometry as GeoJSON.Point).coordinates;
        getPopup()
          .setLngLat([coords[0], coords[1]])
          .setHTML(
            popupHtml(
              popupTitle(p.name as string) +
              `<div style="color:#60A5FA;font-weight:600;font-size:12px;margin-bottom:6px">${esc(p.river as string)}</div>` +
              popupBadge(p.qualityLabel as string, p.color as string) +
              popupDivider() +
              popupTable(
                popupRow("DBO", `${p.bod} mg/L`) +
                popupRow("DQO", `${p.cod} mg/L`) +
                popupRow("SST", `${p.tss} mg/L`)
              )
            )
          )
          .addTo(map);
      });

      map.on("mouseenter", ids.circle, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ids.circle, () => { map.getCanvas().style.cursor = ""; });
    }

    setLayerVisibility([ids.circle], visible);
  }, [mapReady, activeLayers, waterQuality, upsertSource, setLayerVisibility, getPopup]);

  // ── Recycling Centers ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ids = LAYER_IDS.recycling;
    const visible = activeLayers.includes("recycling");

    const geojson = toGeoJSON(recyclingCenters, (c) => ({
      id: c.id, name: c.name, address: c.address,
      city: c.city, state: c.state,
      materials: c.materials.join(", "),
      phone: c.phone ?? "", schedule: c.schedule ?? "",
    }));

    upsertSource(ids.source, geojson);

    if (!map.getLayer(ids.circle)) {
      map.addLayer({
        id: ids.circle,
        type: "circle",
        source: ids.source,
        paint: {
          "circle-color": "#059669",
          "circle-radius": 8,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
        },
      });

      map.on("click", ids.circle, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = (f.geometry as GeoJSON.Point).coordinates;
        const materialsHtml = (p.materials as string).split(", ").map((m) =>
          `<span style="display:inline-block;background:rgba(16,185,129,0.15);color:#6EE7B7;padding:2px 7px;border-radius:4px;font-size:10px;margin:1px;font-weight:500">${esc(m)}</span>`
        ).join("");
        getPopup()
          .setLngLat([coords[0], coords[1]])
          .setHTML(
            popupHtml(
              popupTitle(p.name as string, "#6EE7B7") +
              popupSubtext(p.address as string) +
              popupSubtext(`${p.city}, ${p.state}`) +
              (p.phone ? `<div style="font-size:12px;color:#CBD5E1;margin-top:6px"><span style="color:#64748B">Tel:</span> ${esc(p.phone as string)}</div>` : "") +
              (p.schedule ? `<div style="font-size:12px;color:#CBD5E1"><span style="color:#64748B">Horario:</span> ${esc(p.schedule as string)}</div>` : "") +
              popupDivider() +
              `<div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Materiales</div>` +
              materialsHtml
            )
          )
          .addTo(map);
      });

      map.on("mouseenter", ids.circle, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ids.circle, () => { map.getCanvas().style.cursor = ""; });
    }

    setLayerVisibility([ids.circle], visible);
  }, [mapReady, activeLayers, recyclingCenters, upsertSource, setLayerVisibility, getPopup]);

  // ── Pollutant Companies ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ids = LAYER_IDS.pollutants;
    const visible = activeLayers.includes("pollutants");

    const geojson = toGeoJSON(pollutantCompanies, (c) => ({
      id: c.id, name: c.name, sector: c.sector,
      municipality: c.municipality, state: c.state, year: c.year,
      emissions: c.emissions
        .map((e) => `${e.substance}: ${e.amount.toLocaleString()} ${e.unit}`)
        .join("\n"),
    }));

    upsertSource(ids.source, geojson);

    if (!map.getLayer(ids.circle)) {
      map.addLayer({
        id: ids.circle,
        type: "circle",
        source: ids.source,
        paint: {
          "circle-color": "#dc2626",
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
        },
      });

      map.on("click", ids.circle, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = (f.geometry as GeoJSON.Point).coordinates;
        const emissionsRows = (p.emissions as string)
          .split("\n")
          .map((line) => {
            const [sub, val] = line.split(": ");
            return popupRow(sub ?? "", val ?? "");
          })
          .join("");
        getPopup()
          .setLngLat([coords[0], coords[1]])
          .setHTML(
            popupHtml(
              popupTitle(p.name as string, "#FCA5A5") +
              `<div style="font-size:11px;color:#94A3B8;margin-bottom:2px">${esc(p.sector as string)}</div>` +
              popupSubtext(`${p.municipality}, ${p.state}`) +
              popupDivider() +
              `<div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Emisiones ${p.year}</div>` +
              popupTable(emissionsRows)
            )
          )
          .addTo(map);
      });

      map.on("mouseenter", ids.circle, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ids.circle, () => { map.getCanvas().style.cursor = ""; });
    }

    setLayerVisibility([ids.circle], visible);
  }, [mapReady, activeLayers, pollutantCompanies, upsertSource, setLayerVisibility, getPopup]);

  // ── Landfills / Contaminated Sites ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ids = LAYER_IDS.landfills;
    const visible = activeLayers.includes("landfills");

    const typeColors: Record<string, string> = {
      relleno_sanitario: "#854d0e",
      tiradero_cielo_abierto: "#991b1b",
      sitio_controlado: "#92400e",
    };
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

    const geojson = toGeoJSON(landfills, (l) => ({
      id: l.id, name: l.name,
      color: typeColors[l.type] ?? "#666",
      typeLabel: typeLabels[l.type] ?? l.type,
      municipality: l.municipality, state: l.state,
      status: l.status,
      statusText: (statusStyles[l.status] ?? ["DESCONOCIDO"])[0],
      statusColor: (statusStyles[l.status] ?? ["", "#6b7280"])[1],
      capacity: l.capacity ?? 0,
    }));

    upsertSource(ids.source, geojson);

    if (!map.getLayer(ids.circle)) {
      map.addLayer({
        id: ids.circle,
        type: "circle",
        source: ids.source,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.25)",
        },
      });

      map.on("click", ids.circle, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = (f.geometry as GeoJSON.Point).coordinates;
        const cap = Number(p.capacity);
        getPopup()
          .setLngLat([coords[0], coords[1]])
          .setHTML(
            popupHtml(
              popupTitle(p.name as string) +
              `<div style="font-size:12px;color:#94A3B8;margin-bottom:4px">${esc(p.typeLabel as string)}</div>` +
              popupSubtext(`${p.municipality}, ${p.state}`) +
              `<div style="margin-top:8px">${popupBadge(p.statusText as string, p.statusColor as string)}</div>` +
              (cap > 0
                ? `<div style="font-size:12px;color:#CBD5E1;margin-top:6px"><span style="color:#64748B">Capacidad:</span> <span style="font-family:'JetBrains Mono',monospace;font-weight:600">${(cap / 1000000).toFixed(1)}M ton</span></div>`
                : "")
            )
          )
          .addTo(map);
      });

      map.on("mouseenter", ids.circle, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ids.circle, () => { map.getCanvas().style.cursor = ""; });
    }

    setLayerVisibility([ids.circle], visible);
  }, [mapReady, activeLayers, landfills, upsertSource, setLayerVisibility, getPopup]);

  // ── Complaints ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ids = LAYER_IDS.complaints;
    const visible = activeLayers.includes("complaints");

    const statusStyles: Record<string, [string, string]> = {
      recibida: ["RECIBIDA", "#3b82f6"],
      en_proceso: ["EN PROCESO", "#f59e0b"],
      concluida: ["CONCLUIDA", "#22c55e"],
    };

    const geojson = toGeoJSON(complaints, (c) => ({
      id: c.id, type: c.type, description: c.description,
      municipality: c.municipality, state: c.state,
      status: c.status, date: c.date, resource: c.resource,
      statusText: (statusStyles[c.status] ?? ["DESCONOCIDO"])[0],
      statusColor: (statusStyles[c.status] ?? ["", "#6b7280"])[1],
    }));

    upsertSource(ids.source, geojson);

    if (!map.getLayer(ids.circle)) {
      map.addLayer({
        id: ids.circle,
        type: "circle",
        source: ids.source,
        paint: {
          "circle-color": "#f59e0b",
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.3)",
        },
      });

      map.on("click", ids.circle, (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties;
        const coords = (f.geometry as GeoJSON.Point).coordinates;
        getPopup()
          .setLngLat([coords[0], coords[1]])
          .setHTML(
            popupHtml(
              popupTitle(p.type as string) +
              `<div style="font-size:12px;color:#CBD5E1;margin:4px 0">${esc(p.description as string)}</div>` +
              popupSubtext(`${p.municipality}, ${p.state}`) +
              `<div style="display:flex;align-items:center;gap:8px;margin-top:8px">
                ${popupBadge(p.statusText as string, p.statusColor as string)}
                <span style="font-size:11px;color:#64748B;font-family:'JetBrains Mono',monospace">${esc(p.date as string)}</span>
              </div>`
            )
          )
          .addTo(map);
      });

      map.on("mouseenter", ids.circle, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", ids.circle, () => { map.getCanvas().style.cursor = ""; });
    }

    setLayerVisibility([ids.circle], visible);
  }, [mapReady, activeLayers, complaints, upsertSource, setLayerVisibility, getPopup]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
