import { NextRequest, NextResponse } from "next/server";
import { sampleLandfills } from "@/lib/sample-data";
import type { Landfill } from "@/types";

interface ApiResponse<T> {
  results: T[];
  meta: {
    source: string;
    fetchedAt: string;
    totalResults: number;
    fallback: boolean;
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  const status = searchParams.get("status");
  const type = searchParams.get("type");

  let results: Landfill[] = sampleLandfills;

  if (state) {
    results = results.filter(
      (l) => l.state.toLowerCase() === state.toLowerCase()
    );
  }

  if (status) {
    results = results.filter(
      (l) => l.status === status
    );
  }

  if (type) {
    results = results.filter(
      (l) => l.type === type
    );
  }

  const response: ApiResponse<Landfill> = {
    results,
    meta: {
      source: "sample",
      fetchedAt: new Date().toISOString(),
      totalResults: results.length,
      fallback: true,
    },
  };

  return NextResponse.json(response);
}
