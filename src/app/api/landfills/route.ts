import { NextRequest, NextResponse } from "next/server";
import { sampleLandfills } from "@/lib/sample-data";
import { fetchAllCKAN, CKAN_RESOURCES } from "@/lib/data-sources";
import { withFallback } from "@/lib/api-helpers";
import { transformCKANContaminatedSites } from "@/lib/transformers";
import type { Landfill } from "@/types";

async function fetchLiveSites(): Promise<Landfill[]> {
  const [contaminated, remediated] = await Promise.all([
    fetchAllCKAN(CKAN_RESOURCES.contaminatedSites, 2000),
    fetchAllCKAN(CKAN_RESOURCES.remediatedSites, 2000),
  ]);

  const contaminatedSites = transformCKANContaminatedSites(contaminated, false);
  const remediatedSites = transformCKANContaminatedSites(remediated, true);

  return [...contaminatedSites, ...remediatedSites];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const status = searchParams.get("status");
  const type = searchParams.get("type");

  const response = await withFallback(
    fetchLiveSites,
    sampleLandfills,
    "datos.gob.mx"
  );

  if (state) {
    response.results = response.results.filter(
      (l) => l.state.toLowerCase() === state.toLowerCase()
    );
  }

  if (status) {
    response.results = response.results.filter(
      (l) => l.status === status
    );
  }

  if (type) {
    response.results = response.results.filter(
      (l) => l.type === type
    );
  }

  response.meta.totalResults = response.results.length;

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
