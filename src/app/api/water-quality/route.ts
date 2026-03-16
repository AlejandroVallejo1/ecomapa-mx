import { NextRequest, NextResponse } from "next/server";
import { sampleWaterQuality } from "@/lib/sample-data";
import { fetchAllCKAN, CKAN_RESOURCES } from "@/lib/data-sources";
import { withFallback } from "@/lib/api-helpers";
import {
  transformCKANHydrometricStations,
  transformCKANDams,
} from "@/lib/transformers";
import type { WaterQualityPoint } from "@/types";

async function fetchLiveWaterData(): Promise<WaterQualityPoint[]> {
  const [hydroRecords, damRecords] = await Promise.all([
    fetchAllCKAN(CKAN_RESOURCES.hydrometricStations, 2000),
    fetchAllCKAN(CKAN_RESOURCES.dams, 500),
  ]);

  const hydroStations = transformCKANHydrometricStations(hydroRecords);
  const dams = transformCKANDams(damRecords);

  return [...hydroStations, ...dams];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");

  const response = await withFallback(
    fetchLiveWaterData,
    sampleWaterQuality,
    "datos.gob.mx"
  );

  if (state) {
    response.results = response.results.filter(
      (w) => w.state.toLowerCase() === state.toLowerCase()
    );
    response.meta.totalResults = response.results.length;
  }

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
