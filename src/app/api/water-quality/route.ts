import { NextRequest, NextResponse } from "next/server";
import { sampleWaterQuality } from "@/lib/sample-data";
import type { WaterQualityPoint } from "@/types";

interface ApiResponse<T> {
  results: T[];
  meta: {
    source: string;
    fetchedAt: string;
    totalResults: number;
    fallback: boolean;
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");

  // CONAGUA API is complex and requires specific credentials.
  // For now, return sample data. In production, this would fetch
  // from datos.gob.mx CKAN API for CONAGUA RENAMECA data.
  let results: WaterQualityPoint[] = sampleWaterQuality;

  if (state) {
    results = results.filter(
      (w) => w.state.toLowerCase() === state.toLowerCase()
    );
  }

  const response: ApiResponse<WaterQualityPoint> = {
    results,
    meta: {
      source: "sample",
      fetchedAt: new Date().toISOString(),
      totalResults: results.length,
      fallback: true,
    },
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
