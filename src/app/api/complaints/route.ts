import { NextRequest, NextResponse } from "next/server";
import { sampleComplaints } from "@/lib/sample-data";
import type { EnvironmentalComplaint } from "@/types";

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
  const resource = searchParams.get("resource");

  let results: EnvironmentalComplaint[] = sampleComplaints;

  if (state) {
    results = results.filter(
      (c) => c.state.toLowerCase() === state.toLowerCase()
    );
  }

  if (status) {
    results = results.filter(
      (c) => c.status === status
    );
  }

  if (resource) {
    results = results.filter(
      (c) => c.resource === resource
    );
  }

  const response: ApiResponse<EnvironmentalComplaint> = {
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
