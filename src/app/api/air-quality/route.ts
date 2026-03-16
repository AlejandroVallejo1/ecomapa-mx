import { NextRequest, NextResponse } from "next/server";
import { sampleAirQuality } from "@/lib/sample-data";
import type { AirQualityStation } from "@/types";

interface AqicnStation {
  uid: number;
  aqi: string;
  lat: number;
  lon: number;
  station: {
    name: string;
    time: string;
  };
}

interface ApiResponse<T> {
  results: T[];
  meta: {
    source: string;
    fetchedAt: string;
    totalResults: number;
    fallback: boolean;
  };
}

function getAqiCategory(aqi: number) {
  if (aqi <= 50) return "buena" as const;
  if (aqi <= 100) return "aceptable" as const;
  if (aqi <= 150) return "danina_sensibles" as const;
  if (aqi <= 200) return "danina" as const;
  if (aqi <= 300) return "muy_danina" as const;
  return "peligrosa" as const;
}

function parseStationLocation(name: string): { city: string; state: string } {
  // AQICN station names for Mexico often look like:
  // "Velódromo, Puebla, Mexico" or "Centro, CHIH1, Chihuahua -Estatal, Mexico"
  const parts = name.split(",").map((s) => s.trim());
  if (parts.length >= 3) {
    return { city: parts[0], state: parts[parts.length - 2] };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[0] };
  }
  return { city: name, state: name };
}

async function fetchLiveStations(): Promise<AirQualityStation[]> {
  const apiKey = process.env.AQICN_API_KEY;
  if (!apiKey) {
    throw new Error("AQICN_API_KEY not configured");
  }

  // Bounding box covering all of Mexico
  const url = `https://api.waqi.info/map/bounds/?latlng=14.5,-118.5,33.0,-86.5&token=${apiKey}`;

  const res = await fetch(url, {
    next: { revalidate: 1800 },
  });

  if (!res.ok) {
    throw new Error(`AQICN API returned ${res.status}`);
  }

  const json = await res.json();

  if (json.status !== "ok" || !Array.isArray(json.data)) {
    throw new Error("Unexpected AQICN response format");
  }

  const stations: AirQualityStation[] = [];

  for (const raw of json.data as AqicnStation[]) {
    // Skip stations with no valid AQI or coordinates
    const aqiNum = parseInt(raw.aqi, 10);
    if (isNaN(aqiNum) || raw.aqi === "-") continue;
    if (!raw.lat || !raw.lon) continue;

    // Filter to Mexico only (lat 14.5-33, lon -118.5 to -86.5)
    // The bounding box also catches US border stations, filter by name
    const nameLower = raw.station.name.toLowerCase();
    const isMexico = nameLower.includes("mexico") || nameLower.includes("méxico")
      || nameLower.includes("estatal") || nameLower.includes("sinaica")
      || (raw.lat >= 14.5 && raw.lat <= 32.72 && raw.lon >= -117.5 && raw.lon <= -86.5);

    if (!isMexico) continue;

    const { city, state } = parseStationLocation(raw.station.name);

    stations.push({
      id: `aqicn-${raw.uid}`,
      name: raw.station.name,
      city,
      state,
      lat: raw.lat,
      lng: raw.lon,
      aqi: aqiNum,
      category: getAqiCategory(aqiNum),
      pm25: 0,
      pm10: 0,
      o3: 0,
      no2: 0,
      so2: 0,
      co: 0,
      source: "aqicn",
      lastUpdated: raw.station.time || new Date().toISOString(),
    });
  }

  return stations;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");

  let results: AirQualityStation[];
  let fallback = false;
  let source = "aqicn";

  try {
    results = await fetchLiveStations();
  } catch (error) {
    console.error("Air quality live fetch failed, using sample data:", error);
    results = sampleAirQuality;
    fallback = true;
    source = "sample";
  }

  // Filter by state if provided
  if (state) {
    results = results.filter(
      (s) => s.state.toLowerCase() === state.toLowerCase()
    );
  }

  const response: ApiResponse<AirQualityStation> = {
    results,
    meta: {
      source,
      fetchedAt: new Date().toISOString(),
      totalResults: results.length,
      fallback,
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=600",
    },
  });
}
