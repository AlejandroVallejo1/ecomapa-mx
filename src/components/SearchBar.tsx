"use client";
import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface SearchBarProps {
  onSelect: (location: { lat: number; lng: number; name: string }) => void;
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, {
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(json => {
        setResults(json.results || []);
        setIsOpen((json.results || []).length > 0);
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          setResults([]);
          setIsOpen(false);
        }
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  function handleSelect(result: SearchResult) {
    onSelect({
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      name: result.display_name,
    });
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <div className="glass rounded-lg flex items-center gap-2 px-3 py-2">
        <svg
          className="w-4 h-4 text-slate-500 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          className="bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none w-full"
          placeholder="Buscar ciudad o direccion..."
        />
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full glass rounded-lg max-h-48 overflow-y-auto z-50">
          {results.map((r, i) => (
            <button
              key={i}
              onMouseDown={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.06] transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
