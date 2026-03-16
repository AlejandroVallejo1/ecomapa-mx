import { NextRequest, NextResponse } from "next/server";
import { fetchAirQuality, fetchAqicnMapData } from "@/lib/data-sources";
import { sampleAirQuality } from "@/lib/sample-data";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const source = searchParams.get("source") || "sample";

  try {
    if (source === "openaq") {
      const data = await fetchAirQuality(
        lat ? parseFloat(lat) : undefined,
        lng ? parseFloat(lng) : undefined
      );
      return NextResponse.json(data);
    }

    if (source === "aqicn") {
      // Default bounds for Mexico
      const data = await fetchAqicnMapData(14.5, -118.5, 33.0, -86.5);
      return NextResponse.json(data);
    }

    // Return sample data by default
    return NextResponse.json({ results: sampleAirQuality });
  } catch (error) {
    console.error("Air quality API error:", error);
    return NextResponse.json(
      { error: "Error al obtener datos de calidad del aire" },
      { status: 500 }
    );
  }
}
