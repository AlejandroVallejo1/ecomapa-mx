"use client";
import { useState, useEffect, useRef } from "react";
import type { MapLayer } from "@/types";

// Map layer IDs to API endpoints
const LAYER_ENDPOINTS: Record<MapLayer, string> = {
  "air-quality": "/api/air-quality",
  "water-quality": "/api/water-quality",
  "recycling": "/api/recycling-centers",
  "pollutants": "/api/pollutant-companies",
  "landfills": "/api/landfills",
  "complaints": "/api/complaints",
};

interface LayerState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  source: string;
  fallback: boolean;
}

export function useLayerData(activeLayers: MapLayer[], selectedState: string) {
  const [layerStates, setLayerStates] = useState<Record<string, LayerState<unknown>>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});
  const fetchedKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const layer of activeLayers) {
      const endpoint = LAYER_ENDPOINTS[layer];
      const cacheKey = `${layer}:${selectedState}`;

      // Skip if already fetched for this key
      if (fetchedKeys.current.has(cacheKey)) {
        continue;
      }

      // Abort previous request for this specific layer only
      abortControllers.current[layer]?.abort();
      const controller = new AbortController();
      abortControllers.current[layer] = controller;

      // Mark as loading
      setLayerStates(prev => ({
        ...prev,
        [cacheKey]: { data: [], loading: true, error: null, source: "", fallback: false },
      }));

      const params = new URLSearchParams();
      if (selectedState) params.set("state", selectedState);
      const url = `${endpoint}?${params}`;

      fetch(url, { signal: controller.signal })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(json => {
          fetchedKeys.current.add(cacheKey);
          setLayerStates(prev => ({
            ...prev,
            [cacheKey]: {
              data: json.results || [],
              loading: false,
              error: null,
              source: json.meta?.source || "unknown",
              fallback: json.meta?.fallback || false,
            },
          }));
        })
        .catch(err => {
          if (err.name === "AbortError") return;
          setLayerStates(prev => ({
            ...prev,
            [cacheKey]: { data: [], loading: false, error: err.message, source: "error", fallback: true },
          }));
        });
    }
    // No cleanup that aborts all — only abort per-layer on new request above
  }, [activeLayers, selectedState]);

  // Clear fetched cache when state filter changes
  useEffect(() => {
    fetchedKeys.current.clear();
  }, [selectedState]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      Object.values(abortControllers.current).forEach(c => c.abort());
    };
  }, []);

  function getLayerData<T>(layer: MapLayer): LayerState<T> {
    const cacheKey = `${layer}:${selectedState}`;
    return (layerStates[cacheKey] as LayerState<T>) || { data: [], loading: false, error: null, source: "", fallback: false };
  }

  const anyLoading = activeLayers.some(l => {
    const key = `${l}:${selectedState}`;
    return layerStates[key]?.loading;
  });

  const anyFallback = activeLayers.some(l => {
    const key = `${l}:${selectedState}`;
    return layerStates[key]?.fallback;
  });

  return { getLayerData, anyLoading, anyFallback };
}
