import { NextRequest, NextResponse } from "next/server";
import { sampleAirQuality } from "@/lib/sample-data";
import type { AirQualityStation } from "@/types";

interface AqicnStation {
  uid: number;
  aqi: string;
  station: {
    name: string;
    geo: [number, number];
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
  // "Pedregal, Mexico City, Mexico" or just "Monterrey, Mexico"
  const parts = name.split(",").map((s) => s.trim());
  if (parts.length >= 3) {
    return { city: parts[1], state: parts[1] };
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
    // Skip stations with no valid AQI
    const aqiNum = parseInt(raw.aqi, 10);
    if (isNaN(aqiNum) || raw.aqi === "-") continue;

    const { city, state } = parseStationLocation(raw.station.name);

    stations.push({
      id: `aqicn-${raw.uid}`,
      name: raw.station.name,
      city,
      state,
      lat: raw.station.geo[0],
      lng: raw.station.geo[1],
      aqi: aqiNum,
      category: getAqiCategory(aqiNum),
      pm25: 0,
      pm10: 0,
      o3: 0,
      no2: 0,
      so2: 0,
      co: 0,
      source: "aqicn",
      lastUpdated: new Date().toISOString(),
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

  return NextResponse.json(response);
}
