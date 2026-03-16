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

// ── datos.gob.mx CKAN API ─────────────────────────────────────────────

const CKAN_BASE = "https://www.datos.gob.mx/api/3/action";

// CKAN resource IDs for environmental datasets
export const CKAN_RESOURCES = {
  /** CONAGUA hydrometric stations — 1,189 records with lat/lng */
  hydrometricStations: "3cfc549d-1aa4-4ee0-b4d4-82b21a19136f",
  /** CONAGUA dams — 210 records with lat/lng */
  dams: "35e8d001-6195-45c7-9a1c-58a8594fb3a1",
  /** SEMARNAT contaminated sites — 1,142 records with lat/lng */
  contaminatedSites: "3279942f-a39e-4556-80ab-7d0b8813b2e5",
  /** SEMARNAT remediated sites — 1,051 records with lat/lng */
  remediatedSites: "5194cd4a-35df-448f-ac83-69298fbc5b85",
  /** Emissions inventory by municipality — 10,521 records */
  emissionsInventory: "70dfeb69-065b-4ed4-8922-505602666250",
  /** PROFEPA industrial inspections by municipality — 1,224 records */
  profepaInspections: "1f32b1ed-922f-46f4-aa83-32c79132bcb4",
  /** PROFEPA pollution sources by municipality — 2,111 records */
  profepaSources: "ae955ad7-f85c-4b65-8dd2-5c9fabc626ed",
  /** PROFEPA environmental emergencies by municipality — 1,302 records */
  profepaEmergencies: "e811cd95-c5d5-423d-a96c-4efb843a9735",
} as const;

/**
 * Fetch records from the datos.gob.mx CKAN datastore API.
 * Supports pagination via limit/offset.
 */
export async function fetchCKAN(
  resourceId: string,
  limit = 1000,
  offset = 0
): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const url = `${CKAN_BASE}/datastore_search?resource_id=${resourceId}&limit=${limit}&offset=${offset}`;

  const res = await fetchWithTimeout(url, {
    timeoutMs: 15000,
    next: { revalidate: 86400 },
  } as RequestInit & { timeoutMs?: number });

  const json = await res.json();

  if (!json.success || !json.result) {
    throw new Error("CKAN API returned unsuccessful response");
  }

  return {
    records: json.result.records ?? [],
    total: json.result.total ?? 0,
  };
}

/**
 * Fetch ALL records from a CKAN resource, paginating automatically.
 * Caps at maxRecords to prevent runaway fetches.
 */
export async function fetchAllCKAN(
  resourceId: string,
  maxRecords = 5000
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  const allRecords: Record<string, unknown>[] = [];
  let offset = 0;

  while (offset < maxRecords) {
    const { records, total } = await fetchCKAN(resourceId, pageSize, offset);
    allRecords.push(...records);
    offset += pageSize;
    if (records.length < pageSize || allRecords.length >= total) break;
  }

  return allRecords;
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
