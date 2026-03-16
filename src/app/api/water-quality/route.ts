import { NextResponse } from "next/server";
import { sampleWaterQuality } from "@/lib/sample-data";

export async function GET() {
  try {
    // For now, return sample data
    // In production, fetch from CONAGUA RENAMECA via datos.gob.mx CKAN API
    return NextResponse.json({ results: sampleWaterQuality });
  } catch (error) {
    console.error("Water quality API error:", error);
    return NextResponse.json(
      { error: "Error al obtener datos de calidad del agua" },
      { status: 500 }
    );
  }
}
