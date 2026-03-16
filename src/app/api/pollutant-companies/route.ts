import { NextRequest, NextResponse } from "next/server";
import { samplePollutantCompanies } from "@/lib/sample-data";
import { fetchAllCKAN, CKAN_RESOURCES } from "@/lib/data-sources";
import { withFallback } from "@/lib/api-helpers";
import { transformCKANEmissions } from "@/lib/transformers";
import type { PollutantCompany } from "@/types";

async function fetchLiveEmissions(): Promise<PollutantCompany[]> {
  const records = await fetchAllCKAN(CKAN_RESOURCES.emissionsInventory, 5000);
  return transformCKANEmissions(records);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const sector = searchParams.get("sector");

  const response = await withFallback(
    fetchLiveEmissions,
    samplePollutantCompanies,
    "datos.gob.mx"
  );

  if (state) {
    response.results = response.results.filter(
      (c) => c.state.toLowerCase() === state.toLowerCase()
    );
  }

  if (sector) {
    response.results = response.results.filter(
      (c) => c.sector.toLowerCase() === sector.toLowerCase()
    );
  }

  response.meta.totalResults = response.results.length;

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
