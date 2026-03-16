import { NextRequest, NextResponse } from "next/server";
import { sampleComplaints } from "@/lib/sample-data";
import { fetchAllCKAN, CKAN_RESOURCES } from "@/lib/data-sources";
import { withFallback } from "@/lib/api-helpers";
import {
  transformCKANInspections,
  transformCKANEmergencies,
} from "@/lib/transformers";
import type { EnvironmentalComplaint } from "@/types";

async function fetchLiveComplaints(): Promise<EnvironmentalComplaint[]> {
  const [inspections, emergencies] = await Promise.all([
    fetchAllCKAN(CKAN_RESOURCES.profepaInspections, 2000),
    fetchAllCKAN(CKAN_RESOURCES.profepaEmergencies, 2000),
  ]);

  const inspectionComplaints = transformCKANInspections(inspections);
  const emergencyComplaints = transformCKANEmergencies(emergencies);

  return [...inspectionComplaints, ...emergencyComplaints];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const status = searchParams.get("status");
  const resource = searchParams.get("resource");

  const response = await withFallback(
    fetchLiveComplaints,
    sampleComplaints,
    "datos.gob.mx"
  );

  if (state) {
    response.results = response.results.filter(
      (c) => c.state.toLowerCase() === state.toLowerCase()
    );
  }

  if (status) {
    response.results = response.results.filter(
      (c) => c.status === status
    );
  }

  if (resource) {
    response.results = response.results.filter(
      (c) => c.resource === resource
    );
  }

  response.meta.totalResults = response.results.length;

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
