import { NextResponse } from "next/server";
import { sampleLandfills } from "@/lib/sample-data";

export async function GET() {
  try {
    return NextResponse.json({ results: sampleLandfills });
  } catch (error) {
    console.error("Landfills API error:", error);
    return NextResponse.json(
      { error: "Error al obtener datos de rellenos sanitarios" },
      { status: 500 }
    );
  }
}
