import { NextRequest, NextResponse } from "next/server";
import { sampleRecyclingCenters } from "@/lib/sample-data";
import type { RecyclingCenter } from "@/types";

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
  const material = searchParams.get("material");

  let results: RecyclingCenter[] = sampleRecyclingCenters;

  if (state) {
    results = results.filter(
      (r) => r.state.toLowerCase() === state.toLowerCase()
    );
  }

  if (material) {
    results = results.filter((r) =>
      r.materials.some((m) => m.toLowerCase() === material.toLowerCase())
    );
  }

  const response: ApiResponse<RecyclingCenter> = {
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
