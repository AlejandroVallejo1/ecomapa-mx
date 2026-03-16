import { NextResponse } from "next/server";
import {
  sampleAirQuality,
  sampleWaterQuality,
  sampleRecyclingCenters,
  samplePollutantCompanies,
  sampleLandfills,
  sampleComplaints,
} from "@/lib/sample-data";

export async function GET() {
  // Calculate average AQI from air quality stations
  const avgAqi =
    sampleAirQuality.length > 0
      ? Math.round(
          sampleAirQuality.reduce((sum, s) => sum + s.aqi, 0) /
            sampleAirQuality.length
        )
      : 0;

  // Count contaminated rivers (quality = contaminada or fuertemente_contaminada)
  const contaminatedRivers = sampleWaterQuality.filter(
    (w) => w.quality === "contaminada" || w.quality === "fuertemente_contaminada"
  ).length;

  const totalRivers = sampleWaterQuality.length;

  // Count active landfills
  const activeLandfills = sampleLandfills.filter(
    (l) => l.status === "activo"
  ).length;

  // Count complaints by status
  const complaintsByStatus = {
    recibida: sampleComplaints.filter((c) => c.status === "recibida").length,
    en_proceso: sampleComplaints.filter((c) => c.status === "en_proceso").length,
    concluida: sampleComplaints.filter((c) => c.status === "concluida").length,
  };

  // Count complaints by resource type
  const complaintsByResource = sampleComplaints.reduce(
    (acc, c) => {
      acc[c.resource] = (acc[c.resource] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const stats = {
    avgAqi,
    contaminatedRivers,
    totalRivers,
    recyclingCenters: sampleRecyclingCenters.length,
    pollutantCompanies: samplePollutantCompanies.length,
    landfills: sampleLandfills.length,
    activeLandfills,
    complaints: sampleComplaints.length,
    complaintsByStatus,
    complaintsByResource,
    airQualityStations: sampleAirQuality.length,
  };

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
    },
  });
}
