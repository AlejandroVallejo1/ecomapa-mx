# EcoMapa MX -- Complete Architecture Document

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Backend Architecture](#2-backend-architecture)
3. [Frontend Architecture](#3-frontend-architecture)
4. [Cross-Cutting Concerns](#4-cross-cutting-concerns)
5. [File Tree (Target State)](#5-file-tree-target-state)
6. [Data Flow Diagrams](#6-data-flow-diagrams)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
+-----------------------------------------------------+
|                    VERCEL EDGE                       |
|                                                      |
|  +-----------------------------------------------+  |
|  |           Next.js 16 App Router                |  |
|  |                                                |  |
|  |  +---------+   +---------------------------+   |  |
|  |  | Static  |   |   Serverless Functions    |   |  |
|  |  | Assets  |   |   (API Route Handlers)    |   |  |
|  |  | (RSC +  |   |                           |   |  |
|  |  | Client) |   |  /api/air-quality         |   |  |
|  |  +---------+   |  /api/water-quality       |   |  |
|  |                |  /api/recycling-centers    |   |  |
|  |                |  /api/pollutant-companies  |   |  |
|  |                |  /api/landfills            |   |  |
|  |                |  /api/complaints           |   |  |
|  |                |  /api/search               |   |  |
|  |                |  /api/stats                |   |  |
|  |                +---------------------------+   |  |
|  +-----------------------------------------------+  |
+------|-----|-----|-----------------------------------+
       |     |     |
       v     v     v
  +-------+ +---+ +----------+
  |OpenAQ | |AQI| |datos.gob |
  |  v3   | |CN | |.mx CKAN  |
  +-------+ +---+ +----------+
```

### 1.2 Technology Stack (Confirmed)

| Layer      | Technology                    | Version |
|------------|-------------------------------|---------|
| Runtime    | Next.js (App Router)          | 16.1.x  |
| Language   | TypeScript (strict)           | 5.x     |
| UI         | React                         | 19.x    |
| Styling    | Tailwind CSS                  | 4.x     |
| Mapping    | Leaflet + react-leaflet       | 1.9 / 5 |
| Hosting    | Vercel (serverless)           | --      |
| Database   | None (stateless aggregation)  | --      |

### 1.3 Key Design Decisions

1. **No database**: The platform is a pure aggregation layer. All state is ephemeral: fetched from external APIs, cached via Next.js `fetch` revalidation (ISR), and held in React client state.
2. **API routes as proxy/transform layer**: Each `/api/*` route wraps one or more external APIs, normalises the response into our TypeScript interfaces, and provides a uniform fallback to sample data.
3. **Progressive enhancement**: The app renders a usable map with sample data instantly, then hydrates with live API data client-side.
4. **No SWR/React Query**: Plain `fetch` from client components with `AbortController` keeps the dependency count low. SWR can be introduced later if stale-while-revalidate UX is needed.

---

## 2. Backend Architecture

### 2.1 API Route Design

Every API route follows the same structural contract.

#### Universal Response Envelope

```typescript
// src/types/api.ts (NEW)
interface ApiResponse<T> {
  results: T[];
  meta: {
    source: "live" | "sample";    // Whether data came from a live API or fallback
    count: number;
    fetchedAt: string;            // ISO 8601 timestamp
    state?: string;               // State filter applied, if any
  };
}

interface ApiErrorResponse {
  error: string;                  // Spanish-language error message
  code: string;                   // Machine-readable error code
  details?: string;               // Optional debug info (omitted in production)
}
```

#### Route-by-Route Specification

##### GET `/api/air-quality`

| Param    | Type   | Default    | Description                              |
|----------|--------|------------|------------------------------------------|
| `state`  | string | (none)     | Filter by Mexican state name             |
| `source` | string | `"auto"`   | `"openaq"`, `"aqicn"`, `"sample"`, `"auto"` |
| `lat`    | number | (none)     | Latitude for radius search (OpenAQ)      |
| `lng`    | number | (none)     | Longitude for radius search (OpenAQ)     |

**Responsibilities:**
1. If `source=auto` (default), attempt OpenAQ first. On failure or empty results, fall back to AQICN. On double failure, return sample data.
2. Transform OpenAQ v3 `locations` response into `AirQualityStation[]`.
3. Transform AQICN map-bounds response into `AirQualityStation[]`.
4. Apply `state` filter server-side if provided.
5. Set `meta.source` to indicate actual data origin.

**Caching:** `next: { revalidate: 3600 }` (1 hour) for live APIs.

##### GET `/api/water-quality`

| Param   | Type   | Default | Description                        |
|---------|--------|---------|------------------------------------|
| `state` | string | (none)  | Filter by state                    |

**Responsibilities:**
1. Fetch from datos.gob.mx CKAN: `conagua.gob.mx-RENAMECA`.
2. Transform CKAN records into `WaterQualityPoint[]`.
3. On failure, return sample data.

**Caching:** `next: { revalidate: 86400 }` (24 hours -- data updates infrequently).

##### GET `/api/recycling-centers`

| Param      | Type   | Default | Description                      |
|------------|--------|---------|----------------------------------|
| `state`    | string | (none)  | Filter by state                  |
| `material` | string | (none)  | Filter by accepted material type |

**Responsibilities:**
1. Fetch from datos.gob.mx CKAN: recycling center datasets.
2. Transform into `RecyclingCenter[]`.
3. Apply `material` filter if provided (server-side substring match on `materials` array).

**Caching:** `next: { revalidate: 86400 }` (24 hours).

##### GET `/api/pollutant-companies`

| Param    | Type   | Default | Description                      |
|----------|--------|---------|----------------------------------|
| `state`  | string | (none)  | Filter by state                  |
| `sector` | string | (none)  | Filter by industrial sector      |

**Responsibilities:**
1. Fetch from datos.gob.mx CKAN: `semarnat.gob.mx-RETC`.
2. Transform into `PollutantCompany[]`.
3. Apply filters.

**Caching:** `next: { revalidate: 86400 }` (24 hours).

##### GET `/api/landfills`

| Param   | Type   | Default | Description         |
|---------|--------|---------|---------------------|
| `state` | string | (none)  | Filter by state     |
| `type`  | string | (none)  | Filter by site type |

**Caching:** `next: { revalidate: 86400 }` (24 hours).

##### GET `/api/complaints`

| Param      | Type   | Default | Description                   |
|------------|--------|---------|-------------------------------|
| `state`    | string | (none)  | Filter by state               |
| `resource` | string | (none)  | Filter by resource type       |
| `status`   | string | (none)  | Filter by complaint status    |

**Caching:** `next: { revalidate: 43200 }` (12 hours -- complaints change more frequently).

##### GET `/api/search` (NEW)

| Param | Type   | Required | Description               |
|-------|--------|----------|---------------------------|
| `q`   | string | yes      | City name or address      |

**Responsibilities:**
1. Use Nominatim (OpenStreetMap) geocoding API with `countrycodes=mx` restriction.
2. Return `{ results: [{ displayName, lat, lng, state, type }] }`.
3. Rate-limit to 1 request/second on the server side (Nominatim policy).

**Caching:** `next: { revalidate: 604800 }` (7 days -- geocoding results are stable).

##### GET `/api/stats` (NEW)

| Param   | Type   | Default | Description                       |
|---------|--------|---------|-----------------------------------|
| `state` | string | (none)  | Scope stats to a single state     |

**Responsibilities:**
1. Aggregate counts from all 6 data layers (call internal fetchers or use cached data).
2. Return `StatsResponse` with per-layer counts and summary indicators.

**Caching:** `next: { revalidate: 3600 }` (1 hour).


### 2.2 External API Integration

#### 2.2.1 OpenAQ v3

```
Base URL:  https://api.openaq.org/v3
Auth:      X-API-Key header (env: OPENAQ_API_KEY)
Rate Limit: 10 req/min (free tier)
```

**Endpoints used:**
- `GET /locations?countries_id=129&limit=100` -- All Mexico monitoring stations
- `GET /locations/{id}/latest` -- Latest measurements for one station

**Response Transformation (OpenAQ -> AirQualityStation):**

```
OpenAQ location object           ->  AirQualityStation
-----------------------------        -----------------------
id                               ->  id (string)
name                             ->  name
city (from locality/city)        ->  city
coordinates.latitude             ->  lat
coordinates.longitude            ->  lng
sensors[].parameter.name         ->  pm25, pm10, o3, no2, so2, co
sensors[].latest.value           ->  (respective numeric fields)
datetime.last.utc                ->  lastUpdated
(computed from pm25)             ->  aqi (US EPA AQI breakpoint formula)
```

**AQI Calculation (server-side):**
The `aqi` field is computed from PM2.5 using the EPA breakpoint table since OpenAQ provides raw pollutant values, not a composite index.

```typescript
// src/lib/aqi-calculator.ts (NEW)
export function calculateAqiFromPm25(pm25: number): number {
  const breakpoints = [
    { cLow: 0,     cHigh: 12,    iLow: 0,   iHigh: 50  },
    { cLow: 12.1,  cHigh: 35.4,  iLow: 51,  iHigh: 100 },
    { cLow: 35.5,  cHigh: 55.4,  iLow: 101, iHigh: 150 },
    { cLow: 55.5,  cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 },
  ];
  // Linear interpolation within the matching breakpoint range
}
```

#### 2.2.2 AQICN (World Air Quality Index)

```
Base URL:  https://api.waqi.info
Auth:      Query param `token` (env: AQICN_API_KEY)
Rate Limit: 1000 req/day (free tier)
```

**Endpoints used:**
- `GET /map/bounds/?latlng={latMin},{lngMin},{latMax},{lngMax}&token={token}` -- All stations within Mexico's bounding box

**Response Transformation (AQICN -> AirQualityStation):**

```
AQICN station object             ->  AirQualityStation
-----------------------------        -----------------------
uid                              ->  id (prefixed "aqicn-")
station.name                     ->  name
(parsed from name)               ->  city, state
lat                              ->  lat
lon                              ->  lng
aqi                              ->  aqi (already composite)
(aqi only; no breakdown)         ->  pm25=0, pm10=0, ... (unavailable)
station.time                     ->  lastUpdated
```

**Merge Strategy:** When `source=auto`, OpenAQ stations are preferred. AQICN stations are added only if their coordinates are >5km from any OpenAQ station (de-duplication by proximity).

#### 2.2.3 datos.gob.mx CKAN API

```
Base URL:  https://api.datos.gob.mx/v1
Auth:      None required
Rate Limit: Undocumented, ~60 req/min observed
```

**Datasets queried:**

| Dataset slug                  | Maps to             | Transform notes                                   |
|-------------------------------|---------------------|----------------------------------------------------|
| `conagua.gob.mx-RENAMECA`    | WaterQualityPoint   | Need to parse lat/lng from separate fields          |
| `semarnat.gob.mx-RETC`       | PollutantCompany    | Emissions come as nested/related records            |
| `profepa.gob.mx-denuncias`   | EnvironmentalComplaint | Status mapping from numeric codes to Spanish labels |

**General Transform Pattern:**

```typescript
// src/lib/transforms.ts (NEW)
// Each transform function handles:
// 1. Null/undefined field guards
// 2. Coordinate validation (within Mexico's bounding box: 14.5-33 lat, -118.5 to -86.5 lng)
// 3. String normalisation (trim, title case for state names)
// 4. State name canonicalisation (match against MEXICAN_STATES array)
```

#### 2.2.4 Nominatim (Geocoding for Search)

```
Base URL:  https://nominatim.openstreetmap.org
Auth:      None (but requires User-Agent header)
Rate Limit: 1 req/second (strict policy)
```

**Endpoint used:**
- `GET /search?q={query}&countrycodes=mx&format=json&limit=5`

**Server-side rate limiter:** A simple in-memory timestamp check ensures we never exceed 1 req/s. On Vercel serverless, each cold start resets this, which is acceptable since it only adds delay, never exceeds the limit from a single instance.


### 2.3 Caching Strategy

```
Data Layer              Revalidation    Rationale
----------------------------------------------------------------------
Air Quality (live)      3600s (1hr)     AQI changes hourly
Air Quality (AQICN)     1800s (30min)   AQICN updates more frequently
Water Quality           86400s (24hr)   CONAGUA data is monthly/quarterly
Recycling Centers       86400s (24hr)   Static directory data
Pollutant Companies     86400s (24hr)   RETC is annual registry
Landfills               86400s (24hr)   Rarely changes
Complaints              43200s (12hr)   Moderate update frequency
Search/Geocoding        604800s (7d)    Geographic data is stable
Stats (aggregate)       3600s (1hr)     Reflects air quality freshness
```

Next.js `fetch()` with `next: { revalidate: N }` is used inside API route handlers. This means:
- First request hits the external API and caches the response.
- Subsequent requests within the revalidation window serve the cached response instantly.
- After the window expires, the next request triggers a background revalidation (ISR behavior).
- On Vercel, this uses the Edge cache (CDN-level), not in-memory.


### 2.4 Fallback Mechanism

```
Request Flow with Fallback
--------------------------

Client GET /api/air-quality?state=Jalisco&source=auto
  |
  v
API Route Handler
  |
  +--[1] Try OpenAQ API
  |    |
  |    +-- Success? -> Transform -> Filter by state -> Return { meta.source: "live" }
  |    |
  |    +-- Failure (network/timeout/4xx/5xx)?
  |         |
  |         +--[2] Try AQICN API
  |              |
  |              +-- Success? -> Transform -> Filter -> Return { meta.source: "live" }
  |              |
  |              +-- Failure?
  |                   |
  |                   +--[3] Return sample data -> Filter -> Return { meta.source: "sample" }
  |
  v
Client receives ApiResponse<AirQualityStation>
  - Checks meta.source
  - If "sample", displays subtle banner: "Mostrando datos de ejemplo"
```

**Implementation Pattern (shared across all routes):**

```typescript
// src/lib/api-helpers.ts (NEW)

export async function withFallback<T>(
  liveFetcher: () => Promise<T[]>,
  sampleData: T[],
  filterFn?: (item: T) => boolean
): Promise<{ data: T[]; source: "live" | "sample" }> {
  try {
    const liveData = await liveFetcher();
    if (liveData.length === 0) throw new Error("Empty response");
    const filtered = filterFn ? liveData.filter(filterFn) : liveData;
    return { data: filtered, source: "live" };
  } catch (error) {
    console.warn("Live fetch failed, using sample data:", error);
    const filtered = filterFn ? sampleData.filter(filterFn) : sampleData;
    return { data: filtered, source: "sample" };
  }
}
```

**Timeout enforcement:** All external fetches use `AbortSignal.timeout(8000)` (8-second timeout) to avoid Vercel's 10-second serverless function limit.

```typescript
const res = await fetch(url, {
  signal: AbortSignal.timeout(8000),
  next: { revalidate: 3600 },
  headers: { "X-API-Key": process.env.OPENAQ_API_KEY || "" },
});
```

---

## 3. Frontend Architecture

### 3.1 Component Hierarchy

```
app/layout.tsx (Server Component -- metadata, lang="es", global styles)
  |
  app/page.tsx (Client Component -- top-level state orchestrator)
    |
    +-- StatsBar              (stats ribbon at top)
    |
    +-- MobileNav             (NEW -- hamburger + bottom nav for mobile)
    |
    +-- Main Content Area (flex row)
    |     |
    |     +-- Sidebar          (layer toggles, state filter, search)
    |     |     |
    |     |     +-- SearchBar        (NEW -- city/address geocoding input)
    |     |     +-- LayerToggles     (extracted from Sidebar)
    |     |     +-- StateFilter      (extracted from Sidebar)
    |     |     +-- Legend           (extracted from Sidebar)
    |     |
    |     +-- MapView          (Leaflet map container)
    |           |
    |           +-- MapMarkerLayer   (NEW -- per-layer marker management)
    |           +-- MapPopup         (NEW -- reusable popup content renderer)
    |           +-- MarkerCluster    (NEW -- clusters dense markers)
    |           +-- MapControls      (NEW -- zoom-to-location, recenter)
    |
    +-- DetailPanel           (NEW -- slide-over panel for selected item)
    |
    +-- DataSourceBanner      (NEW -- shows "sample data" warning if applicable)
    |
    +-- LoadingOverlay        (NEW -- full-layer loading indicator)
```

### 3.2 New Components Specification

#### `src/components/SearchBar.tsx` (NEW)

```
Props:
  onSelectResult: (result: { lat: number; lng: number; name: string; state: string }) => void

Internal State:
  query: string                     -- Debounced input text (300ms)
  results: SearchResult[]           -- Geocoding results from /api/search
  isLoading: boolean
  isOpen: boolean                   -- Dropdown visibility

Behavior:
  - Input with type-ahead dropdown
  - Calls /api/search?q={query} after 300ms debounce
  - Minimum 3 characters before searching
  - On result selection: calls onSelectResult, which triggers map.flyTo()
  - Escape key closes dropdown
  - Click outside closes dropdown
```

#### `src/components/DetailPanel.tsx` (NEW)

```
Props:
  item: AirQualityStation | WaterQualityPoint | RecyclingCenter | ... | null
  layer: MapLayer | null
  onClose: () => void

Behavior:
  - Slides in from the right on desktop (w-96, absolute positioned)
  - Slides up as bottom sheet on mobile (h-1/2, fixed bottom)
  - Renders layer-specific detail view with all fields
  - Close button + swipe-down gesture on mobile
  - Includes link to data source (e.g., "Ver en RETC" for pollutant companies)
```

#### `src/components/MobileNav.tsx` (NEW)

```
Props:
  sidebarOpen: boolean
  onToggleSidebar: () => void
  activeLayerCount: number

Behavior:
  - Fixed bottom bar on screens < lg breakpoint
  - Shows: hamburger toggle, active layer count badge, search shortcut, stats shortcut
  - Hidden on desktop (lg:hidden)
```

#### `src/components/DataSourceBanner.tsx` (NEW)

```
Props:
  source: "live" | "sample"
  layerName: string

Behavior:
  - When source === "sample", shows a thin yellow bar above map:
    "Mostrando datos de ejemplo para {layerName}. Los datos en vivo no estan disponibles."
  - Dismissable (click X to hide for session)
  - When source === "live", renders nothing
```

#### `src/components/LoadingOverlay.tsx` (NEW)

```
Props:
  isLoading: boolean
  message?: string

Behavior:
  - Semi-transparent overlay on the map area
  - Animated spinner + message (default: "Cargando datos...")
  - Only shows when isLoading is true
```

#### `src/components/map/MapMarkerLayer.tsx` (NEW)

```
Props:
  layer: MapLayer
  data: any[]                       -- Typed per-layer via generics/union
  selectedState: string
  onMarkerClick: (item: any, layer: MapLayer) => void

Behavior:
  - Extracts marker-rendering logic from the monolithic MapView useEffect
  - One instance per active layer
  - Handles marker creation, popup binding, and click events
  - Returns null if layer data is empty
```

#### `src/components/map/MarkerCluster.tsx` (NEW)

```
Dependency: leaflet.markercluster (to be added to package.json)

Behavior:
  - Wraps MapMarkerLayer children in a MarkerClusterGroup
  - Clusters markers when zoom < 8 (configurable)
  - Cluster icons show count with layer-appropriate color
  - Spiderfies on click at max zoom
```

### 3.3 State Management

All state lives in `page.tsx` (the single client-side orchestrator). No global state library needed.

```typescript
// src/app/page.tsx -- State declarations

// --- UI State ---
const [sidebarOpen, setSidebarOpen] = useState(true);
const [detailPanelItem, setDetailPanelItem] = useState<SelectedItem | null>(null);

// --- Filter State ---
const [activeLayers, setActiveLayers] = useState<MapLayer[]>(["air-quality"]);
const [selectedState, setSelectedState] = useState("");
const [searchLocation, setSearchLocation] = useState<{lat: number; lng: number} | null>(null);

// --- Data State (one per layer) ---
const [layerData, setLayerData] = useState<Record<MapLayer, {
  data: any[];
  source: "live" | "sample";
  loading: boolean;
  error: string | null;
}>>({
  "air-quality":  { data: [], source: "sample", loading: false, error: null },
  "water-quality": { data: [], source: "sample", loading: false, error: null },
  "recycling":     { data: [], source: "sample", loading: false, error: null },
  "pollutants":    { data: [], source: "sample", loading: false, error: null },
  "landfills":     { data: [], source: "sample", loading: false, error: null },
  "complaints":    { data: [], source: "sample", loading: false, error: null },
});
```

**Why not useReducer?** The state shape is flat and each piece is independent. `useState` is clearer here. If state interactions become complex (e.g., undo/redo), migrate to `useReducer`.

**State Flow Diagram:**

```
User toggles layer "pollutants"
  |
  v
setActiveLayers(prev => [...prev, "pollutants"])
  |
  v
useEffect detects "pollutants" in activeLayers but layerData["pollutants"].data is empty
  |
  v
Fetch /api/pollutant-companies?state={selectedState}
  |
  v
setLayerData(prev => ({
  ...prev,
  pollutants: { data: response.results, source: response.meta.source, loading: false, error: null }
}))
  |
  v
MapView re-renders with new data -> MapMarkerLayer for "pollutants" creates markers
```


### 3.4 Data Fetching Strategy

#### Fetch-on-Activate Pattern

Layers are fetched lazily: data is only requested when a layer is toggled on for the first time. Once fetched, data is cached in React state for the session.

```typescript
// src/hooks/useLayerData.ts (NEW custom hook)

export function useLayerData(
  layer: MapLayer,
  isActive: boolean,
  selectedState: string
) {
  const [state, setState] = useState<LayerDataState>({
    data: [],
    source: "sample",
    loading: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isActive) return;

    // Cancel previous request for this layer
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState(prev => ({ ...prev, loading: true, error: null }));

    const endpoint = LAYER_ENDPOINTS[layer]; // maps layer -> API path
    const params = new URLSearchParams();
    if (selectedState) params.set("state", selectedState);

    fetch(`/api/${endpoint}?${params}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        setState({
          data: json.results,
          source: json.meta.source,
          loading: false,
          error: null,
        });
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        setState(prev => ({
          ...prev,
          loading: false,
          error: ERROR_MESSAGES[layer],
        }));
      });

    return () => controller.abort();
  }, [layer, isActive, selectedState]);

  return state;
}
```

#### Endpoint Mapping

```typescript
// src/lib/constants.ts (NEW)

export const LAYER_ENDPOINTS: Record<MapLayer, string> = {
  "air-quality": "air-quality",
  "water-quality": "water-quality",
  "recycling": "recycling-centers",
  "pollutants": "pollutant-companies",
  "landfills": "landfills",
  "complaints": "complaints",
};

export const ERROR_MESSAGES: Record<MapLayer, string> = {
  "air-quality": "No se pudieron cargar los datos de calidad del aire",
  "water-quality": "No se pudieron cargar los datos de calidad del agua",
  "recycling": "No se pudieron cargar los centros de reciclaje",
  "pollutants": "No se pudieron cargar las empresas contaminantes",
  "landfills": "No se pudieron cargar los rellenos sanitarios",
  "complaints": "No se pudieron cargar las denuncias ambientales",
};
```


### 3.5 Map Interactions

#### 3.5.1 Refactored MapView

The current `MapView.tsx` is a 297-line monolith. It will be refactored into:

```
src/components/MapView.tsx         -- Map container, initialisation, tile layer
src/components/map/
  MapMarkerLayer.tsx               -- Per-layer marker rendering (extracted from useEffect)
  MarkerCluster.tsx                -- Clustering wrapper
  MapPopup.tsx                     -- Popup content templates (extracted from inline HTML)
  MapControls.tsx                  -- Custom control buttons (recenter, locate-me)
  useMapInstance.ts                -- Custom hook for Leaflet map lifecycle
```

#### 3.5.2 Click Handler Flow

```
User clicks marker
  |
  v
MapMarkerLayer.onMarkerClick(item, layer)
  |
  v
page.tsx receives callback -> setDetailPanelItem({ item, layer })
  |
  v
DetailPanel slides open with full item details
  |
  v
User clicks "Cerrar" or clicks another marker
  |
  v
setDetailPanelItem(null) or setDetailPanelItem(newItem)
```

#### 3.5.3 Zoom-to-Location (Search)

```
User types "Querétaro" in SearchBar
  |
  v (300ms debounce)
GET /api/search?q=Queretaro
  |
  v
SearchBar shows dropdown: ["Querétaro, Querétaro, Mexico"]
  |
  v
User selects result
  |
  v
page.tsx -> setSearchLocation({ lat: 20.588, lng: -100.389 })
  |
  v
MapView useEffect detects searchLocation change
  |
  v
map.flyTo([20.588, -100.389], 12, { duration: 1.5 })
```

#### 3.5.4 Marker Clustering

For dense areas (e.g., 50+ recycling centers in CDMX), we use `leaflet.markercluster`:

```
New dependency: leaflet.markercluster (npm package)
New dependency: @types/leaflet.markercluster

Configuration:
  maxClusterRadius: 50        -- Pixels; cluster markers within 50px
  spiderfyOnMaxZoom: true     -- Fan out overlapping markers at max zoom
  disableClusteringAtZoom: 14 -- Show individual markers at street level
  chunkedLoading: true        -- Non-blocking marker addition for large datasets
```

Each layer gets its own `MarkerClusterGroup` so clusters are color-coded per layer.


### 3.6 Responsive Design

#### Breakpoint Strategy (Tailwind v4)

```
< 640px  (sm)   -- Mobile phone portrait
< 768px  (md)   -- Mobile phone landscape / small tablet
< 1024px (lg)   -- Tablet / small laptop <-- PRIMARY BREAKPOINT for layout shift
>= 1024px       -- Desktop
```

#### Layout Behavior by Breakpoint

**Desktop (>= 1024px):**
```
+---------------------------------------------------+
| StatsBar (horizontal scroll if needed)             |
+----------+----------------------------------------+
| Sidebar  |                                        |
| (w-80)   |           MapView                      |
| (fixed)  |           (flex-1)                     |
|          |                                        |
|          |                     [DetailPanel w-96] |
+----------+----------------------------------------+
```

**Tablet / Mobile (< 1024px):**
```
+---------------------------------------------------+
| StatsBar (compact: 3 visible, swipe for more)      |
+---------------------------------------------------+
|                                                    |
|                  MapView (full width)              |
|                                                    |
|    [Sidebar slides in from left as overlay]        |
|    [DetailPanel slides up as bottom sheet]          |
|                                                    |
+---------------------------------------------------+
| MobileNav (fixed bottom bar)                       |
+---------------------------------------------------+
```

#### Specific Responsive Adaptations

| Component    | Desktop                      | Mobile (< lg)                        |
|-------------|------------------------------|---------------------------------------|
| Sidebar     | Static, always visible       | Overlay drawer, slides from left      |
| StatsBar    | All 6 stats visible          | Horizontally scrollable, 3 visible    |
| DetailPanel | Side panel (right, w-96)     | Bottom sheet (h-1/2, swipe to close)  |
| SearchBar   | Inside Sidebar               | Accessible via MobileNav icon         |
| MapControls | Top-right corner             | Bottom-right, above MobileNav         |
| Popups      | Standard Leaflet popups      | Tap opens DetailPanel instead         |
| Layer toggles| Visible in Sidebar          | Inside mobile Sidebar drawer          |

#### Touch Optimizations

- Map markers: minimum 44x44px touch target (increase icon sizes from 26-30px to 44px on mobile via CSS media query on `.leaflet-marker-icon`)
- Sidebar layer buttons: `min-h-[48px]` on mobile
- Bottom sheet: touch drag handle, `touch-action: pan-y` for smooth swiping
- Map: disable `doubleClickZoom` on mobile (interferes with tap), keep `tap: true`

---

## 4. Cross-Cutting Concerns

### 4.1 Error Handling Flow

```
External API Error
  |
  v
API Route catches error
  |
  +-- Log full error to console (server-side, visible in Vercel logs)
  |
  +-- If fallback data available:
  |     Return 200 with sample data + meta.source="sample"
  |
  +-- If no fallback possible (e.g., /api/search with bad query):
        Return 500 with ApiErrorResponse { error: "...", code: "..." }
        |
        v
Client receives error
  |
  +-- useLayerData hook sets error state
  |
  +-- MapView shows inline error toast (not blocking):
  |     "No se pudieron cargar los datos de calidad del aire. Mostrando datos de ejemplo."
  |
  +-- DataSourceBanner shows yellow banner with retry button
```

**Error Messages (All in Spanish):**

```typescript
// src/lib/error-messages.ts (NEW)

export const API_ERRORS = {
  NETWORK_ERROR: "Error de conexion. Verifica tu conexion a internet.",
  TIMEOUT: "La solicitud tardo demasiado. Intenta de nuevo.",
  RATE_LIMITED: "Demasiadas solicitudes. Intenta en unos minutos.",
  SERVER_ERROR: "Error del servidor. Mostrando datos de ejemplo.",
  NO_RESULTS: "No se encontraron resultados para esta busqueda.",
  GEOCODING_FAILED: "No se pudo encontrar la ubicacion. Intenta con otro termino.",
} as const;
```


### 4.2 Performance Optimizations

#### 4.2.1 Lazy Loading Layers

```
Initial page load:
  1. Layout + page.tsx + Sidebar (SSR/RSC where possible)
  2. MapView loaded via next/dynamic with { ssr: false }
  3. Only "air-quality" layer is active by default
  4. Other 5 layers fetch data only when toggled on

Bundle impact:
  - Leaflet CSS: loaded via <link> (no bundle cost)
  - Leaflet JS: ~140KB gzipped (loaded in MapView dynamic import)
  - leaflet.markercluster: ~10KB gzipped (loaded on demand)
  - Each layer's data: 5-50KB JSON (fetched on activation)
```

#### 4.2.2 Debounced Search

```
SearchBar input
  |
  +-- onChange updates local query state immediately (instant UI feedback)
  |
  +-- Debounce timer resets on each keystroke (300ms)
  |
  +-- After 300ms of inactivity + query.length >= 3:
        Fetch /api/search?q={query}
```

Implementation:

```typescript
// src/hooks/useDebounce.ts (NEW)
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}
```

#### 4.2.3 Marker Clustering Performance

Without clustering, 500+ markers cause visible jank on mobile. With `leaflet.markercluster`:
- Markers are added in chunks (`chunkedLoading: true`) to avoid blocking the main thread.
- At zoom levels 5-8, most markers are clustered into ~20-30 cluster icons.
- Only visible markers are rendered (Leaflet's built-in viewport culling).

#### 4.2.4 Map Rendering Optimization

- The current implementation clears and re-adds ALL markers on every state change. Refactored approach:
  - Each `MapMarkerLayer` manages its own `L.LayerGroup`.
  - Toggling a layer off calls `layerGroup.remove()` (O(1)) instead of iterating all map layers.
  - State filter change only re-renders layers that are affected.

```typescript
// Efficient layer toggle
const layerGroupRef = useRef<L.LayerGroup | null>(null);

useEffect(() => {
  if (!map) return;
  if (isActive) {
    layerGroupRef.current = L.layerGroup(markers).addTo(map);
  } else {
    layerGroupRef.current?.remove();
  }
}, [isActive, map, markers]);
```


### 4.3 SEO and Metadata

#### 4.3.1 Static Metadata (Already Implemented in `layout.tsx`)

Current metadata in `layout.tsx` is good. Enhance with OpenGraph:

```typescript
// src/app/layout.tsx -- Enhanced metadata

export const metadata: Metadata = {
  title: "EcoMapa MX - Mapa Ambiental de Mexico",
  description:
    "Plataforma de monitoreo ambiental que unifica datos de calidad del aire, agua, reciclaje, emisiones industriales y denuncias ambientales en Mexico.",
  keywords: [
    "medio ambiente", "contaminacion", "Mexico", "calidad del aire",
    "rios contaminados", "reciclaje", "RETC", "SEMARNAT", "CONAGUA",
    "mapa ambiental", "denuncias ambientales", "PROFEPA",
  ],
  openGraph: {
    title: "EcoMapa MX - Mapa Ambiental de Mexico",
    description: "Visualiza la calidad del aire, agua, emisiones industriales y mas en un solo mapa interactivo de Mexico.",
    type: "website",
    locale: "es_MX",
    siteName: "EcoMapa MX",
    images: [
      {
        url: "/og-image.png",    // 1200x630 static image showing the map
        width: 1200,
        height: 630,
        alt: "EcoMapa MX - Mapa ambiental interactivo de Mexico",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EcoMapa MX",
    description: "Monitoreo ambiental de Mexico en un mapa interactivo.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://ecomapa.mx",
  },
};
```

#### 4.3.2 Structured Data (JSON-LD)

Add to `layout.tsx` for search engine rich results:

```typescript
// In layout.tsx <head>
<script type="application/ld+json">
{JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "EcoMapa MX",
  "description": "Plataforma de monitoreo ambiental de Mexico",
  "url": "https://ecomapa.mx",
  "applicationCategory": "EnvironmentalApplication",
  "operatingSystem": "Web",
  "availableLanguage": "es",
  "isAccessibleForFree": true,
})}
</script>
```

#### 4.3.3 SEO Limitations

Since the map is entirely client-rendered (`"use client"` + dynamic import with `ssr: false`), search engines will see minimal content. Mitigations:
- The `<noscript>` fallback in `MapView` can include a text summary of data sources.
- The metadata and structured data above provide sufficient context for search engines.
- A future `/about` page (static RSC) can provide crawlable content about the data sources.

---

## 5. File Tree (Target State)

```
src/
  app/
    layout.tsx                          -- Root layout (enhanced metadata + JSON-LD)
    page.tsx                            -- Client orchestrator (state management hub)
    globals.css                         -- Tailwind v4 imports + Leaflet overrides
    api/
      air-quality/route.ts              -- MODIFIED: OpenAQ -> AQICN -> sample fallback chain
      water-quality/route.ts            -- MODIFIED: CKAN integration + fallback
      recycling-centers/route.ts        -- MODIFIED: CKAN integration + fallback
      pollutant-companies/route.ts      -- MODIFIED: CKAN integration + fallback
      landfills/route.ts                -- MODIFIED: CKAN integration + fallback
      complaints/route.ts               -- MODIFIED: CKAN integration + fallback
      search/route.ts                   -- NEW: Nominatim geocoding proxy
      stats/route.ts                    -- NEW: Aggregated statistics endpoint
  components/
    MapView.tsx                         -- MODIFIED: Refactored to use sub-components
    Sidebar.tsx                         -- MODIFIED: Integrates SearchBar, extracted sub-pieces
    StatsBar.tsx                        -- MODIFIED: Fetches from /api/stats, respects state filter
    SearchBar.tsx                       -- NEW: Debounced geocoding search input
    DetailPanel.tsx                     -- NEW: Side panel / bottom sheet for item details
    MobileNav.tsx                       -- NEW: Fixed bottom nav for mobile
    DataSourceBanner.tsx                -- NEW: "Sample data" warning banner
    LoadingOverlay.tsx                  -- NEW: Layer loading indicator
    map/
      MapMarkerLayer.tsx                -- NEW: Per-layer marker rendering
      MarkerCluster.tsx                 -- NEW: Clustering wrapper
      MapPopup.tsx                      -- NEW: Popup content templates
      MapControls.tsx                   -- NEW: Custom map control buttons
      useMapInstance.ts                 -- NEW: Map lifecycle hook
  hooks/
    useLayerData.ts                     -- NEW: Data fetching hook per layer
    useDebounce.ts                      -- NEW: Generic debounce hook
  lib/
    data-sources.ts                     -- MODIFIED: Add timeout, improve error handling
    sample-data.ts                      -- UNCHANGED: Fallback data
    api-helpers.ts                      -- NEW: withFallback(), response builders
    transforms.ts                       -- NEW: External API -> internal type transformers
    aqi-calculator.ts                   -- NEW: PM2.5 -> AQI conversion
    constants.ts                        -- NEW: Layer endpoints, error messages, config
    error-messages.ts                   -- NEW: Spanish error message constants
  types/
    index.ts                            -- MODIFIED: Add SearchResult, SelectedItem, StatsResponse
    api.ts                              -- NEW: ApiResponse, ApiErrorResponse envelopes
  public/
    og-image.png                        -- NEW: OpenGraph preview image (1200x630)
```

**New npm Dependencies:**

```json
{
  "leaflet.markercluster": "^1.5.3",
  "@types/leaflet.markercluster": "^1.5.4"
}
```

No other runtime dependencies added. The architecture deliberately avoids SWR, Zustand, or other state libraries to keep the bundle lean.


---

## 6. Data Flow Diagrams

### 6.1 Full Request Lifecycle (Air Quality Example)

```
Browser                    Vercel Serverless              External APIs
-------                    -----------------              -------------

[Toggle "Calidad del Aire" ON]
       |
       |  GET /api/air-quality?state=Jalisco&source=auto
       |--------------------------------------------------------->
       |                          |
       |                          |  fetch("https://api.openaq.org/v3/locations?...")
       |                          |  Headers: X-API-Key: <env>
       |                          |  Timeout: 8s
       |                          |-------------------------------------------->
       |                          |                                   |
       |                          |         200 OK { results: [...] }  |
       |                          |<------------------------------------|
       |                          |
       |                          |  transformOpenAqToStations(response)
       |                          |  filterByState("Jalisco")
       |                          |  buildApiResponse(data, "live")
       |                          |
       |  200 OK                  |
       |  {                       |
       |    results: [...],       |
       |    meta: {               |
       |      source: "live",     |
       |      count: 3,           |
       |      fetchedAt: "...",   |
       |      state: "Jalisco"    |
       |    }                     |
       |  }                       |
       |<-------------------------|
       |
[useLayerData updates state]
[MapMarkerLayer renders 3 markers]
[StatsBar updates AQI average]
```

### 6.2 Fallback Cascade

```
API Route: /api/air-quality?source=auto

Step 1: Try OpenAQ
  |
  +-- [OK, data.length > 0] --> Transform --> Return { source: "live" }
  |
  +-- [Fail: timeout / 5xx / empty]
       |
       Step 2: Try AQICN
         |
         +-- [OK, data.length > 0] --> Transform --> Return { source: "live" }
         |
         +-- [Fail: no token / timeout / error]
              |
              Step 3: Return sample data --> Return { source: "sample" }
```

### 6.3 Client State Dependencies

```
                        page.tsx State
                        ==============

  activeLayers ----+---> useLayerData("air-quality", true, state)  --> layerData["air-quality"]
                   |---> useLayerData("water-quality", false, state) --> (skipped, not active)
                   |---> useLayerData("pollutants", true, state)    --> layerData["pollutants"]
                   |---> ... (one hook per layer)
                   |
  selectedState ---+---> Triggers re-fetch for all active layers
                   |---> Passed to Sidebar (selected option)
                   |---> Passed to StatsBar (scoped stats)
                   |
  searchLocation --+---> MapView: map.flyTo(searchLocation, 12)
                   |
  detailPanelItem -+---> DetailPanel: renders selected item
                   |---> MapView: highlights selected marker
```

### 6.4 Mobile Interaction Flow

```
[User on mobile phone]
       |
[Sees map full-screen with MobileNav at bottom]
       |
[Taps hamburger icon in MobileNav]
       |
[Sidebar slides in as overlay from left]
       |
[Toggles "Reciclaje" layer ON]
       |
[Sidebar auto-closes on mobile after toggle]
       |
[Map shows recycling center markers + loading spinner]
       |
[Taps a recycling center marker]
       |
[DetailPanel slides up as bottom sheet (50% height)]
       |
[Sees full center details: name, address, materials, schedule]
       |
[Swipes down or taps X to close bottom sheet]
       |
[Back to full-screen map view]
```

---

## Appendix A: Types Additions

```typescript
// Additions to src/types/index.ts

export interface SearchResult {
  displayName: string;
  lat: number;
  lng: number;
  state: string;
  type: string; // "city", "town", "village", etc.
}

export interface SelectedItem {
  item: AirQualityStation | WaterQualityPoint | RecyclingCenter
        | PollutantCompany | Landfill | EnvironmentalComplaint;
  layer: MapLayer;
}

export interface StatsResponse {
  airQuality: {
    stationCount: number;
    averageAqi: number;
    worstStation: { name: string; aqi: number } | null;
  };
  waterQuality: {
    pointCount: number;
    contaminatedCount: number;
    worstRiver: { name: string; quality: string } | null;
  };
  recycling: { centerCount: number };
  pollutants: {
    companyCount: number;
    topEmitter: { name: string; totalEmissions: number } | null;
  };
  landfills: {
    totalCount: number;
    activeCount: number;
    openDumpCount: number;
  };
  complaints: {
    totalCount: number;
    pendingCount: number;
    byResource: Record<string, number>;
  };
}

export interface LayerDataState<T = unknown> {
  data: T[];
  source: "live" | "sample";
  loading: boolean;
  error: string | null;
}
```

## Appendix B: Environment Variables

```env
# .env.local (required for live data; app works without them using sample data)

# OpenAQ - https://docs.openaq.org/ (free, requires registration)
OPENAQ_API_KEY=

# AQICN - https://aqicn.org/data-platform/token/ (free, requires registration)
AQICN_API_KEY=

# No API key needed for:
# - datos.gob.mx CKAN API
# - Nominatim geocoding (but requires User-Agent header)
```

## Appendix C: Vercel Configuration Notes

```
Runtime:            Node.js 20.x (default)
Functions:          Serverless (not Edge) -- needed for fetch with revalidate
Max Duration:       10s (free tier) -- all external fetches use 8s timeout
Regions:            iad1 (US East, closest to Mexico for latency)
Environment Vars:   OPENAQ_API_KEY, AQICN_API_KEY (set in Vercel dashboard)
Build Command:      next build (default)
Output:             .next (default)
ISR Cache:          Managed by Vercel automatically via fetch revalidate
```
