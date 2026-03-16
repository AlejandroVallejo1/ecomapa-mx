export interface AirQualityStation {
  id: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  aqi: number;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
  so2: number;
  co: number;
  lastUpdated: string;
}

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
