/**
 * Transform functions that convert raw external-API JSON into the
 * canonical app types defined in `@/types`.
 *
 * Every function is *defensive*: it silently skips records whose
 * required fields are null / undefined / NaN so that downstream code
 * never has to worry about partial data.
 */

import type {
  AirQualityStation,
  GeoPoint,
  WaterQualityPoint,
  PollutantCompany,
  EnvironmentalComplaint,
} from "@/types";
import { calculateAQI, aqiToCategory } from "@/lib/aqi-calculator";

// ── Helpers ───────────────────────────────────────────────────────────

/** Safe numeric coercion. Returns `null` for non-finite values. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Same as `num` but falls back to `fallback` instead of null. */
function numOr(v: unknown, fallback: number): number {
  const n = num(v);
  return n !== null ? n : fallback;
}

/** Returns true when both lat and lng look like valid coordinates. */
function validCoords(lat: unknown, lng: unknown): boolean {
  const la = num(lat);
  const lo = num(lng);
  return la !== null && lo !== null && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

// ── Haversine distance ────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two points in kilometres.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// ── OpenAQ v3 ─────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Transform a list of OpenAQ v3 `/locations` results (with embedded
 * latest measurements) into `AirQualityStation[]`.
 */
export function transformOpenAQLocations(raw: any): AirQualityStation[] {
  if (!raw?.results || !Array.isArray(raw.results)) return [];

  const stations: AirQualityStation[] = [];

  for (const loc of raw.results) {
    try {
      const lat = num(loc.coordinates?.latitude);
      const lng = num(loc.coordinates?.longitude);
      if (lat === null || lng === null) continue;
      if (!validCoords(lat, lng)) continue;

      // Build a map parameter -> latest value from sensors / latest
      const paramMap: Record<string, number> = {};
      const sensors: any[] = loc.sensors ?? loc.parameters ?? [];
      for (const s of sensors) {
        const pName =
          (s.parameter?.name ?? s.name ?? s.parameter ?? "").toString().toLowerCase();
        const val = num(s.latest?.value ?? s.lastValue ?? s.value);
        if (pName && val !== null) {
          paramMap[pName] = val;
        }
      }

      const pm25 = paramMap["pm25"] ?? paramMap["pm2.5"] ?? 0;
      const pm10 = paramMap["pm10"] ?? 0;
      const o3 = paramMap["o3"] ?? paramMap["ozone"] ?? 0;
      const no2 = paramMap["no2"] ?? 0;
      const so2 = paramMap["so2"] ?? 0;
      const co = paramMap["co"] ?? 0;

      const aqi = calculateAQI({ pm25, pm10, o3, no2, so2, co });

      const city =
        loc.locality ??
        loc.city?.name ??
        loc.city ??
        "";
      const state =
        loc.admin1 ??
        loc.country?.name ??
        "";

      stations.push({
        id: `openaq-${loc.id}`,
        name: loc.name || `Station ${loc.id}`,
        city: typeof city === "string" ? city : String(city),
        state: typeof state === "string" ? state : String(state),
        lat,
        lng,
        aqi,
        category: aqiToCategory(aqi),
        pm25,
        pm10,
        o3,
        no2,
        so2,
        co,
        source: "openaq",
        lastUpdated:
          loc.datetimeLast?.utc ??
          loc.lastUpdated ??
          new Date().toISOString(),
      });
    } catch {
      // skip malformed record
    }
  }

  return stations;
}

// ── AQICN ─────────────────────────────────────────────────────────────

/**
 * Transform the AQICN `/map/bounds` response into `AirQualityStation[]`.
 * Stations where `aqi` is `"-"` are skipped.
 */
export function transformAQICNStations(raw: any): AirQualityStation[] {
  if (!raw?.data && !Array.isArray(raw)) return [];

  const list: any[] = Array.isArray(raw) ? raw : raw.data ?? [];
  const stations: AirQualityStation[] = [];

  for (const entry of list) {
    try {
      const aqiVal = num(entry.aqi);
      if (aqiVal === null || aqiVal < 0) continue;

      const lat = num(entry.lat);
      const lng = num(entry.lon ?? entry.lng);
      if (lat === null || lng === null) continue;
      if (!validCoords(lat, lng)) continue;

      const stationName =
        typeof entry.station === "object"
          ? entry.station?.name ?? ""
          : String(entry.station ?? "");

      // AQICN doesn't provide per-pollutant values in map/bounds
      stations.push({
        id: `aqicn-${entry.uid ?? entry.idx ?? stations.length}`,
        name: stationName || `AQICN ${entry.uid ?? ""}`,
        city: "",
        state: "",
        lat,
        lng,
        aqi: Math.round(aqiVal),
        category: aqiToCategory(aqiVal),
        pm25: 0,
        pm10: 0,
        o3: 0,
        no2: 0,
        so2: 0,
        co: 0,
        source: "aqicn",
        lastUpdated: entry.utime ?? new Date().toISOString(),
      });
    } catch {
      // skip malformed record
    }
  }

  return stations;
}

// ── Merge air quality sources ─────────────────────────────────────────

/**
 * De-duplicate by haversine proximity (< 500 m = same station).
 * When two sources report the same station, OpenAQ is preferred because
 * it provides per-pollutant breakdown.
 */
export function mergeAirQualitySources(
  openaq: AirQualityStation[],
  aqicn: AirQualityStation[]
): AirQualityStation[] {
  const merged = [...openaq];
  const THRESHOLD_KM = 0.5;

  for (const aq of aqicn) {
    const isDuplicate = merged.some(
      (existing) => haversineDistance(existing, aq) < THRESHOLD_KM
    );
    if (!isDuplicate) {
      merged.push(aq);
    }
  }

  return merged;
}

// ── Water quality (datos.gob.mx / CONAGUA) ────────────────────────────

/**
 * Transform the datos.gob.mx CONAGUA/RENAMECA response into
 * `WaterQualityPoint[]`.
 */
export function transformWaterQuality(raw: any): WaterQualityPoint[] {
  if (!raw?.results && !Array.isArray(raw)) return [];
  const list: any[] = Array.isArray(raw) ? raw : raw.results ?? [];
  const points: WaterQualityPoint[] = [];

  for (const r of list) {
    try {
      const lat = num(r.latitud ?? r.lat);
      const lng = num(r.longitud ?? r.lng ?? r.lon);
      if (lat === null || lng === null) continue;
      if (!validCoords(lat, lng)) continue;

      const bod = numOr(r.dbo ?? r.bod, 0);
      const cod = numOr(r.dqo ?? r.cod, 0);
      const tss = numOr(r.sst ?? r.tss, 0);

      let quality: WaterQualityPoint["quality"] = "buena";
      if (bod > 120 || cod > 200) quality = "fuertemente_contaminada";
      else if (bod > 60 || cod > 100) quality = "contaminada";
      else if (bod > 30 || cod > 50) quality = "aceptable";

      // Override with source quality if present and valid
      const srcQuality = (r.calidad ?? r.quality ?? "").toString().toLowerCase();
      if (
        srcQuality === "buena" ||
        srcQuality === "aceptable" ||
        srcQuality === "contaminada" ||
        srcQuality === "fuertemente_contaminada"
      ) {
        quality = srcQuality as WaterQualityPoint["quality"];
      }

      points.push({
        id: `wq-${r._id ?? r.id ?? points.length}`,
        name:
          r.nombre_sitio ??
          r.nombre ??
          r.name ??
          `Punto ${points.length + 1}`,
        river:
          r.cuerpo_de_agua ?? r.rio ?? r.river ?? "",
        state: r.estado ?? r.state ?? "",
        lat,
        lng,
        bod,
        cod,
        tss,
        quality,
        lastUpdated:
          r.fecha ?? r.date ?? r.lastUpdated ?? new Date().toISOString(),
      });
    } catch {
      // skip
    }
  }

  return points;
}

// ── RETC (pollutant companies) ────────────────────────────────────────

/**
 * Transform the RETC / SEMARNAT response. Each raw row is one emission
 * record; rows belonging to the same company (by `nombre_empresa` or
 * `id`) are grouped so the output has one entry per company with an
 * `emissions` array.
 */
export function transformRetcCompanies(raw: any): PollutantCompany[] {
  if (!raw?.results && !Array.isArray(raw)) return [];
  const list: any[] = Array.isArray(raw) ? raw : raw.results ?? [];

  // Group by company key
  const grouped = new Map<string, { company: any; emissions: any[] }>();

  for (const r of list) {
    try {
      const key =
        r.nombre_empresa ??
        r.empresa ??
        r.name ??
        r._id ??
        "";
      if (!key) continue;

      if (!grouped.has(key)) {
        grouped.set(key, { company: r, emissions: [] });
      }

      const mediumStr = (r.medio ?? r.medium ?? "aire").toString().toLowerCase();
      let medium: "aire" | "agua" | "suelo" = "aire";
      if (mediumStr.includes("agua") || mediumStr === "water") medium = "agua";
      else if (mediumStr.includes("suelo") || mediumStr === "soil") medium = "suelo";

      grouped.get(key)!.emissions.push({
        substance: r.sustancia ?? r.substance ?? r.contaminante ?? "Desconocido",
        amount: numOr(r.cantidad ?? r.amount ?? r.emision, 0),
        unit: r.unidad ?? r.unit ?? "ton/anio",
        medium,
      });
    } catch {
      // skip
    }
  }

  const companies: PollutantCompany[] = [];

  for (const [, { company, emissions }] of grouped) {
    const lat = num(company.latitud ?? company.lat);
    const lng = num(company.longitud ?? company.lng ?? company.lon);
    if (lat === null || lng === null) continue;
    if (!validCoords(lat, lng)) continue;

    companies.push({
      id: `retc-${company._id ?? company.id ?? companies.length}`,
      name: company.nombre_empresa ?? company.empresa ?? company.name ?? "",
      sector: company.sector ?? company.giro ?? "",
      address: company.direccion ?? company.address ?? "",
      municipality:
        company.municipio ?? company.municipality ?? "",
      state: company.estado ?? company.state ?? "",
      lat,
      lng,
      emissions,
      year: numOr(company.anio ?? company.year ?? company.periodo, 0),
    });
  }

  return companies;
}

// ── PROFEPA (environmental complaints) ─────────────────────────────────

/**
 * Transform the PROFEPA denuncias response into
 * `EnvironmentalComplaint[]`.
 */
export function transformProfepaComplaints(raw: any): EnvironmentalComplaint[] {
  if (!raw?.results && !Array.isArray(raw)) return [];
  const list: any[] = Array.isArray(raw) ? raw : raw.results ?? [];
  const complaints: EnvironmentalComplaint[] = [];

  for (const r of list) {
    try {
      const lat = num(r.latitud ?? r.lat);
      const lng = num(r.longitud ?? r.lng ?? r.lon);
      if (lat === null || lng === null) continue;
      if (!validCoords(lat, lng)) continue;

      // Parse status
      const rawStatus = (r.estatus ?? r.status ?? "").toString().toLowerCase();
      let status: EnvironmentalComplaint["status"] = "recibida";
      if (rawStatus.includes("proceso") || rawStatus.includes("progress")) {
        status = "en_proceso";
      } else if (rawStatus.includes("conclu") || rawStatus.includes("closed")) {
        status = "concluida";
      }

      // Parse resource
      const rawResource = (
        r.recurso ?? r.resource ?? r.tipo_recurso ?? ""
      )
        .toString()
        .toLowerCase();
      let resource: EnvironmentalComplaint["resource"] = "suelo";
      if (rawResource.includes("agua") || rawResource.includes("water"))
        resource = "agua";
      else if (rawResource.includes("aire") || rawResource.includes("air"))
        resource = "aire";
      else if (rawResource.includes("forest") || rawResource.includes("forestal"))
        resource = "forestal";
      else if (rawResource.includes("fauna") || rawResource.includes("animal"))
        resource = "fauna";

      complaints.push({
        id: `profepa-${r._id ?? r.id ?? complaints.length}`,
        type: r.tipo ?? r.type ?? r.tipo_denuncia ?? "Denuncia ambiental",
        description:
          r.descripcion ?? r.description ?? r.motivo ?? "",
        state: r.estado ?? r.state ?? "",
        municipality:
          r.municipio ?? r.municipality ?? "",
        lat,
        lng,
        status,
        date:
          r.fecha ?? r.date ?? r.fecha_recepcion ?? new Date().toISOString(),
        resource,
      });
    } catch {
      // skip
    }
  }

  return complaints;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
