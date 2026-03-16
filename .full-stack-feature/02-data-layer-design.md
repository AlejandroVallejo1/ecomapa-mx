# EcoMapa MX -- Data Layer Design Document

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [TypeScript Interfaces -- Internal Data Models](#2-typescript-interfaces--internal-data-models)
3. [External API Response Shapes & Transformation Logic](#3-external-api-response-shapes--transformation-logic)
4. [Caching Strategy](#4-caching-strategy)
5. [Data Flow Architecture](#5-data-flow-architecture)
6. [Error Handling & Resilience](#6-error-handling--resilience)
7. [Search, Filter & Layer Toggle Data Model](#7-search-filter--layer-toggle-data-model)
8. [File Layout](#8-file-layout)

---

## 1. Architecture Overview

EcoMapa MX is a **read-only API aggregation layer** with no persistent database.
Every request follows the same pipeline:

```
Browser  -->  Next.js API Route  -->  External API(s)
                   |                        |
                   |   <-- transform() <----|
                   |
                   +--> Next.js fetch cache (revalidate TTL)
                   |
                   +--> JSON response to client
```

The Next.js **fetch cache** (built into the runtime on Vercel) is the *only*
caching layer. There is no Redis, no database, no in-memory singleton across
invocations -- serverless functions are stateless. The `next: { revalidate: N }`
option on each `fetch()` call is what gives us cache behaviour.

Three external API families are consumed:

| Provider | Protocol | Auth | Rate Limits |
|---|---|---|---|
| **OpenAQ v3** | REST JSON | API key header (`X-API-Key`) | 5 req/s free tier |
| **AQICN / WAQI** | REST JSON | Token query param | 1000 req/day free |
| **datos.gob.mx** (CKAN) | REST JSON | None | ~60 req/min (undocumented) |

---

## 2. TypeScript Interfaces -- Internal Data Models

All internal types live in `src/types/index.ts`. These are the **normalized**
shapes that every API route returns to the client, regardless of which external
API provided the raw data.

### 2.1 Shared Primitives

```typescript
// src/types/index.ts

/** Every geo-located record on the map shares this shape. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Standardised wrapper every API route returns. */
export interface ApiResponse<T> {
  results: T[];
  meta: {
    source: DataSource;
    fetchedAt: string;        // ISO-8601
    cached: boolean;
    totalResults: number;
    /** If the upstream API failed and we fell back to sample data */
    fallback: boolean;
  };
}

export type DataSource =
  | "openaq"
  | "aqicn"
  | "datos.gob.mx"
  | "cec-atlas"
  | "sample";

export type MapLayer =
  | "air-quality"
  | "water-quality"
  | "recycling"
  | "pollutants"
  | "landfills"
  | "complaints";
```

### 2.2 Air Quality

```typescript
export type AqiCategory =
  | "buena"            // 0-50
  | "aceptable"        // 51-100
  | "danina_sensibles" // 101-150
  | "danina"           // 151-200
  | "muy_danina"       // 201-300
  | "peligrosa";       // 301+

export interface AirQualityStation extends GeoPoint {
  id: string;
  name: string;
  city: string;
  state: string;
  /** Composite AQI (US EPA scale, max of sub-indices) */
  aqi: number;
  category: AqiCategory;
  /** Individual pollutant concentrations. null = not measured. */
  pm25: number | null;   // ug/m3
  pm10: number | null;   // ug/m3
  o3: number | null;     // ppb
  no2: number | null;    // ppb
  so2: number | null;    // ppb
  co: number | null;     // ppm
  /** Which upstream API provided this record */
  source: "openaq" | "aqicn";
  lastUpdated: string;   // ISO-8601
}
```

### 2.3 Water Quality

```typescript
export type WaterQualityLevel =
  | "buena"
  | "aceptable"
  | "contaminada"
  | "fuertemente_contaminada";

export interface WaterQualityPoint extends GeoPoint {
  id: string;
  name: string;
  bodyOfWater: string;   // river, lake, etc.
  state: string;
  municipality: string;
  /** Biochemical Oxygen Demand (mg/L). null if not reported. */
  bod: number | null;
  /** Chemical Oxygen Demand (mg/L) */
  cod: number | null;
  /** Total Suspended Solids (mg/L) */
  tss: number | null;
  /** Dissolved oxygen (mg/L) */
  dissolvedOxygen: number | null;
  /** Derived from BOD per CONAGUA classification */
  quality: WaterQualityLevel;
  lastUpdated: string;
}
```

### 2.4 Pollutant Companies (RETC)

```typescript
export type EmissionMedium = "aire" | "agua" | "suelo";

export interface Emission {
  substance: string;      // e.g. "SO2", "NOx", "PM10", "COV"
  amount: number;         // numeric quantity
  unit: string;           // "ton/ano", "kg/ano"
  medium: EmissionMedium;
}

export interface PollutantCompany extends GeoPoint {
  id: string;
  name: string;
  sector: string;           // "Petroleo y Gas", "Cemento", etc.
  address: string;
  municipality: string;
  state: string;
  emissions: Emission[];
  reportingYear: number;
  /** NRA or RETC registry number */
  registryNumber: string | null;
}
```

### 2.5 Recycling Centers

```typescript
export interface RecyclingCenter extends GeoPoint {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  /** Accepted material types */
  materials: string[];
  phone: string | null;
  schedule: string | null;
  /** Whether the center is currently verified as operating */
  verified: boolean;
}
```

### 2.6 Landfills

```typescript
export type LandfillType =
  | "relleno_sanitario"
  | "tiradero_cielo_abierto"
  | "sitio_controlado";

export type LandfillStatus = "activo" | "clausurado" | "en_proceso";

export interface Landfill extends GeoPoint {
  id: string;
  name: string;
  type: LandfillType;
  municipality: string;
  state: string;
  /** Total capacity in metric tons (null if unknown) */
  capacity: number | null;
  status: LandfillStatus;
  /** Year the data was reported or last updated */
  dataYear: number | null;
}
```

### 2.7 Environmental Complaints

```typescript
export type ComplaintStatus = "recibida" | "en_proceso" | "concluida";

export type AffectedResource =
  | "agua"
  | "aire"
  | "suelo"
  | "forestal"
  | "fauna"
  | "residuos";

export interface EnvironmentalComplaint extends GeoPoint {
  id: string;
  complaintType: string;      // category, e.g. "Descarga de aguas residuales"
  description: string;
  state: string;
  municipality: string;
  status: ComplaintStatus;
  filedDate: string;          // ISO-8601 date
  resolvedDate: string | null;
  affectedResource: AffectedResource;
}
```

---

## 3. External API Response Shapes & Transformation Logic

### 3.1 OpenAQ v3 -- Air Quality

**Endpoint:** `GET https://api.openaq.org/v3/locations?countries_id=129&limit=100`

**Raw response shape:**

```typescript
// src/types/external/openaq.ts

interface OpenAQResponse {
  meta: {
    name: string;
    website: string;
    page: number;
    limit: number;
    found: number;
  };
  results: OpenAQLocation[];
}

interface OpenAQLocation {
  id: number;
  name: string;
  locality: string | null;       // city
  timezone: string;
  country: {
    id: number;
    code: string;                // "MX"
    name: string;
  };
  owner: { id: number; name: string };
  provider: { id: number; name: string };
  isMobile: boolean;
  isMonitor: boolean;
  instruments: { id: number; name: string }[];
  sensors: OpenAQSensor[];
  coordinates: {
    latitude: number;
    longitude: number;
  };
  bounds: [number, number, number, number];
  distance: number | null;
  datetimeFirst: { utc: string; local: string };
  datetimeLast: { utc: string; local: string };
}

interface OpenAQSensor {
  id: number;
  name: string;
  parameter: {
    id: number;
    name: string;              // "pm25", "pm10", "o3", "no2", "so2", "co"
    units: string;             // "ug/m3", "ppb", "ppm"
    displayName: string;
  };
}
```

**Latest measurements endpoint:** `GET https://api.openaq.org/v3/locations/{id}/latest`

```typescript
interface OpenAQLatestResponse {
  results: {
    sensorsId: number;
    datetime: { utc: string; local: string };
    value: number;
    coordinates: { latitude: number; longitude: number };
    parameter: {
      id: number;
      name: string;
      units: string;
    };
  }[];
}
```

**Transformation: `transformOpenAQ()`**

```typescript
// src/lib/transformers/air-quality.ts

import type { AirQualityStation, AqiCategory } from "@/types";

// Map OpenAQ parameter names to our field names
const PARAM_MAP: Record<string, keyof Pick<
  AirQualityStation, "pm25" | "pm10" | "o3" | "no2" | "so2" | "co"
>> = {
  pm25: "pm25",
  "pm2.5": "pm25",
  pm10: "pm10",
  o3: "o3",
  no2: "no2",
  so2: "so2",
  co: "co",
};

/**
 * Merges location metadata with its latest measurements into our internal type.
 * Called once per location after both the /locations and /locations/{id}/latest
 * calls resolve.
 */
export function transformOpenAQLocation(
  location: OpenAQLocation,
  latestMeasurements: OpenAQLatestResponse["results"]
): AirQualityStation {
  // Build pollutant values map
  const values: Record<string, number> = {};
  for (const m of latestMeasurements) {
    const key = PARAM_MAP[m.parameter.name.toLowerCase()];
    if (key) values[key] = m.value;
  }

  const aqi = calculateAQI(values);

  return {
    id: `openaq-${location.id}`,
    name: location.name,
    city: location.locality || "Desconocida",
    state: inferStateFromCoordinates(
      location.coordinates.latitude,
      location.coordinates.longitude
    ),
    lat: location.coordinates.latitude,
    lng: location.coordinates.longitude,
    aqi,
    category: aqiToCategory(aqi),
    pm25: values.pm25 ?? null,
    pm10: values.pm10 ?? null,
    o3: values.o3 ?? null,
    no2: values.no2 ?? null,
    so2: values.so2 ?? null,
    co: values.co ?? null,
    source: "openaq",
    lastUpdated: location.datetimeLast.utc,
  };
}

/**
 * Simplified AQI calculation based on US EPA breakpoints.
 * Uses the maximum sub-index across available pollutants.
 */
function calculateAQI(values: Record<string, number>): number {
  const subIndices: number[] = [];

  if (values.pm25 != null) {
    subIndices.push(linearScale(values.pm25, PM25_BREAKPOINTS));
  }
  if (values.pm10 != null) {
    subIndices.push(linearScale(values.pm10, PM10_BREAKPOINTS));
  }
  if (values.o3 != null) {
    subIndices.push(linearScale(values.o3, O3_BREAKPOINTS));
  }
  // ... additional pollutants

  return subIndices.length > 0 ? Math.max(...subIndices) : 0;
}

function aqiToCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return "buena";
  if (aqi <= 100) return "aceptable";
  if (aqi <= 150) return "danina_sensibles";
  if (aqi <= 200) return "danina";
  if (aqi <= 300) return "muy_danina";
  return "peligrosa";
}
```

### 3.2 AQICN / WAQI -- Air Quality (Backup)

**Endpoint:** `GET https://api.waqi.info/map/bounds/?latlng={latMin},{lngMin},{latMax},{lngMax}&token={token}`

**Raw response shape:**

```typescript
// src/types/external/aqicn.ts

interface AQICNMapResponse {
  status: "ok" | "error";
  data: AQICNStation[];
}

interface AQICNStation {
  lat: number;
  lon: number;
  uid: number;           // unique station id
  aqi: string;           // AQI as string (can be "-" if unavailable)
  station: {
    name: string;        // e.g. "Pedregal, Mexico City, Mexico"
    time: string;        // ISO-8601
  };
}
```

**Transformation: `transformAQICN()`**

```typescript
// src/lib/transformers/air-quality.ts

export function transformAQICNStation(
  raw: AQICNStation
): AirQualityStation | null {
  const aqiNum = parseInt(raw.aqi, 10);
  if (isNaN(aqiNum)) return null;   // skip stations with no data

  // Parse station name -- AQICN uses "Station, City, Country"
  const parts = raw.station.name.split(",").map((s) => s.trim());
  const stationName = parts[0] || "Estacion desconocida";
  const city = parts[1] || "Desconocida";

  return {
    id: `aqicn-${raw.uid}`,
    name: stationName,
    city,
    state: inferStateFromCity(city),
    lat: raw.lat,
    lng: raw.lon,
    aqi: aqiNum,
    category: aqiToCategory(aqiNum),
    // AQICN map/bounds only returns composite AQI, not individual pollutants
    pm25: null,
    pm10: null,
    o3: null,
    no2: null,
    so2: null,
    co: null,
    source: "aqicn",
    lastUpdated: raw.station.time,
  };
}

/**
 * Merge OpenAQ + AQICN results, deduplicating by proximity.
 * If two stations from different sources are within 500m of each other,
 * prefer the OpenAQ record (it has individual pollutant readings).
 */
export function mergeAirQualitySources(
  openaq: AirQualityStation[],
  aqicn: AirQualityStation[]
): AirQualityStation[] {
  const merged = [...openaq];
  const DEDUP_RADIUS_KM = 0.5;

  for (const station of aqicn) {
    const isDuplicate = merged.some(
      (existing) =>
        haversineDistance(existing, station) < DEDUP_RADIUS_KM
    );
    if (!isDuplicate) {
      merged.push(station);
    }
  }

  return merged;
}
```

### 3.3 datos.gob.mx (CKAN) -- Water Quality (CONAGUA / RENAMECA)

**Endpoint:** `GET https://api.datos.gob.mx/v1/conagua.gob.mx-RENAMECA?pageSize=100`

The datos.gob.mx wrapper returns a generic envelope. The actual field names
inside each record depend on the dataset. For CONAGUA/RENAMECA water quality:

**Raw response shape:**

```typescript
// src/types/external/datos-gob.ts

interface DatosGobResponse<T = Record<string, unknown>> {
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  results: T[];
}

// CONAGUA RENAMECA specific record
interface ConaguaWaterRecord {
  _id: string;
  estacion: string;                // station name
  cuerpo_de_agua: string;          // body of water
  estado: string;
  municipio: string;
  latitud: string | number;
  longitud: string | number;
  fecha_muestreo: string;          // "2025-06-15"
  dbo5: string | number | null;    // BOD mg/L
  dqo: string | number | null;     // COD mg/L
  sst: string | number | null;     // TSS mg/L
  oxigeno_disuelto: string | number | null;
  clasificacion: string;           // "Buena", "Aceptable", etc.
}
```

**Transformation: `transformWaterQuality()`**

```typescript
// src/lib/transformers/water-quality.ts

import type { WaterQualityPoint, WaterQualityLevel } from "@/types";

const QUALITY_MAP: Record<string, WaterQualityLevel> = {
  buena: "buena",
  aceptable: "aceptable",
  contaminada: "contaminada",
  "fuertemente contaminada": "fuertemente_contaminada",
  "altamente contaminada": "fuertemente_contaminada",
};

export function transformConaguaRecord(
  raw: ConaguaWaterRecord
): WaterQualityPoint | null {
  const lat = parseFloat(String(raw.latitud));
  const lng = parseFloat(String(raw.longitud));

  // Skip records with invalid coordinates
  if (isNaN(lat) || isNaN(lng)) return null;
  // Basic bounds check for Mexico
  if (lat < 14 || lat > 33 || lng < -120 || lng > -86) return null;

  const bod = parseNumericField(raw.dbo5);
  const cod = parseNumericField(raw.dqo);
  const tss = parseNumericField(raw.sst);
  const dissolvedOxygen = parseNumericField(raw.oxigeno_disuelto);

  // Derive quality from classification text, or compute from BOD if missing
  const quality = deriveWaterQuality(raw.clasificacion, bod);

  return {
    id: `wq-${raw._id}`,
    name: raw.estacion || "Estacion sin nombre",
    bodyOfWater: raw.cuerpo_de_agua || "No especificado",
    state: normalizeStateName(raw.estado),
    municipality: raw.municipio || "",
    lat,
    lng,
    bod,
    cod,
    tss,
    dissolvedOxygen,
    quality,
    lastUpdated: raw.fecha_muestreo || new Date().toISOString(),
  };
}

function deriveWaterQuality(
  classification: string | undefined,
  bod: number | null
): WaterQualityLevel {
  // Try to use the API-provided classification first
  if (classification) {
    const normalized = classification.toLowerCase().trim();
    if (QUALITY_MAP[normalized]) return QUALITY_MAP[normalized];
  }

  // Fallback: derive from BOD using CONAGUA thresholds
  if (bod === null) return "aceptable"; // conservative default
  if (bod <= 3) return "buena";
  if (bod <= 6) return "aceptable";
  if (bod <= 30) return "contaminada";
  return "fuertemente_contaminada";
}

function parseNumericField(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return isNaN(n) ? null : n;
}
```

### 3.4 datos.gob.mx (CKAN) -- RETC Pollutant Companies

**Endpoint:** `GET https://api.datos.gob.mx/v1/semarnat.gob.mx-RETC?pageSize=100`

**Raw response shape:**

```typescript
// RETC specific record from datos.gob.mx
interface RetcRecord {
  _id: string;
  nombre_establecimiento: string;
  sector_industrial: string;
  domicilio: string;
  municipio: string;
  entidad_federativa: string;
  latitud: string | number;
  longitud: string | number;
  sustancia: string;              // "Dioxido de azufre"
  cantidad: string | number;
  unidad: string;                 // "ton/ano"
  medio_receptor: string;         // "Aire", "Agua", "Suelo"
  anio_reporte: string | number;
  numero_registro: string | null;
}
```

**Transformation: `transformRetcRecords()`**

Because RETC data has one row per emission per company, we must **group by
company** and aggregate emissions into an array:

```typescript
// src/lib/transformers/pollutant-companies.ts

import type { PollutantCompany, Emission, EmissionMedium } from "@/types";

const MEDIUM_MAP: Record<string, EmissionMedium> = {
  aire: "aire",
  agua: "agua",
  suelo: "suelo",
  atmosfera: "aire",
};

export function transformRetcRecords(
  rawRecords: RetcRecord[]
): PollutantCompany[] {
  // Group by company name + state (some companies have multiple sites)
  const grouped = new Map<string, {
    first: RetcRecord;
    emissions: Emission[];
  }>();

  for (const rec of rawRecords) {
    const key = `${rec.nombre_establecimiento}|${rec.entidad_federativa}|${rec.municipio}`;

    if (!grouped.has(key)) {
      grouped.set(key, { first: rec, emissions: [] });
    }

    const medium = MEDIUM_MAP[rec.medio_receptor?.toLowerCase()] || "aire";
    const amount = parseNumericField(rec.cantidad);

    if (amount !== null && rec.sustancia) {
      grouped.get(key)!.emissions.push({
        substance: rec.sustancia,
        amount,
        unit: rec.unidad || "ton/ano",
        medium,
      });
    }
  }

  const results: PollutantCompany[] = [];

  for (const [, { first, emissions }] of grouped) {
    const lat = parseFloat(String(first.latitud));
    const lng = parseFloat(String(first.longitud));
    if (isNaN(lat) || isNaN(lng)) continue;

    results.push({
      id: `retc-${first._id}`,
      name: first.nombre_establecimiento,
      sector: first.sector_industrial || "No especificado",
      address: first.domicilio || "",
      municipality: first.municipio || "",
      state: normalizeStateName(first.entidad_federativa),
      lat,
      lng,
      emissions,
      reportingYear: parseInt(String(first.anio_reporte)) || new Date().getFullYear(),
      registryNumber: first.numero_registro || null,
    });
  }

  return results;
}
```

### 3.5 datos.gob.mx (CKAN) -- PROFEPA Environmental Complaints

**Endpoint:** `GET https://api.datos.gob.mx/v1/profepa.gob.mx-denuncias?pageSize=100`

**Raw response shape:**

```typescript
interface ProfepaDenunciaRecord {
  _id: string;
  tipo_denuncia: string;
  descripcion: string;
  entidad_federativa: string;
  municipio: string;
  latitud: string | number;
  longitud: string | number;
  estatus: string;           // "Recibida", "En proceso", "Concluida"
  fecha_recepcion: string;   // "2026-01-15"
  fecha_conclusion: string | null;
  recurso_afectado: string;  // "Agua", "Aire", "Suelo", etc.
}
```

**Transformation:**

```typescript
// src/lib/transformers/complaints.ts

import type {
  EnvironmentalComplaint,
  ComplaintStatus,
  AffectedResource,
} from "@/types";

const STATUS_MAP: Record<string, ComplaintStatus> = {
  recibida: "recibida",
  "en proceso": "en_proceso",
  "en tramite": "en_proceso",
  concluida: "concluida",
  cerrada: "concluida",
};

const RESOURCE_MAP: Record<string, AffectedResource> = {
  agua: "agua",
  aire: "aire",
  atmosfera: "aire",
  suelo: "suelo",
  forestal: "forestal",
  fauna: "fauna",
  "vida silvestre": "fauna",
  residuos: "residuos",
  "residuos peligrosos": "residuos",
};

export function transformProfepaDenuncia(
  raw: ProfepaDenunciaRecord
): EnvironmentalComplaint | null {
  const lat = parseFloat(String(raw.latitud));
  const lng = parseFloat(String(raw.longitud));
  if (isNaN(lat) || isNaN(lng)) return null;

  const statusKey = raw.estatus?.toLowerCase().trim();
  const resourceKey = raw.recurso_afectado?.toLowerCase().trim();

  return {
    id: `profepa-${raw._id}`,
    complaintType: raw.tipo_denuncia || "No especificado",
    description: raw.descripcion || "",
    state: normalizeStateName(raw.entidad_federativa),
    municipality: raw.municipio || "",
    lat,
    lng,
    status: STATUS_MAP[statusKey] || "recibida",
    filedDate: raw.fecha_recepcion || "",
    resolvedDate: raw.fecha_conclusion || null,
    affectedResource: RESOURCE_MAP[resourceKey] || "suelo",
  };
}
```

### 3.6 Recycling Centers & Landfills

These two layers do not have reliable, structured APIs with lat/lng data.
The strategy is:

| Layer | Primary Source | Fallback |
|---|---|---|
| Recycling centers | datos.gob.mx search for "centros acopio reciclaje" | Curated sample-data.ts |
| Landfills | CEC North American Atlas GeoJSON (static file) | Curated sample-data.ts |

**Recycling centers** -- if a CKAN dataset is found:

```typescript
interface RecyclingRawRecord {
  _id: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  estado: string;
  latitud: string | number;
  longitud: string | number;
  materiales: string;        // comma-separated: "PET, Carton, Vidrio"
  telefono: string | null;
  horario: string | null;
}

export function transformRecyclingRecord(
  raw: RecyclingRawRecord
): RecyclingCenter | null {
  const lat = parseFloat(String(raw.latitud));
  const lng = parseFloat(String(raw.longitud));
  if (isNaN(lat) || isNaN(lng)) return null;

  return {
    id: `rc-${raw._id}`,
    name: raw.nombre || "Centro de reciclaje",
    address: raw.direccion || "",
    city: raw.ciudad || "",
    state: normalizeStateName(raw.estado),
    lat,
    lng,
    materials: raw.materiales
      ? raw.materiales.split(",").map((m) => m.trim()).filter(Boolean)
      : [],
    phone: raw.telefono || null,
    schedule: raw.horario || null,
    verified: true,
  };
}
```

**Landfills** -- CEC Atlas provides GeoJSON:

```typescript
// The CEC North American Atlas provides a GeoJSON FeatureCollection.
// We ship a trimmed copy in /public/data/landfills-mexico.geojson
// containing only Mexico features.

interface CECLandfillFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    NAME: string;
    TYPE: string;     // "Sanitary Landfill", "Open Dump", "Controlled Site"
    STATE: string;
    MUNICIPALI: string;
    STATUS: string;   // "Active", "Closed", "In Progress"
    CAPACITY: number | null;
    YEAR: number | null;
  };
}

const TYPE_MAP: Record<string, LandfillType> = {
  "sanitary landfill": "relleno_sanitario",
  "open dump": "tiradero_cielo_abierto",
  "controlled site": "sitio_controlado",
};

const STATUS_MAP_LF: Record<string, LandfillStatus> = {
  active: "activo",
  closed: "clausurado",
  "in progress": "en_proceso",
};

export function transformCECFeature(
  feature: CECLandfillFeature
): Landfill {
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties;

  return {
    id: `cec-${props.NAME}-${lat.toFixed(3)}`,
    name: props.NAME,
    type: TYPE_MAP[props.TYPE?.toLowerCase()] || "relleno_sanitario",
    municipality: props.MUNICIPALI || "",
    state: normalizeStateName(props.STATE),
    lat,
    lng,
    capacity: props.CAPACITY,
    status: STATUS_MAP_LF[props.STATUS?.toLowerCase()] || "activo",
    dataYear: props.YEAR || null,
  };
}
```

### 3.7 Shared Utility: State Name Normalization

The various APIs return state names in different formats. A normalizer maps all
variants to the canonical 32-state list:

```typescript
// src/lib/transformers/shared.ts

const STATE_ALIASES: Record<string, string> = {
  "cdmx": "Ciudad de Mexico",
  "ciudad de mexico": "Ciudad de Mexico",
  "distrito federal": "Ciudad de Mexico",
  "d.f.": "Ciudad de Mexico",
  "edomex": "Estado de Mexico",
  "estado de mexico": "Estado de Mexico",
  "mexico": "Estado de Mexico",   // when ambiguous, assume the state
  "nuevo leon": "Nuevo Leon",
  "n.l.": "Nuevo Leon",
  "san luis potosi": "San Luis Potosi",
  "s.l.p.": "San Luis Potosi",
  "baja california sur": "Baja California Sur",
  "baja california": "Baja California",
  "b.c.": "Baja California",
  "b.c.s.": "Baja California Sur",
  "quintana roo": "Quintana Roo",
  "q. roo": "Quintana Roo",
  // ... full map for all 32 states and common abbreviations
};

export function normalizeStateName(raw: string): string {
  if (!raw) return "Desconocido";
  const key = raw.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
  return STATE_ALIASES[key] || titleCase(raw.trim());
}
```

---

## 4. Caching Strategy

### 4.1 Design Principle

All caching is done through **Next.js `fetch()` with the `next.revalidate`
option** (ISR-style stale-while-revalidate). This is the only caching primitive
available on Vercel serverless. There is no Redis, no database, no global
in-memory store.

### 4.2 TTL Matrix

| Data Layer | Upstream API | Revalidate (seconds) | Rationale |
|---|---|---|---|
| Air quality (OpenAQ) | api.openaq.org | **1800** (30 min) | Measurements update hourly; 30 min balances freshness vs rate limits |
| Air quality (AQICN) | api.waqi.info | **1800** (30 min) | Same reasoning; also limits token usage |
| Water quality | datos.gob.mx | **86400** (24 hr) | CONAGUA data updates monthly at best |
| Pollutant companies | datos.gob.mx | **86400** (24 hr) | RETC registry is annual |
| Recycling centers | datos.gob.mx | **86400** (24 hr) | Directory data, rarely changes |
| Landfills | Static GeoJSON | **604800** (7 days) | Static file bundled in `/public` |
| Complaints | datos.gob.mx | **43200** (12 hr) | Complaints filed daily, moderate update cadence |

### 4.3 Cache Key Strategy

Next.js generates cache keys from the full `fetch()` URL including query
parameters. This means:

- `fetch("https://api.openaq.org/v3/locations?countries_id=129&limit=100")` and
  `fetch("https://api.openaq.org/v3/locations?countries_id=129&limit=50")` are
  **separate cache entries**.

To keep cache hit rates high, we **normalize API call parameters** within our
API routes so that the same logical query always produces the same URL:

```typescript
// GOOD -- consistent URL, one cache entry
const params = new URLSearchParams({
  countries_id: "129",
  limit: "100",
});
// Always sorted to ensure deterministic URLs
params.sort();
const url = `${OPENAQ_BASE}/locations?${params}`;
```

### 4.4 Cache Invalidation

There is **no manual cache invalidation**. This is by design:

- Stale-while-revalidate means the first request after TTL expiry gets cached
  (stale) data instantly while a background revalidation runs.
- If the upstream API is down during revalidation, the stale cached data
  continues to be served. This is a natural resilience mechanism.
- On Vercel, deploying a new version purges the entire data cache automatically.

### 4.5 Client-Side Caching

The API routes set standard HTTP cache headers so browsers also cache:

```typescript
// In each API route handler:
return new NextResponse(JSON.stringify(body), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    // Let the browser cache for 5 minutes, allow stale for 30 min
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
  },
});
```

The client-side React app uses **SWR** or direct `fetch` with these policies:

| Client request | Behaviour |
|---|---|
| Initial page load | Fetches all active layers in parallel |
| Toggle layer on | Fetches that layer (browser cache may serve) |
| Toggle layer off | No fetch; just hides markers |
| Change state filter | Re-fetches with `?state=X` query param |
| Periodic refresh | No polling. User refreshes the page, or we add a manual "refresh" button |

---

## 5. Data Flow Architecture

### 5.1 Request Lifecycle (detailed)

```
1. User opens page
   |
2. page.tsx renders <MapView> and <Sidebar>
   |
3. MapView useEffect fires fetches in parallel for each active layer:
   |  GET /api/air-quality?state=Jalisco
   |  GET /api/water-quality?state=Jalisco
   |
4. Each API route handler:
   |
   |  a) Calls fetchFromUpstream() with next: { revalidate: TTL }
   |     - Next.js checks its fetch cache
   |     - If fresh: returns cached response immediately (no external call)
   |     - If stale: returns cached response, triggers background revalidation
   |     - If miss: calls external API, caches response
   |
   |  b) Receives raw API response (OpenAQ / AQICN / datos.gob.mx format)
   |
   |  c) Passes through transform function:
   |     rawResponse -> transform() -> InternalType[]
   |
   |  d) Applies server-side state filter if ?state= param present
   |
   |  e) Wraps in ApiResponse<T> envelope and returns JSON
   |
5. MapView receives JSON, updates markers on Leaflet map
```

### 5.2 API Route Implementation Pattern

Every route follows the same structure:

```typescript
// src/app/api/[layer]/route.ts

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") || "";
  const source = determineSource();  // check if API keys are configured

  try {
    // 1. Fetch from upstream (cached by Next.js)
    const rawData = await fetchUpstream(source);

    // 2. Transform to internal types
    let results = transformAll(rawData);

    // 3. Apply filters server-side
    if (state) {
      results = results.filter((r) => r.state === state);
    }

    // 4. Return standardised envelope
    const response: ApiResponse<typeof results[0]> = {
      results,
      meta: {
        source,
        fetchedAt: new Date().toISOString(),
        cached: false,  // we can't know; Next.js handles this transparently
        totalResults: results.length,
        fallback: false,
      },
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
      },
    });

  } catch (error) {
    // 5. Fallback to sample data
    return handleFallback(error, state);
  }
}
```

### 5.3 Parallel Fetching on the Client

The client should fetch all active layers **in parallel** on mount and on
filter changes:

```typescript
// src/hooks/useMapData.ts

import { useState, useEffect, useCallback } from "react";
import type { MapLayer, ApiResponse, AirQualityStation /* ... */ } from "@/types";

interface MapData {
  airQuality: AirQualityStation[];
  waterQuality: WaterQualityPoint[];
  recyclingCenters: RecyclingCenter[];
  pollutantCompanies: PollutantCompany[];
  landfills: Landfill[];
  complaints: EnvironmentalComplaint[];
}

const LAYER_ENDPOINTS: Record<MapLayer, string> = {
  "air-quality": "/api/air-quality",
  "water-quality": "/api/water-quality",
  recycling: "/api/recycling-centers",
  pollutants: "/api/pollutant-companies",
  landfills: "/api/landfills",
  complaints: "/api/complaints",
};

const LAYER_TO_KEY: Record<MapLayer, keyof MapData> = {
  "air-quality": "airQuality",
  "water-quality": "waterQuality",
  recycling: "recyclingCenters",
  pollutants: "pollutantCompanies",
  landfills: "landfills",
  complaints: "complaints",
};

export function useMapData(activeLayers: MapLayer[], state: string) {
  const [data, setData] = useState<MapData>({ /* empty arrays */ });
  const [loading, setLoading] = useState<Set<MapLayer>>(new Set());
  const [errors, setErrors] = useState<Map<MapLayer, string>>(new Map());

  const fetchLayer = useCallback(async (layer: MapLayer) => {
    const endpoint = LAYER_ENDPOINTS[layer];
    const params = new URLSearchParams();
    if (state) params.set("state", state);

    setLoading((prev) => new Set(prev).add(layer));

    try {
      const res = await fetch(`${endpoint}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse<unknown> = await res.json();

      setData((prev) => ({
        ...prev,
        [LAYER_TO_KEY[layer]]: json.results,
      }));

      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(layer);
        return next;
      });
    } catch (err) {
      setErrors((prev) => new Map(prev).set(
        layer,
        err instanceof Error ? err.message : "Error desconocido"
      ));
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(layer);
        return next;
      });
    }
  }, [state]);

  useEffect(() => {
    // Fetch all active layers in parallel
    const fetches = activeLayers.map((layer) => fetchLayer(layer));
    Promise.allSettled(fetches);
  }, [activeLayers, state, fetchLayer]);

  return { data, loading, errors };
}
```

### 5.4 Air Quality: Dual-Source Merge Strategy

The air quality layer is special because it merges two upstream APIs:

```
                   ┌──── OpenAQ v3 ────┐
                   │  (has pollutant    │
/api/air-quality ──┤   breakdowns)      ├──> mergeAirQualitySources() ──> response
                   │                    │
                   ├──── AQICN ────────┤
                   │  (broader coverage,│
                   │   AQI only)        │
                   └────────────────────┘
```

```typescript
// src/app/api/air-quality/route.ts

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") || "";

  try {
    // Fire both in parallel -- each has its own cache TTL
    const [openaqResult, aqicnResult] = await Promise.allSettled([
      fetchAndTransformOpenAQ(),
      fetchAndTransformAQICN(),
    ]);

    const openaqStations =
      openaqResult.status === "fulfilled" ? openaqResult.value : [];
    const aqicnStations =
      aqicnResult.status === "fulfilled" ? aqicnResult.value : [];

    // Merge and deduplicate
    let merged = mergeAirQualitySources(openaqStations, aqicnStations);

    // Both failed -- use sample data
    if (merged.length === 0) {
      return fallbackToSample("air-quality", state);
    }

    if (state) {
      merged = merged.filter((s) => s.state === state);
    }

    return NextResponse.json({
      results: merged,
      meta: {
        source: openaqStations.length > 0 ? "openaq" : "aqicn",
        fetchedAt: new Date().toISOString(),
        cached: false,
        totalResults: merged.length,
        fallback: false,
      },
    });
  } catch {
    return fallbackToSample("air-quality", state);
  }
}
```

---

## 6. Error Handling & Resilience

### 6.1 Failure Modes & Responses

| Failure Mode | Detection | Recovery |
|---|---|---|
| External API returns HTTP 4xx/5xx | `!res.ok` check | Fall back to sample data for that layer |
| External API times out | `AbortSignal.timeout()` on fetch | Fall back to sample data |
| External API returns malformed JSON | `res.json()` throws | Fall back to sample data |
| Transform produces zero valid records | `results.length === 0` after transform | Fall back to sample data |
| API key missing/expired | 401/403 response | Fall back to sample data; log warning |
| Rate limit exceeded | 429 response | Serve stale cache (Next.js does this automatically); if no cache, sample data |
| Network error (DNS, TLS) | fetch throws TypeError | Fall back to sample data |
| Partial API failure (1 of 2 air sources) | `Promise.allSettled` | Serve data from whichever source succeeded |

### 6.2 Timeout Configuration

All external fetches use `AbortSignal.timeout()` to prevent hanging:

```typescript
// src/lib/data-sources.ts

const FETCH_TIMEOUT_MS = 8000; // 8 seconds (Vercel function timeout is 10s)

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { next?: { revalidate: number } }
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new FetchError(
      `Upstream API error: ${res.status} ${res.statusText}`,
      res.status
    );
  }

  return res;
}

class FetchError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "FetchError";
  }
}
```

### 6.3 Fallback to Sample Data

Every API route has a fallback function that returns sample data with metadata
indicating it is a fallback:

```typescript
// src/lib/fallback.ts

import type { ApiResponse, MapLayer } from "@/types";
import {
  sampleAirQuality,
  sampleWaterQuality,
  sampleRecyclingCenters,
  samplePollutantCompanies,
  sampleLandfills,
  sampleComplaints,
} from "@/lib/sample-data";

const SAMPLE_DATA: Record<MapLayer, unknown[]> = {
  "air-quality": sampleAirQuality,
  "water-quality": sampleWaterQuality,
  recycling: sampleRecyclingCenters,
  pollutants: samplePollutantCompanies,
  landfills: sampleLandfills,
  complaints: sampleComplaints,
};

export function fallbackToSample<T>(
  layer: MapLayer,
  state?: string
): NextResponse {
  let results = SAMPLE_DATA[layer] as (T & { state?: string })[];

  if (state) {
    results = results.filter((r) => r.state === state);
  }

  const response: ApiResponse<T> = {
    results: results as T[],
    meta: {
      source: "sample",
      fetchedAt: new Date().toISOString(),
      cached: false,
      totalResults: results.length,
      fallback: true,
    },
  };

  return NextResponse.json(response, {
    headers: {
      // Shorter cache for fallback data -- retry sooner
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
```

### 6.4 Client-Side Fallback Indicator

When `meta.fallback === true`, the UI should show a subtle banner:

```
⚠ Mostrando datos de muestra. Los datos en vivo no estan disponibles temporalmente.
```

### 6.5 Rate Limiting Protection

To protect against exceeding upstream rate limits:

1. **OpenAQ (5 req/s):** Each API route makes at most 1 request per invocation.
   With 30-minute revalidation, we produce ~2 requests/hour under normal load.
   Even under heavy traffic, stale-while-revalidate means only one background
   revalidation runs at a time.

2. **AQICN (1000 req/day):** Same reasoning. 30-minute cache means a maximum of
   48 requests/day per unique URL, well within limits.

3. **datos.gob.mx (undocumented):** 24-hour cache means each dataset endpoint
   is called once per day per Vercel edge region.

For additional protection, the API routes detect 429 responses and extend the
cache TTL:

```typescript
if (res.status === 429) {
  console.warn(`Rate limited by ${url}. Serving stale cache or sample data.`);
  // Next.js will automatically serve stale cache if available.
  // If no cache exists, fall through to sample data in the catch block.
  throw new FetchError("Rate limited", 429);
}
```

---

## 7. Search, Filter & Layer Toggle Data Model

### 7.1 Filter State Shape

```typescript
// src/types/index.ts

export interface MapFilters {
  /** Which layers are visible on the map */
  activeLayers: MapLayer[];

  /** Filter to a specific Mexican state (empty string = all) */
  state: string;

  /** Free-text search query (searches names, cities, descriptions) */
  searchQuery: string;

  /** For air quality: filter by AQI range */
  aqiRange?: {
    min: number;
    max: number;
  };

  /** For water quality: filter by quality level */
  waterQualityLevels?: WaterQualityLevel[];

  /** For complaints: filter by status */
  complaintStatuses?: ComplaintStatus[];

  /** For recycling: filter by accepted material */
  materialType?: string;
}
```

### 7.2 Where Filtering Happens

Filtering is split between server and client to optimise performance:

| Filter | Applied where | Reason |
|---|---|---|
| `state` | **Server** (API route) | Reduces payload size significantly |
| `activeLayers` | **Client** (just toggles rendering) | No need to re-fetch; data already loaded |
| `searchQuery` | **Client** (in-memory filter) | Avoids extra API calls for each keystroke |
| `aqiRange` | **Client** | Small dataset, instant filtering |
| `waterQualityLevels` | **Client** | Small dataset |
| `complaintStatuses` | **Client** | Small dataset |
| `materialType` | **Client** | Small dataset |

### 7.3 Text Search Implementation

Text search runs client-side across all loaded data:

```typescript
// src/lib/search.ts

/**
 * Searches across all layer data with a single query string.
 * Returns matching items grouped by layer.
 */
export function searchAllLayers(
  query: string,
  data: MapData
): MapData {
  if (!query.trim()) return data;

  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  return {
    airQuality: data.airQuality.filter((s) =>
      matchesQuery(q, [s.name, s.city, s.state])
    ),
    waterQuality: data.waterQuality.filter((s) =>
      matchesQuery(q, [s.name, s.bodyOfWater, s.state, s.municipality])
    ),
    recyclingCenters: data.recyclingCenters.filter((s) =>
      matchesQuery(q, [s.name, s.city, s.state, s.address, ...s.materials])
    ),
    pollutantCompanies: data.pollutantCompanies.filter((s) =>
      matchesQuery(q, [
        s.name, s.sector, s.state, s.municipality,
        ...s.emissions.map((e) => e.substance),
      ])
    ),
    landfills: data.landfills.filter((s) =>
      matchesQuery(q, [s.name, s.municipality, s.state])
    ),
    complaints: data.complaints.filter((s) =>
      matchesQuery(q, [
        s.complaintType, s.description, s.state, s.municipality,
      ])
    ),
  };
}

function matchesQuery(query: string, fields: string[]): boolean {
  const normalised = fields
    .filter(Boolean)
    .map((f) => f.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .join(" ");
  return normalised.includes(query);
}
```

### 7.4 State Filter Flow

When the user selects a state in the sidebar dropdown:

```
1. Sidebar calls onSelectState("Jalisco")
2. page.tsx updates selectedState
3. useMapData hook sees state change, re-fetches active layers:
     GET /api/air-quality?state=Jalisco
     GET /api/water-quality?state=Jalisco
     ...
4. API routes filter server-side before returning
5. MapView re-renders with filtered data
```

Passing the state filter to the server means:
- Less JSON transferred over the wire
- Different `?state=X` URLs create separate cache entries on Vercel, so
  popular states (CDMX, Jalisco, Nuevo Leon) stay hot in cache

### 7.5 Layer Toggle Flow

Toggling a layer does NOT hit the server if data is already loaded:

```
1. User toggles "Recycling Centers" on
2. activeLayers now includes "recycling"
3. If data.recyclingCenters is empty:
     -> fetch /api/recycling-centers?state=...
4. If data.recyclingCenters already populated:
     -> just render the markers (no fetch)
5. User toggles "Recycling Centers" off
6. -> markers removed from map, data kept in memory
```

This avoids redundant API calls when the user toggles layers on/off repeatedly.

---

## 8. File Layout

The complete file structure for the data layer:

```
src/
  types/
    index.ts                          # All internal types (sections 2.1-2.7)
    external/
      openaq.ts                       # OpenAQ v3 response types
      aqicn.ts                        # AQICN/WAQI response types
      datos-gob.ts                    # datos.gob.mx wrapper + CONAGUA/RETC/PROFEPA types
      cec-atlas.ts                    # CEC GeoJSON feature types

  lib/
    data-sources.ts                   # fetchWithTimeout(), base URL constants, API callers
    sample-data.ts                    # Hardcoded sample data (already exists)
    fallback.ts                       # fallbackToSample() helper
    search.ts                         # Client-side text search
    geo-utils.ts                      # haversineDistance(), inferStateFromCoordinates()
    aqi.ts                            # AQI calculation, breakpoints, color/label helpers

    transformers/
      air-quality.ts                  # transformOpenAQLocation(), transformAQICNStation(),
                                      #   mergeAirQualitySources()
      water-quality.ts                # transformConaguaRecord()
      pollutant-companies.ts          # transformRetcRecords() (with grouping)
      complaints.ts                   # transformProfepaDenuncia()
      recycling-centers.ts            # transformRecyclingRecord()
      landfills.ts                    # transformCECFeature()
      shared.ts                       # normalizeStateName(), parseNumericField()

  hooks/
    useMapData.ts                     # Parallel data fetching hook for all layers

  app/
    api/
      air-quality/route.ts            # Dual-source merge (OpenAQ + AQICN)
      water-quality/route.ts          # CONAGUA via datos.gob.mx
      pollutant-companies/route.ts    # RETC via datos.gob.mx
      recycling-centers/route.ts      # datos.gob.mx or sample
      landfills/route.ts              # Static GeoJSON or sample
      complaints/route.ts             # PROFEPA via datos.gob.mx

public/
  data/
    landfills-mexico.geojson          # CEC Atlas extract (static, committed to repo)
```

---

## Appendix A: AQI Breakpoint Tables

The US EPA AQI calculation uses piecewise linear interpolation. These are the
breakpoints used in `calculateAQI()`:

```typescript
// src/lib/aqi.ts

interface Breakpoint {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

export const PM25_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 },
];

export const PM10_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
  { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
  { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
  { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
  { cLow: 425, cHigh: 604, iLow: 301, iHigh: 500 },
];

export const O3_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 70, iLow: 51, iHigh: 100 },
  { cLow: 71, cHigh: 85, iLow: 101, iHigh: 150 },
  { cLow: 86, cHigh: 105, iLow: 151, iHigh: 200 },
  { cLow: 106, cHigh: 200, iLow: 201, iHigh: 300 },
];

export function linearScale(c: number, breakpoints: Breakpoint[]): number {
  for (const bp of breakpoints) {
    if (c >= bp.cLow && c <= bp.cHigh) {
      return Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (c - bp.cLow) + bp.iLow
      );
    }
  }
  // Above all breakpoints
  return 500;
}
```

## Appendix B: Haversine Distance for Deduplication

```typescript
// src/lib/geo-utils.ts

interface Coord {
  lat: number;
  lng: number;
}

/** Returns distance in kilometres between two coordinates. */
export function haversineDistance(a: Coord, b: Coord): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Rough state inference from coordinates using bounding boxes.
 * Used when the API response does not include state information.
 * Falls back to "Desconocido" if no match.
 */
export function inferStateFromCoordinates(lat: number, lng: number): string {
  // Simplified bounding boxes for major metro areas
  // A production implementation would use a proper point-in-polygon library
  // against state boundary GeoJSON
  const METRO_BOXES: { state: string; latMin: number; latMax: number; lngMin: number; lngMax: number }[] = [
    { state: "Ciudad de Mexico", latMin: 19.1, latMax: 19.6, lngMin: -99.4, lngMax: -98.9 },
    { state: "Nuevo Leon", latMin: 25.4, latMax: 26.0, lngMin: -100.6, lngMax: -99.8 },
    { state: "Jalisco", latMin: 20.4, latMax: 21.0, lngMin: -103.6, lngMax: -103.0 },
    { state: "Puebla", latMin: 18.8, latMax: 19.2, lngMin: -98.4, lngMax: -98.0 },
    { state: "Quintana Roo", latMin: 18.0, latMax: 21.5, lngMin: -88.0, lngMax: -86.5 },
    // ... extend for all 32 states
  ];

  for (const box of METRO_BOXES) {
    if (lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax) {
      return box.state;
    }
  }

  return "Desconocido";
}
```

## Appendix C: Environment Variables

```bash
# .env.local

# OpenAQ v3 -- free API key from https://docs.openaq.org/
# If not set, air quality falls back to AQICN only, then sample data
OPENAQ_API_KEY=

# AQICN -- free token from https://aqicn.org/api/
# If not set, air quality falls back to OpenAQ only, then sample data
AQICN_API_KEY=

# datos.gob.mx requires no authentication
# No env vars needed for CONAGUA, RETC, or PROFEPA data
```

## Appendix D: Backwards Compatibility with Current Codebase

The existing codebase in `src/types/index.ts` defines types that are close to
but not identical to this design. The migration path:

| Current field | New field | Change |
|---|---|---|
| `AirQualityStation.river` | N/A (air has no river) | Already correct |
| `WaterQualityPoint.river` | `WaterQualityPoint.bodyOfWater` | Renamed for accuracy |
| `PollutantCompany.year` | `PollutantCompany.reportingYear` | Renamed for clarity |
| `EnvironmentalComplaint.type` | `EnvironmentalComplaint.complaintType` | Renamed to avoid TS reserved word |
| `EnvironmentalComplaint.date` | `EnvironmentalComplaint.filedDate` | Renamed for clarity |
| `EnvironmentalComplaint.resource` | `EnvironmentalComplaint.affectedResource` | Renamed for clarity |
| N/A | `GeoPoint` base interface | New shared base |
| N/A | `ApiResponse<T>` wrapper | New standardised response envelope |
| N/A | `AirQualityStation.source` | New field to track data provenance |
| N/A | `AirQualityStation.category` | New derived field |
| N/A | All `null`-able pollutant fields | Changed from `number` to `number \| null` |

All sample data in `sample-data.ts` must be updated to match the new types
when this design is implemented.
