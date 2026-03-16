// Mexican Government & International API endpoints for environmental data

import type { AirQualityStation } from "@/types";
import { fetchWithTimeout } from "@/lib/api-helpers";
import {
  transformOpenAQLocations,
  transformAQICNStations,
  mergeAirQualitySources,
} from "@/lib/transformers";

// ── Base URLs ─────────────────────────────────────────────────────────

const OPENAQ_BASE = "https://api.openaq.org/v3";
const DATOS_GOB_BASE = "https://api.datos.gob.mx/v1";
const AQICN_BASE = "https://api.waqi.info";

// ── OpenAQ ────────────────────────────────────────────────────────────

/** Raw OpenAQ locations request (kept for backward compat with API route) */
export async function fetchAirQuality(lat?: number, lng?: number) {
  const params = new URLSearchParams({
    countries_id: "129", // Mexico
    limit: "100",
  });

  if (lat && lng) {
    params.set("coordinates", `${lat},${lng}`);
    params.set("radius", "50000"); // 50km radius
  }

  const res = await fetch(`${OPENAQ_BASE}/locations?${params}`, {
    headers: {
      "X-API-Key": process.env.OPENAQ_API_KEY || "",
    },
    next: { revalidate: 3600 }, // Cache 1 hour
  });

  if (!res.ok) throw new Error(`OpenAQ error: ${res.status}`);
  return res.json();
}

/** Raw latest measurements for a single location */
export async function fetchLatestMeasurements(locationId: number) {
  const res = await fetch(
    `${OPENAQ_BASE}/locations/${locationId}/latest`,
    {
      headers: {
        "X-API-Key": process.env.OPENAQ_API_KEY || "",
      },
      next: { revalidate: 1800 },
    }
  );

  if (!res.ok) throw new Error(`OpenAQ measurements error: ${res.status}`);
  return res.json();
}

/**
 * Fetch OpenAQ stations and transform into canonical AirQualityStation[].
 * Uses 30-minute Next.js cache.
 */
export async function fetchOpenAQStations(): Promise<AirQualityStation[]> {
  const params = new URLSearchParams({
    countries_id: "129",
    limit: "200",
  });

  const res = await fetchWithTimeout(
    `${OPENAQ_BASE}/locations?${params}`,
    {
      headers: { "X-API-Key": process.env.OPENAQ_API_KEY || "" },
      next: { revalidate: 1800 },
      timeoutMs: 10000,
    } as RequestInit & { timeoutMs?: number }
  );

  const json = await res.json();
  return transformOpenAQLocations(json);
}

// ── AQICN ─────────────────────────────────────────────────────────────

/** Raw AQICN map bounds request (kept for backward compat) */
export async function fetchAqicnMapData(
  latMin: number,
  lngMin: number,
  latMax: number,
  lngMax: number
) {
  const token = process.env.AQICN_API_KEY || "";
  const res = await fetch(
    `${AQICN_BASE}/map/bounds/?latlng=${latMin},${lngMin},${latMax},${lngMax}&token=${token}`,
    { next: { revalidate: 1800 } }
  );

  if (!res.ok) throw new Error(`AQICN error: ${res.status}`);
  return res.json();
}

/**
 * Fetch AQICN stations for all of Mexico and transform.
 * Uses 30-minute cache.
 */
export async function fetchAQICNStations(): Promise<AirQualityStation[]> {
  const token = process.env.AQICN_API_KEY || "";
  // Mexico bounding box: lat 14.5-33.0, lng -118.5 to -86.5
  const res = await fetchWithTimeout(
    `${AQICN_BASE}/map/bounds/?latlng=14.5,-118.5,33.0,-86.5&token=${token}`,
    {
      next: { revalidate: 1800 },
      timeoutMs: 10000,
    } as RequestInit & { timeoutMs?: number }
  );

  const json = await res.json();
  return transformAQICNStations(json);
}

// ── Merged live air quality ───────────────────────────────────────────

/**
 * Fetch from both OpenAQ and AQICN in parallel, merge results.
 * If one source fails the other still contributes.
 */
export async function fetchLiveAirQuality(): Promise<AirQualityStation[]> {
  const [openaqResult, aqicnResult] = await Promise.allSettled([
    fetchOpenAQStations(),
    fetchAQICNStations(),
  ]);

  const openaq =
    openaqResult.status === "fulfilled" ? openaqResult.value : [];
  const aqicn =
    aqicnResult.status === "fulfilled" ? aqicnResult.value : [];

  return mergeAirQualitySources(openaq, aqicn);
}

// ── datos.gob.mx ──────────────────────────────────────────────────────

/** Generic datos.gob.mx CKAN fetch */
export async function fetchDatosGob(query: string, limit = 50) {
  const res = await fetch(
    `${DATOS_GOB_BASE}/${query}?pageSize=${limit}`,
    { next: { revalidate: 86400 } } // Cache 24 hours
  );

  if (!res.ok) throw new Error(`datos.gob.mx error: ${res.status}`);
  return res.json();
}

/** CONAGUA water quality data */
export async function fetchWaterQuality() {
  return fetchDatosGob("conagua.gob.mx-RENAMECA");
}

/** RETC - Pollutant companies registry */
export async function fetchRetcData() {
  return fetchDatosGob("semarnat.gob.mx-RETC");
}

/** PROFEPA - Environmental complaints */
export async function fetchComplaintsData() {
  return fetchDatosGob("profepa.gob.mx-denuncias");
}

// ── Color / label helpers (used by MapView & Sidebar) ─────────────────

export function getAqiColor(aqi: number): string {
  if (aqi <= 50) return "#00e400"; // Buena
  if (aqi <= 100) return "#ffff00"; // Aceptable
  if (aqi <= 150) return "#ff7e00"; // Dañina para grupos sensibles
  if (aqi <= 200) return "#ff0000"; // Dañina
  if (aqi <= 300) return "#8f3f97"; // Muy dañina
  return "#7e0023"; // Peligrosa
}

export function getAqiLabel(aqi: number): string {
  if (aqi <= 50) return "Buena";
  if (aqi <= 100) return "Aceptable";
  if (aqi <= 150) return "Dañina para grupos sensibles";
  if (aqi <= 200) return "Dañina";
  if (aqi <= 300) return "Muy dañina";
  return "Peligrosa";
}

export function getWaterQualityColor(quality: string): string {
  switch (quality) {
    case "buena":
      return "#22c55e";
    case "aceptable":
      return "#eab308";
    case "contaminada":
      return "#f97316";
    case "fuertemente_contaminada":
      return "#ef4444";
    default:
      return "#6b7280";
  }
}

// ── Mexican states list for filters ───────────────────────────────────

export const MEXICAN_STATES = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima",
  "Durango", "Estado de México", "Guanajuato", "Guerrero", "Hidalgo",
  "Jalisco", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca",
  "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa",
  "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán",
  "Zacatecas",
] as const;
