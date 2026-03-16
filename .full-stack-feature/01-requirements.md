# Requirements: Live Environmental Data Integration & Interactive Dashboard

## Problem Statement
Mexico lacks a unified platform that aggregates environmental data from multiple government sources (SINAICA, CONAGUA, SEMARNAT RETC, PROFEPA) into a single interactive map. Citizens, researchers, and activists need one place to see air quality, water pollution, industrial emitters, recycling centers, and environmental complaints across the country.

## Acceptance Criteria
- [ ] Real-time air quality data from OpenAQ API displayed on map with AQI color coding
- [ ] AQICN backup data feed for broader Mexico station coverage
- [ ] Water quality monitoring points from CONAGUA/RENAMECA shown with contamination levels
- [ ] Industrial pollutant emitters from RETC registry plotted with emission details
- [ ] Recycling center directory searchable by location and material type
- [ ] Environmental complaints from PROFEPA with status tracking
- [ ] Landfill/dump site locations from CEC North American Atlas data
- [ ] State-level filtering for all data layers
- [ ] Search by city/address with geocoding
- [ ] Statistics dashboard showing national environmental indicators
- [ ] Mobile-responsive design
- [ ] Data caching (1hr for air quality, 24hr for static registries)
- [ ] Graceful fallback to sample data when APIs are unavailable

## Scope

### In Scope
- OpenAQ API integration (air quality - Mexico stations)
- AQICN API integration (backup air quality feed)
- datos.gob.mx CKAN API integration (RETC, PROFEPA, CONAGUA datasets)
- Server-side API routes with caching
- Interactive Leaflet map with 6 toggleable layers
- Search/filter sidebar
- Statistics bar with aggregated indicators
- Mobile-responsive layout
- Error handling and loading states

### Out of Scope
- User authentication/accounts
- Community reporting (citizen submissions)
- Push notifications
- Native mobile app
- Historical data analysis/trends
- Data export functionality

## Technical Constraints
- Next.js 16 with App Router (already scaffolded)
- TypeScript strict mode
- Tailwind CSS v4 for styling
- Leaflet for mapping (no Mapbox token required)
- OpenAQ free API key (rate limited)
- AQICN free token
- datos.gob.mx CKAN API (no auth, rate limited)
- Must work without API keys (fallback to sample data)
- Deploy to Vercel (serverless, no persistent state)

## Technology Stack
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Leaflet/react-leaflet
- **Backend:** Next.js API Routes (serverless)
- **Database:** None (API aggregation layer, no persistent storage)
- **APIs:** OpenAQ v3, AQICN, datos.gob.mx CKAN
- **Hosting:** Vercel

## Dependencies
- OpenAQ API availability and rate limits
- AQICN API availability
- datos.gob.mx uptime and data freshness
- Leaflet CDN for map tiles (OpenStreetMap)

## Configuration
- Stack: Next.js 16 / TypeScript / Tailwind v4 / Leaflet
- API Style: REST
- Complexity: Complex (6 data layers, 3 external APIs, caching, mobile responsive)
