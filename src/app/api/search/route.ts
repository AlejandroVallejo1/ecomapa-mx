import { NextRequest, NextResponse } from "next/server";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
}

interface SearchResult {
  name: string;
  lat: number;
  lng: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "El parámetro de búsqueda 'q' es requerido" },
      { status: 400 }
    );
  }

  try {
    const encodedQuery = encodeURIComponent(query.trim());
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&countrycodes=mx&format=json&limit=5`;

    const res = await fetch(url, {
      next: { revalidate: 604800 }, // Cache for 7 days
      headers: {
        "User-Agent": "EcoMapaMX/1.0 (https://ecomapa.mx; contacto@ecomapa.mx)",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim returned ${res.status}`);
    }

    const data: NominatimResult[] = await res.json();

    const results: SearchResult[] = data.map((item) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Geocoding search error:", error);
    return NextResponse.json(
      { error: "Error al buscar ubicación", results: [] },
      { status: 500 }
    );
  }
}
