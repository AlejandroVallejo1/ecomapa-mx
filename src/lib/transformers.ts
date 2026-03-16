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
  Landfill,
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

// ── CKAN: CONAGUA Hydrometric Stations (water monitoring) ────────────

/**
 * Transform CKAN CONAGUA hydrometric stations into WaterQualityPoint[].
 * These are river monitoring stations — they don't have BOD/COD/TSS
 * measurements directly, but we display them as water monitoring points
 * with the river basin (cuenca) info.
 */
export function transformCKANHydrometricStations(
  records: Record<string, unknown>[]
): WaterQualityPoint[] {
  const points: WaterQualityPoint[] = [];

  for (const r of records) {
    try {
      const lat = num(r.latitud);
      const lng = num(r.longitud);
      if (lat === null || lng === null) continue;
      if (!validCoords(lat, lng)) continue;
      // Filter to Mexico bounds
      if (lat < 14.5 || lat > 33.0 || lng < -118.5 || lng > -86.5) continue;

      const name = String(r.nombre ?? r.clave ?? `Estación ${points.length + 1}`);
      const river = String(r.cuenca ?? r.region_hidrologica ?? "");
      const state = String(r.estado ?? "");

      points.push({
        id: `conagua-hydro-${r._id ?? points.length}`,
        name,
        river,
        state,
        lat,
        lng,
        bod: 0,
        cod: 0,
        tss: 0,
        quality: "buena",
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      // skip
    }
  }

  return points;
}

/**
 * Transform CKAN CONAGUA dams into WaterQualityPoint[].
 */
export function transformCKANDams(
  records: Record<string, unknown>[]
): WaterQualityPoint[] {
  const points: WaterQualityPoint[] = [];

  for (const r of records) {
    try {
      const lat = num(r.latitud);
      const lng = num(r.longitud);
      if (lat === null || lng === null) continue;
      if (!validCoords(lat, lng)) continue;
      if (lat < 14.5 || lat > 33.0 || lng < -118.5 || lng > -86.5) continue;

      const name = String(r.nombre ?? `Presa ${points.length + 1}`);
      const river = String(
        r.cuenca_de_disponibilidad ?? r.region_hidrologica ?? ""
      );
      const state = String(r.estado ?? "");

      points.push({
        id: `conagua-dam-${r._id ?? points.length}`,
        name: `Presa ${name}`,
        river,
        state,
        lat,
        lng,
        bod: 0,
        cod: 0,
        tss: 0,
        quality: "aceptable",
        lastUpdated: new Date().toISOString(),
      });
    } catch {
      // skip
    }
  }

  return points;
}

// ── CKAN: SEMARNAT Contaminated Sites → Landfill[] ──────────────────

/**
 * Transform CKAN contaminated/remediated sites into Landfill[].
 * Maps contamination types to our landfill type categories.
 */
export function transformCKANContaminatedSites(
  records: Record<string, unknown>[],
  isRemediated = false
): Landfill[] {
  const sites: Landfill[] = [];

  for (const r of records) {
    try {
      const lat = num(r.latitud);
      const lng = num(r.longitud);
      if (lat === null || lng === null) continue;
      if (!validCoords(lat, lng)) continue;
      if (lat < 14.5 || lat > 33.0 || lng < -118.5 || lng > -86.5) continue;

      const name = String(
        r.ubicacion ?? r.responsable_contaminacion ?? `Sitio ${sites.length + 1}`
      );
      const municipality = String(r.municipio ?? "");
      const state = String(r.estado ?? "");

      // Map modalidad_sitio_contaminado to our types
      const modalidad = String(r.modalidad_sitio_contaminado ?? "").toLowerCase();
      let type: Landfill["type"] = "sitio_controlado";
      if (
        modalidad.includes("abandono") ||
        modalidad.includes("pasivo") ||
        modalidad.includes("emergencia")
      ) {
        type = "tiradero_cielo_abierto";
      } else if (
        modalidad.includes("operación") ||
        modalidad.includes("activ")
      ) {
        type = "relleno_sanitario";
      }

      const status: Landfill["status"] = isRemediated
        ? "clausurado"
        : r.cuenta_programa_remediacion_aprobado
          ? "en_proceso"
          : "activo";

      const contaminant = String(r.contaminante_generico ?? r.contaminante_especifico ?? "");
      const event = String(r.tipo_evento ?? "");
      const displayName = contaminant
        ? `${name} — ${contaminant}${event ? ` (${event})` : ""}`
        : name;

      sites.push({
        id: `semarnat-${isRemediated ? "rem" : "cont"}-${r._id ?? sites.length}`,
        name: displayName,
        type,
        municipality,
        state,
        lat,
        lng,
        status,
      });
    } catch {
      // skip
    }
  }

  return sites;
}

// ── CKAN: Emissions Inventory → PollutantCompany[] ──────────────────

/**
 * Municipality centroid lookup for Mexico's largest cities.
 * Used when the dataset has municipality-level data but no lat/lng.
 */
const MUNICIPALITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "aguascalientes": { lat: 21.8818, lng: -102.2916 },
  "mexicali": { lat: 32.6245, lng: -115.4523 },
  "tijuana": { lat: 32.5149, lng: -117.0382 },
  "la paz": { lat: 24.1426, lng: -110.3128 },
  "campeche": { lat: 19.8301, lng: -90.5349 },
  "tuxtla gutiérrez": { lat: 16.7528, lng: -93.1152 },
  "tuxtla gutierrez": { lat: 16.7528, lng: -93.1152 },
  "chihuahua": { lat: 28.6353, lng: -106.0889 },
  "juárez": { lat: 31.6904, lng: -106.4245 },
  "juarez": { lat: 31.6904, lng: -106.4245 },
  "ciudad de méxico": { lat: 19.4326, lng: -99.1332 },
  "ciudad de mexico": { lat: 19.4326, lng: -99.1332 },
  "saltillo": { lat: 25.4232, lng: -100.9924 },
  "colima": { lat: 19.2452, lng: -103.7241 },
  "durango": { lat: 24.0277, lng: -104.6532 },
  "toluca": { lat: 19.2826, lng: -99.6557 },
  "león": { lat: 21.1250, lng: -101.6859 },
  "leon": { lat: 21.1250, lng: -101.6859 },
  "guanajuato": { lat: 21.0190, lng: -101.2574 },
  "chilpancingo": { lat: 17.5506, lng: -99.5024 },
  "acapulco": { lat: 16.8531, lng: -99.8237 },
  "pachuca": { lat: 20.1011, lng: -98.7591 },
  "guadalajara": { lat: 20.6597, lng: -103.3496 },
  "zapopan": { lat: 20.7231, lng: -103.3844 },
  "morelia": { lat: 19.7060, lng: -101.1950 },
  "cuernavaca": { lat: 18.9242, lng: -99.2216 },
  "tepic": { lat: 21.5041, lng: -104.8946 },
  "monterrey": { lat: 25.6866, lng: -100.3161 },
  "oaxaca": { lat: 17.0732, lng: -96.7266 },
  "puebla": { lat: 19.0414, lng: -98.2063 },
  "querétaro": { lat: 20.5888, lng: -100.3899 },
  "queretaro": { lat: 20.5888, lng: -100.3899 },
  "cancún": { lat: 21.1619, lng: -86.8515 },
  "cancun": { lat: 21.1619, lng: -86.8515 },
  "san luis potosí": { lat: 22.1565, lng: -100.9855 },
  "san luis potosi": { lat: 22.1565, lng: -100.9855 },
  "culiacán": { lat: 24.7994, lng: -107.3940 },
  "culiacan": { lat: 24.7994, lng: -107.3940 },
  "hermosillo": { lat: 29.0729, lng: -110.9559 },
  "villahermosa": { lat: 17.9893, lng: -92.9475 },
  "tampico": { lat: 22.2331, lng: -97.8611 },
  "ciudad victoria": { lat: 23.7369, lng: -99.1411 },
  "tlaxcala": { lat: 19.3181, lng: -98.2375 },
  "xalapa": { lat: 19.5438, lng: -96.9102 },
  "veracruz": { lat: 19.1738, lng: -96.1342 },
  "mérida": { lat: 20.9674, lng: -89.5926 },
  "merida": { lat: 20.9674, lng: -89.5926 },
  "zacatecas": { lat: 22.7709, lng: -102.5832 },
  "tula de allende": { lat: 20.0543, lng: -99.3539 },
  "tula": { lat: 20.0543, lng: -99.3539 },
  "tuxpan": { lat: 20.9596, lng: -97.3964 },
  "cadereyta jiménez": { lat: 25.5964, lng: -99.9833 },
  "cadereyta": { lat: 25.5964, lng: -99.9833 },
  "salamanca": { lat: 20.5737, lng: -101.1956 },
  "coatzacoalcos": { lat: 18.1344, lng: -94.4585 },
  "minatitlán": { lat: 17.9934, lng: -94.5475 },
  "minatitlan": { lat: 17.9934, lng: -94.5475 },
  "ecatepec": { lat: 19.6010, lng: -99.0500 },
  "naucalpan": { lat: 19.4784, lng: -99.2398 },
  "nezahualcóyotl": { lat: 19.4003, lng: -99.0114 },
  "nezahualcoyotl": { lat: 19.4003, lng: -99.0114 },
  "iztapalapa": { lat: 19.3558, lng: -99.0583 },
  "azcapotzalco": { lat: 19.4869, lng: -99.1837 },
  "apodaca": { lat: 25.7814, lng: -100.1886 },
  "san pedro garza garcía": { lat: 25.6614, lng: -100.4040 },
  "tonalá": { lat: 20.6232, lng: -103.2318 },
  "tonala": { lat: 20.6232, lng: -103.2318 },
};

/**
 * Look up approximate coords for a municipality/state pair.
 * Falls back to state capital if municipality not found.
 */
function lookupMunicipalityCoords(
  municipality: string,
  state: string
): { lat: number; lng: number } | null {
  const munNorm = municipality.toLowerCase().trim();
  const stateNorm = state.toLowerCase().trim();

  if (MUNICIPALITY_COORDS[munNorm]) return MUNICIPALITY_COORDS[munNorm];
  if (MUNICIPALITY_COORDS[stateNorm]) return MUNICIPALITY_COORDS[stateNorm];

  return null;
}

/**
 * Transform CKAN emissions inventory into PollutantCompany[].
 * Groups records by Entidad_federativa + Municipio and aggregates emissions.
 */
export function transformCKANEmissions(
  records: Record<string, unknown>[]
): PollutantCompany[] {
  // Group by municipality
  const grouped = new Map<
    string,
    {
      state: string;
      municipality: string;
      sourceType: string;
      emissions: Record<string, number>;
    }
  >();

  for (const r of records) {
    try {
      const state = String(r.Entidad_federativa ?? r.entidad_federativa ?? "");
      const municipality = String(r.Municipio ?? r.municipio ?? "");
      const sourceType = String(r.Tipo_de_Fuente ?? r.tipo_de_fuente ?? "");
      if (!state || !municipality) continue;

      const key = `${state}|${municipality}|${sourceType}`;

      if (!grouped.has(key)) {
        grouped.set(key, { state, municipality, sourceType, emissions: {} });
      }

      const entry = grouped.get(key)!;

      // Aggregate pollutant values
      const pollutants: [string, unknown][] = [
        ["SO2", r.SO_2 ?? r.so_2],
        ["CO", r.CO ?? r.co],
        ["NOx", r.NOx ?? r.nox],
        ["COV", r.COV ?? r.cov],
        ["PM10", r.PM_010 ?? r.pm_010],
        ["PM2.5", r.PM_2_5 ?? r.pm_2_5],
        ["NH3", r.NH_3 ?? r.nh_3],
      ];

      for (const [name, val] of pollutants) {
        const n = num(val);
        if (n !== null && n > 0) {
          entry.emissions[name] = (entry.emissions[name] ?? 0) + n;
        }
      }
    } catch {
      // skip
    }
  }

  const companies: PollutantCompany[] = [];

  for (const [, { state, municipality, sourceType, emissions }] of grouped) {
    const coords = lookupMunicipalityCoords(municipality, state);
    if (!coords) continue;

    const emissionsList = Object.entries(emissions)
      .filter(([, amt]) => amt > 0)
      .map(([substance, amount]) => ({
        substance,
        amount: Math.round(amount * 100) / 100,
        unit: "ton/año",
        medium: "aire" as const,
      }));

    if (emissionsList.length === 0) continue;

    companies.push({
      id: `inem-${companies.length}`,
      name: `${sourceType} — ${municipality}`,
      sector: sourceType,
      address: `${municipality}, ${state}`,
      municipality,
      state,
      lat: coords.lat + (Math.random() - 0.5) * 0.02, // jitter to avoid exact overlap
      lng: coords.lng + (Math.random() - 0.5) * 0.02,
      emissions: emissionsList,
      year: 2021,
    });
  }

  return companies;
}

// ── CKAN: PROFEPA Inspections → EnvironmentalComplaint[] ─────────────

/**
 * Transform CKAN PROFEPA industrial inspection data into complaints.
 * Each row = one municipality-level inspection record.
 */
export function transformCKANInspections(
  records: Record<string, unknown>[]
): EnvironmentalComplaint[] {
  const complaints: EnvironmentalComplaint[] = [];

  for (const r of records) {
    try {
      const state = String(r.Entidad_federativa ?? r.entidad_federativa ?? "");
      const municipality = String(r.Municipio ?? r.municipio ?? "");
      if (!state || !municipality) continue;

      const coords = lookupMunicipalityCoords(municipality, state);
      if (!coords) continue;

      const sourceType = String(r.Tipo_de_fuente ?? r.tipo_de_fuente ?? "Industrial");
      const year = numOr(r.Anio ?? r.anio, 2024);

      const irregularities = numOr(r.Con_irregularidades_leves, 0);
      const closures = numOr(r.Clausuras_parcial_temporal_CPT, 0) + numOr(r.Clausuras, 0);
      const clean = numOr(r.Sin_irregularidades, 0);

      // Determine status based on outcomes
      let status: EnvironmentalComplaint["status"] = "recibida";
      if (closures > 0) status = "concluida";
      else if (irregularities > 0) status = "en_proceso";

      // Determine resource based on source type
      let resource: EnvironmentalComplaint["resource"] = "suelo";
      const typeLower = sourceType.toLowerCase();
      if (typeLower.includes("atmosf") || typeLower.includes("aire")) resource = "aire";
      else if (typeLower.includes("agua") || typeLower.includes("hidr")) resource = "agua";
      else if (typeLower.includes("forest")) resource = "forestal";

      const description = [
        clean > 0 ? `${clean} sin irregularidades` : "",
        irregularities > 0 ? `${irregularities} con irregularidades` : "",
        closures > 0 ? `${closures} clausuras` : "",
      ]
        .filter(Boolean)
        .join(", ");

      if (!description) continue;

      complaints.push({
        id: `profepa-insp-${complaints.length}`,
        type: `Inspección: ${sourceType}`,
        description: `${municipality}: ${description}`,
        state,
        municipality,
        lat: coords.lat + (Math.random() - 0.5) * 0.015,
        lng: coords.lng + (Math.random() - 0.5) * 0.015,
        status,
        date: `${year}-01-01`,
        resource,
      });
    } catch {
      // skip
    }
  }

  return complaints;
}

/**
 * Transform CKAN PROFEPA environmental emergencies into complaints.
 */
export function transformCKANEmergencies(
  records: Record<string, unknown>[]
): EnvironmentalComplaint[] {
  const complaints: EnvironmentalComplaint[] = [];

  for (const r of records) {
    try {
      const state = String(r.Entidad_federativa ?? r.entidad_federativa ?? "");
      const municipality = String(r.Municipio ?? r.municipio ?? "");
      if (!state || !municipality) continue;

      const coords = lookupMunicipalityCoords(municipality, state);
      if (!coords) continue;

      const year = numOr(r.Anio ?? r.anio, 2024);
      const cause = String(r.Causa ?? r.causa ?? "");
      const location = String(r.Ubicacion ?? r.ubicacion ?? "");
      const emergency = String(r.Emergencia ?? r.emergencia ?? "");

      let resource: EnvironmentalComplaint["resource"] = "suelo";
      const causeLower = cause.toLowerCase();
      if (causeLower.includes("derrame") || causeLower.includes("agua")) resource = "agua";
      else if (causeLower.includes("fuga") || causeLower.includes("gas") || causeLower.includes("explos")) resource = "aire";
      else if (causeLower.includes("incendio") || causeLower.includes("forest")) resource = "forestal";

      complaints.push({
        id: `profepa-emrg-${complaints.length}`,
        type: `Emergencia: ${emergency || cause || "Ambiental"}`,
        description: location || `${municipality}, ${state}`,
        state,
        municipality,
        lat: coords.lat + (Math.random() - 0.5) * 0.015,
        lng: coords.lng + (Math.random() - 0.5) * 0.015,
        status: "concluida",
        date: `${year}-01-01`,
        resource,
      });
    } catch {
      // skip
    }
  }

  return complaints;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
