import { NextRequest, NextResponse } from "next/server";
import { samplePollutantCompanies } from "@/lib/sample-data";
import type { PollutantCompany } from "@/types";

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
  const sector = searchParams.get("sector");

  let results: PollutantCompany[] = samplePollutantCompanies;

  if (state) {
    results = results.filter(
      (c) => c.state.toLowerCase() === state.toLowerCase()
    );
  }

  if (sector) {
    results = results.filter(
      (c) => c.sector.toLowerCase() === sector.toLowerCase()
    );
  }

  const response: ApiResponse<PollutantCompany> = {
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
