// ── Core geometry ──────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

// ── API response envelope ─────────────────────────────────────────────

export type DataSource =
  | "openaq"
  | "aqicn"
  | "datos.gob.mx"
  | "cec-atlas"
  | "sample";

export interface ApiResponse<T> {
  results: T[];
  meta: {
    source: DataSource;
    fetchedAt: string;
    totalResults: number;
    fallback: boolean;
  };
}

// ── Map & Filter types ────────────────────────────────────────────────

export type MapLayer =
  | "air-quality"
  | "water-quality"
  | "recycling"
  | "pollutants"
  | "landfills"
  | "complaints";

export interface MapFilter {
  layers: MapLayer[];
  state?: string;
  searchQuery?: string;
}

// ── AQI category (Spanish labels) ────────────────────────────────────

export type AqiCategory =
  | "buena"
  | "aceptable"
  | "danina_sensibles"
  | "danina"
  | "muy_danina"
  | "peligrosa";

// ── Air Quality ───────────────────────────────────────────────────────
// `pm25`, `pm10`, etc. are `number` in sample data but `number | null`
// when coming from live APIs.  We use `number` to stay compatible with
// sample-data.ts; the transformer fills 0 for missing values.

export interface AirQualityStation {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  aqi: number;
  category?: AqiCategory;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  so2: number;
  co: number;
  source?: "openaq" | "aqicn";
  lastUpdated: string;
}

// ── Water Quality ─────────────────────────────────────────────────────

export interface WaterQualityPoint {
  id: string;
  name: string;
  river: string;
  state: string;
  lat: number;
  lng: number;
  bod: number; // Biochemical Oxygen Demand
  cod: number; // Chemical Oxygen Demand
  tss: number; // Total Suspended Solids
  quality: "buena" | "aceptable" | "contaminada" | "fuertemente_contaminada";
  lastUpdated: string;
}

// ── Recycling Centers ─────────────────────────────────────────────────

export interface RecyclingCenter {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  materials: string[];
  phone?: string;
  schedule?: string;
}

// ── Pollutant Companies (RETC) ────────────────────────────────────────

export interface PollutantCompany {
  id: string;
  name: string;
  sector: string;
  address: string;
  municipality: string;
  state: string;
  lat: number;
  lng: number;
  emissions: {
    substance: string;
    amount: number;
    unit: string;
    medium: "aire" | "agua" | "suelo";
  }[];
  year: number;
}

// ── Landfills ─────────────────────────────────────────────────────────

export interface Landfill {
  id: string;
  name: string;
  type: "relleno_sanitario" | "tiradero_cielo_abierto" | "sitio_controlado";
  municipality: string;
  state: string;
  lat: number;
  lng: number;
  capacity?: number;
  status: "activo" | "clausurado" | "en_proceso";
}

// ── Environmental Complaints ──────────────────────────────────────────

export interface EnvironmentalComplaint {
  id: string;
  type: string;
  description: string;
  state: string;
  municipality: string;
  lat: number;
  lng: number;
  status: "recibida" | "en_proceso" | "concluida";
  date: string;
  resource: "agua" | "aire" | "suelo" | "forestal" | "fauna";
}
