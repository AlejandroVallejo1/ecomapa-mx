import { NextResponse } from "next/server";
import { samplePollutantCompanies } from "@/lib/sample-data";

export async function GET() {
  try {
    return NextResponse.json({ results: samplePollutantCompanies });
  } catch (error) {
    console.error("Pollutant companies API error:", error);
    return NextResponse.json(
      { error: "Error al obtener datos de empresas contaminantes" },
      { status: 500 }
    );
  }
}
