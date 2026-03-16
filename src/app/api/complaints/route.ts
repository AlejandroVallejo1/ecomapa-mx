import { NextResponse } from "next/server";
import { sampleComplaints } from "@/lib/sample-data";

export async function GET() {
  try {
    return NextResponse.json({ results: sampleComplaints });
  } catch (error) {
    console.error("Complaints API error:", error);
    return NextResponse.json(
      { error: "Error al obtener denuncias ambientales" },
      { status: 500 }
    );
  }
}
