/**
 * EPA AQI breakpoint calculation
 *
 * Implements the US EPA algorithm used by most Mexican monitoring networks
 * (SINAICA, SIMA, RAMA) to convert pollutant concentrations into a 0-500
 * Air Quality Index value.
 */

import type { AqiCategory } from "@/types";

// ── Breakpoint tables ─────────────────────────────────────────────────

interface Breakpoint {
  cLow: number;
  cHigh: number;
  iLow: number;
  iHigh: number;
}

/** PM2.5 24-hour average (ug/m3) */
const PM25_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 },
];

/** PM10 24-hour average (ug/m3) */
const PM10_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 154, iLow: 51, iHigh: 100 },
  { cLow: 155, cHigh: 254, iLow: 101, iHigh: 150 },
  { cLow: 255, cHigh: 354, iLow: 151, iHigh: 200 },
  { cLow: 355, cHigh: 424, iLow: 201, iHigh: 300 },
  { cLow: 425, cHigh: 604, iLow: 301, iHigh: 500 },
];

/** O3 8-hour average (ppb) */
const O3_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 54, iLow: 0, iHigh: 50 },
  { cLow: 55, cHigh: 70, iLow: 51, iHigh: 100 },
  { cLow: 71, cHigh: 85, iLow: 101, iHigh: 150 },
  { cLow: 86, cHigh: 105, iLow: 151, iHigh: 200 },
  { cLow: 106, cHigh: 200, iLow: 201, iHigh: 300 },
];

/** NO2 1-hour average (ppb) */
const NO2_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 53, iLow: 0, iHigh: 50 },
  { cLow: 54, cHigh: 100, iLow: 51, iHigh: 100 },
  { cLow: 101, cHigh: 360, iLow: 101, iHigh: 150 },
  { cLow: 361, cHigh: 649, iLow: 151, iHigh: 200 },
  { cLow: 650, cHigh: 1249, iLow: 201, iHigh: 300 },
  { cLow: 1250, cHigh: 2049, iLow: 301, iHigh: 500 },
];

/** SO2 1-hour average (ppb) */
const SO2_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 35, iLow: 0, iHigh: 50 },
  { cLow: 36, cHigh: 75, iLow: 51, iHigh: 100 },
  { cLow: 76, cHigh: 185, iLow: 101, iHigh: 150 },
  { cLow: 186, cHigh: 304, iLow: 151, iHigh: 200 },
  { cLow: 305, cHigh: 604, iLow: 201, iHigh: 300 },
  { cLow: 605, cHigh: 1004, iLow: 301, iHigh: 500 },
];

/** CO 8-hour average (ppm) */
const CO_BREAKPOINTS: Breakpoint[] = [
  { cLow: 0, cHigh: 4.4, iLow: 0, iHigh: 50 },
  { cLow: 4.5, cHigh: 9.4, iLow: 51, iHigh: 100 },
  { cLow: 9.5, cHigh: 12.4, iLow: 101, iHigh: 150 },
  { cLow: 12.5, cHigh: 15.4, iLow: 151, iHigh: 200 },
  { cLow: 15.5, cHigh: 30.4, iLow: 201, iHigh: 300 },
  { cLow: 30.5, cHigh: 50.4, iLow: 301, iHigh: 500 },
];

// ── Core calculation ──────────────────────────────────────────────────

/**
 * Calculate the sub-index for a single pollutant using EPA linear
 * interpolation between breakpoints.
 *
 * Returns `null` when concentration is out of range or the value is
 * not a finite number.
 */
function subIndex(
  concentration: number,
  breakpoints: Breakpoint[]
): number | null {
  if (!Number.isFinite(concentration) || concentration < 0) return null;

  for (const bp of breakpoints) {
    if (concentration >= bp.cLow && concentration <= bp.cHigh) {
      return Math.round(
        ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) *
          (concentration - bp.cLow) +
          bp.iLow
      );
    }
  }
  return null; // above highest breakpoint
}

// ── Public API ────────────────────────────────────────────────────────

export interface PollutantValues {
  pm25?: number | null;
  pm10?: number | null;
  o3?: number | null;
  no2?: number | null;
  so2?: number | null;
  co?: number | null;
}

/**
 * Calculate the overall AQI as the **maximum** of all individual
 * pollutant sub-indices (standard EPA method).
 *
 * Returns 0 when no valid sub-index can be computed.
 */
export function calculateAQI(values: PollutantValues): number {
  const indices: number[] = [];

  if (values.pm25 != null) {
    const v = subIndex(values.pm25, PM25_BREAKPOINTS);
    if (v !== null) indices.push(v);
  }
  if (values.pm10 != null) {
    const v = subIndex(values.pm10, PM10_BREAKPOINTS);
    if (v !== null) indices.push(v);
  }
  if (values.o3 != null) {
    const v = subIndex(values.o3, O3_BREAKPOINTS);
    if (v !== null) indices.push(v);
  }
  if (values.no2 != null) {
    const v = subIndex(values.no2, NO2_BREAKPOINTS);
    if (v !== null) indices.push(v);
  }
  if (values.so2 != null) {
    const v = subIndex(values.so2, SO2_BREAKPOINTS);
    if (v !== null) indices.push(v);
  }
  if (values.co != null) {
    const v = subIndex(values.co, CO_BREAKPOINTS);
    if (v !== null) indices.push(v);
  }

  return indices.length > 0 ? Math.max(...indices) : 0;
}

/**
 * Map a numeric AQI value to a Mexican-standard category label.
 */
export function aqiToCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return "buena";
  if (aqi <= 100) return "aceptable";
  if (aqi <= 150) return "danina_sensibles";
  if (aqi <= 200) return "danina";
  if (aqi <= 300) return "muy_danina";
  return "peligrosa";
}
