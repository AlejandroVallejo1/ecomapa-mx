import { NextResponse } from "next/server";
import { sampleRecyclingCenters } from "@/lib/sample-data";

export async function GET() {
  try {
    return NextResponse.json({ results: sampleRecyclingCenters });
  } catch (error) {
    console.error("Recycling centers API error:", error);
    return NextResponse.json(
      { error: "Error al obtener centros de reciclaje" },
      { status: 500 }
    );
  }
}
