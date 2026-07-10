"use client";

import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function Home() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentMarkers = useRef<maplibregl.Marker[]>([]);
  
  const [newsFeatures, setNewsFeatures] = useState<any[]>([]);
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedStatus, setFeedStatus] = useState<'CONNECTING' | 'LIVE' | 'OFFLINE'>('CONNECTING');
  const [isFeedOpen, setIsFeedOpen] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [activeLayers, setActiveLayers] = useState({ security: true, environment: true, general: true });

  // Derived state for strict GeoJSON coordinate validation
  const validFeatures = Array.isArray(newsFeatures)
    ? newsFeatures.filter((feature) => {
        if (!feature || !feature.geometry) return false;
        const coords = feature.geometry.coordinates;
        return (
          Array.isArray(coords) &&
          coords.length >= 2 &&
          typeof coords[0] === "number" &&
          typeof coords[1] === "number" &&
          !isNaN(coords[0]) &&
          !isNaN(coords[1])
        );
      })
    : [];

  // Derived state to filter validFeatures based on active layers
  const filteredFeatures = validFeatures.filter((feature) => {
    const themes = feature.properties?.themes || feature.properties?.theme || "";
    const isSecurity = themes.includes("PROTEST") || themes.includes("CRIME") || themes.includes("VIOLENCE");
    const isEnvironment = themes.includes("ENV_WEATHER") || themes.includes("NATURAL_DISASTER");
    
    if (isSecurity) return activeLayers.security;
    if (isEnvironment) return activeLayers.environment;
    return activeLayers.general;
  });

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [78.9629, 20.5937], // Center of India
      zoom: 4.5,
      attributionControl: false
    });

    mapRef.current = map;
    if (typeof window !== "undefined") {
      (window as any).map = map;
    }

    map.on("load", () => {
      // Add standard navigation controls in the bottom right corner
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      // Inject Legally Compliant India boundaries from DataMeet
      map.addSource("india-official-border", {
        type: "geojson",
        data: "https://raw.githubusercontent.com/datameet/maps/master/Country/india-composite.geojson"
      });

      // Fill mask layer to blend any pre-existing dotted lines from base tiles
      map.addLayer({
        id: "india-border-fill",
        type: "fill",
        source: "india-official-border",
        paint: {
          "fill-color": "#020617", // slate-950
          "fill-opacity": 0.15
        }
      });

      // Sharp Neon Cyan boundary line layer
      map.addLayer({
        id: "india-border-line",
        type: "line",
        source: "india-official-border",
        paint: {
          "line-color": "#22d3ee", // Neon Cyan
          "line-width": 2,
          "line-opacity": 0.9
        }
      });

      setMapLoaded(true);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Fetch GDELT feed from our backend API route
  useEffect(() => {
    const fetchNewsData = async () => {
      try {
        setLoading(true);
        setFeedStatus('CONNECTING');
        const response = await fetch("/api/news");
        if (!response.ok) {
          const errorPayload = await response.text();
          console.error("RAW BACKEND ERROR:", errorPayload);
          setFeedStatus('OFFLINE');
          return; // Gracefully exit the function instead of throwing an error
        }
        const data = await response.json();
        
        console.log("Frontend received:", data);
        
        if (data && data.features) {
          setNewsFeatures(data.features);
          setFeedStatus('LIVE');
        } else {
          setFeedStatus('OFFLINE');
        }
      } catch (error) {
        console.error("Network Fetch Failed:", error);
        setFeedStatus('OFFLINE');
      } finally {
        setLoading(false);
      }
    };

    fetchNewsData();
  }, []);

  // Sync news pins whenever map or GDELT data loads
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    // Clear old markers using currentMarkers
    currentMarkers.current.forEach((marker) => marker.remove());
    currentMarkers.current = [];

    const map = mapRef.current;

    // Render validated markers mapping over filteredFeatures
    filteredFeatures.forEach((feature, index) => {
      const coords = feature.geometry.coordinates;
      const lng = coords[0];
      const lat = coords[1];

      // Assign theme-based styling (robust checks for property names)
      const themes = feature.properties?.themes || feature.properties?.theme || "";
      const isProtestOrCrime = themes.includes("PROTEST") || themes.includes("CRIME");
      const isDisasterOrWeather = themes.includes("NATURAL_DISASTER") || themes.includes("ENV_WEATHER");

      let themeColor = "#22d3ee"; // default Neon Cyan
      let themeLabel = "NEWS";
      if (isProtestOrCrime) {
        themeColor = "#ef4444"; // Neon Red
        themeLabel = themes.includes("PROTEST") ? "PROTEST" : "CRIME";
      } else if (isDisasterOrWeather) {
        themeColor = "#3b82f6"; // Neon Blue
        themeLabel = themes.includes("NATURAL_DISASTER") ? "DISASTER" : "WEATHER";
      }

      // Create Custom Pulsing Marker element
      const el = document.createElement("div");
      el.className = "custom-marker";
      el.style.color = themeColor;
      el.style.backgroundColor = themeColor;

      // Tooltip for location hover
      const locationName = feature.properties?.name || "India Location";
      el.setAttribute("title", locationName);

      const sourceUrl = feature.properties?.url || "#";
      const displayThemes = themes.split(";").filter(Boolean).slice(0, 3).join(", ") || "GENERAL";

      // Configure OSINT tactical styled popup content
      const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
        <div style="font-family: monospace; min-width: 240px; word-wrap: break-word;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px; border: 1px solid ${themeColor}44; color: ${themeColor}; background: ${themeColor}15;">
              ${themeLabel}
            </span>
            <span style="font-size: 9px; color: #64748b;">LIVE_INTEL</span>
          </div>
          <h4 style="font-size: 13px; font-weight: 600; color: #ffffff; margin: 4px 0; line-height: 1.4;">${locationName}</h4>
          <p style="font-size: 10px; color: #cbd5e1; margin: 6px 0 8px 0; line-height: 1.3;">
            Themes: <span style="color: #94a3b8;">${displayThemes}</span>
          </p>
          <div style="margin-top: 8px; border-top: 1px solid #334155; padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
            <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; color: #22d3ee; text-decoration: none; font-weight: bold;">
              VIEW REPORT &gt;
            </a>
            <span style="font-size: 8px; color: #64748b;">GDELT ENGINE</span>
          </div>
        </div>
      `);

      const markerInstance = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      // Bind native click event listener to marker element
      markerInstance.getElement().addEventListener('click', () => {
        setSelectedIncident(feature);
        map.flyTo({
          center: [lng, lat],
          zoom: 7.0,
          essential: true
        });
      });

      // Track active state to highlight feed
      popup.on("open", () => {
        setActiveEvent(sourceUrl);
        setSelectedIncident(feature);
      });
      popup.on("close", () => {
        setActiveEvent((prev) => (prev === sourceUrl ? null : prev));
      });

      currentMarkers.current.push(markerInstance);
    });
  }, [mapLoaded, filteredFeatures]);

  // Pan to selected sidebar event
  const handleEventClick = (feature: any) => {
    if (!mapRef.current) return;
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return;

    mapRef.current.flyTo({
      center: [coords[0], coords[1]],
      zoom: 7.0,
      essential: true
    });

    const sourceUrl = feature.properties?.url || "";
    setActiveEvent(sourceUrl);
    setSelectedIncident(feature);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 flex flex-col font-mono text-slate-100 select-none">
      
      {/* Dynamic scanline overlay effect for OSINT terminal aesthetic */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0)_97%,rgba(34,211,238,0.02)_97%)] bg-[size:100%_24px] pointer-events-none z-20"></div>
      
      {/* Shadow overlay to fade edges */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_55%,rgba(2,6,23,0.85)_100%)] pointer-events-none z-20"></div>

      {/* 1. MASTER CONTROL DOCK (Top-Left Overlay) */}
      <div className="absolute top-4 left-4 z-50 w-80 bg-zinc-950/80 backdrop-blur-md border border-zinc-800 rounded-xl p-4 shadow-2xl flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <div className="flex items-baseline gap-2">
            <h1 className="text-base tracking-wider font-bold">
              <span className="text-zinc-300">IND</span>
              <span className="text-cyan-400 font-extrabold drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">INTEL</span>
            </h1>
            <span className="text-[8px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded bg-zinc-900/50">
              SYS // P3
            </span>
          </div>
        </div>

        {/* Pulsing System Status Telemetry */}
        <div className="border-t border-zinc-800/60 pt-3">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-1.5 font-mono">FEED CONNECTOR</span>
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-zinc-900/40 border border-zinc-800/80 rounded font-mono text-[9px]">
            <span className="relative flex h-1.5 w-1.5">
              {feedStatus === 'CONNECTING' && (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-yellow-500"></span>
                </>
              )}
              {feedStatus === 'LIVE' && (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
                </>
              )}
              {feedStatus === 'OFFLINE' && (
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
              )}
            </span>
            {feedStatus === 'CONNECTING' && <span className="text-yellow-400 font-bold">INTERCEPTING FEED...</span>}
            {feedStatus === 'LIVE' && <span className="text-cyan-400 font-bold">FEED: SECURE</span>}
            {feedStatus === 'OFFLINE' && <span className="text-red-400 font-bold">FEED: OFFLINE (RETRYING)</span>}
          </div>
        </div>

        {/* Data Vector Filters */}
        <div className="border-t border-zinc-800/60 pt-3">
          <span className="text-[9px] text-zinc-500 uppercase tracking-wider block mb-2 font-mono">INTEL LAYERS</span>
          <div className="flex flex-col gap-1.5 text-[9px] font-mono">
            {/* Security layer toggle */}
            <button
              onClick={() => setActiveLayers(prev => ({ ...prev, security: !prev.security }))}
              className={`w-full px-2.5 py-1.5 border rounded text-left flex justify-between items-center transition-all duration-200 cursor-pointer ${
                activeLayers.security
                  ? 'border-red-500 text-red-400 bg-red-950/20 shadow-[0_0_8px_rgba(239,68,68,0.25)]'
                  : 'border-zinc-800 text-zinc-500 bg-zinc-900/10 hover:border-zinc-700'
              }`}
            >
              <span>[SEC] SECURITY INTEL</span>
              <span className={`w-1.5 h-1.5 rounded-full ${activeLayers.security ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]' : 'bg-zinc-700'}`}></span>
            </button>

            {/* Environment layer toggle */}
            <button
              onClick={() => setActiveLayers(prev => ({ ...prev, environment: !prev.environment }))}
              className={`w-full px-2.5 py-1.5 border rounded text-left flex justify-between items-center transition-all duration-200 cursor-pointer ${
                activeLayers.environment
                  ? 'border-blue-500 text-blue-400 bg-blue-950/20 shadow-[0_0_8px_rgba(59,130,246,0.25)]'
                  : 'border-zinc-800 text-zinc-500 bg-zinc-900/10 hover:border-zinc-700'
              }`}
            >
              <span>[ENV] ENVIRONMENT</span>
              <span className={`w-1.5 h-1.5 rounded-full ${activeLayers.environment ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]' : 'bg-zinc-700'}`}></span>
            </button>

            {/* General layer toggle */}
            <button
              onClick={() => setActiveLayers(prev => ({ ...prev, general: !prev.general }))}
              className={`w-full px-2.5 py-1.5 border rounded text-left flex justify-between items-center transition-all duration-200 cursor-pointer ${
                activeLayers.general
                  ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20 shadow-[0_0_8px_rgba(34,211,238,0.25)]'
                  : 'border-zinc-800 text-zinc-500 bg-zinc-900/10 hover:border-zinc-700'
              }`}
            >
              <span>[GEN] GENERAL NEWS</span>
              <span className={`w-1.5 h-1.5 rounded-full ${activeLayers.general ? 'bg-cyan-500 shadow-[0_0_6px_rgba(34,211,238,0.8)]' : 'bg-zinc-700'}`}></span>
            </button>
          </div>
        </div>
      </div>

      {/* Toggle Drawer Button */}
      <button
        onClick={() => setIsFeedOpen(!isFeedOpen)}
        className={`absolute top-1/2 -translate-y-1/2 z-50 bg-zinc-950/90 border border-zinc-800 hover:border-cyan-500 text-zinc-400 hover:text-cyan-400 rounded-l-md w-8 h-16 flex items-center justify-center cursor-pointer shadow-lg transition-all duration-300 ${
          isFeedOpen ? 'right-[320px] md:right-[384px]' : 'right-4'
        }`}
        title={isFeedOpen ? "Close Stream" : "Open Stream"}
      >
        <span className="text-xs font-bold font-mono">
          {isFeedOpen ? "»" : "«"}
        </span>
      </button>

      {/* 2. TACTICAL FEED STREAM (Right Side Drawer) */}
      <div className={`absolute top-4 right-4 bottom-4 z-40 bg-zinc-950/80 backdrop-blur-md border border-zinc-800 rounded-xl flex flex-col overflow-hidden shadow-2xl transition-all duration-300 ${isFeedOpen ? 'w-80 md:w-96 opacity-100' : 'w-0 opacity-0 pointer-events-none border-none'}`}>
        <div className="p-4 border-b border-zinc-800/60 flex justify-between items-center">
          <div>
            <h2 className="text-xs font-bold text-zinc-400 tracking-wider font-mono">TACTICAL FEED STREAM</h2>
            <span className="text-[9px] text-zinc-500 font-mono">GDELT LIVE news vector INDEX</span>
          </div>
          <span className="text-[9px] bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-cyan-400 font-mono">
            {filteredFeatures.length} STREAM_PTS
          </span>
        </div>

        {/* Chronological news headlines list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-500">
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
              </span>
              <span className="text-[10px] tracking-widest animate-pulse font-mono uppercase">Intercepting feed data...</span>
            </div>
          ) : filteredFeatures.length === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-500 font-mono">
              NO EVENT VECTOR INGESTED
            </div>
          ) : (
            filteredFeatures.map((feature, index) => {
              const themes = feature.properties?.themes || "";
              const isProtestOrCrime = themes.includes("PROTEST") || themes.includes("CRIME");
              const isDisasterOrWeather = themes.includes("NATURAL_DISASTER") || themes.includes("ENV_WEATHER");

              let themeColor = "border-cyan-500/25 hover:border-cyan-500/60 bg-cyan-950/5";
              let themeDot = "bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.4)]";
              let themeText = "text-cyan-400";
              let themeLabel = "NEWS";

              if (isProtestOrCrime) {
                themeColor = "border-red-500/25 hover:border-red-500/60 bg-red-950/5";
                themeDot = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]";
                themeText = "text-red-400";
                themeLabel = themes.includes("PROTEST") ? "PROTEST" : "CRIME";
              } else if (isDisasterOrWeather) {
                themeColor = "border-blue-500/25 hover:border-blue-500/60 bg-blue-950/5";
                themeDot = "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]";
                themeText = "text-blue-400";
                themeLabel = themes.includes("NATURAL_DISASTER") ? "DISASTER" : "WEATHER";
              }

              const sourceUrl = feature.properties?.url || "";
              const isSelected = selectedIncident?.properties?.url === sourceUrl;
              const isActive = activeEvent === sourceUrl;

              if (isSelected || isActive) {
                if (isProtestOrCrime) themeColor = "border-red-500 bg-red-950/25 shadow-[0_0_12px_rgba(239,68,68,0.2)]";
                else if (isDisasterOrWeather) themeColor = "border-blue-500 bg-blue-950/25 shadow-[0_0_12px_rgba(59,130,246,0.2)]";
                else themeColor = "border-cyan-500 bg-cyan-950/25 shadow-[0_0_12px_rgba(34,211,238,0.2)]";
              }

              const locationName = feature.properties?.name || "India Location";
              const coords = feature.geometry?.coordinates;
              const lng = coords?.[0] || 0;
              const lat = coords?.[1] || 0;

              return (
                <div
                  key={sourceUrl + index}
                  onClick={() => handleEventClick(feature)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 flex flex-col gap-1.5 ${themeColor}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${themeDot}`}></span>
                      <span className={`text-[9px] font-bold tracking-wider font-mono ${themeText}`}>
                        {themeLabel}
                      </span>
                    </div>
                    <span className="text-[8px] text-zinc-500 font-mono">#{index + 1}</span>
                  </div>
                  <h3 className="text-xs font-semibold text-zinc-200 leading-snug line-clamp-2">
                    {locationName}
                  </h3>
                  <div className="flex justify-between items-center text-[8px] text-zinc-500 font-mono pt-1.5 border-t border-zinc-900">
                    <span>LAT: {lat.toFixed(3)}</span>
                    <span>LNG: {lng.toFixed(3)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Console output HUD inside Drawer */}
        <div className="p-4 border-t border-zinc-800/60 bg-zinc-950/50">
          <span className="text-[9px] font-bold text-zinc-500 tracking-wider block mb-1.5 font-mono">CON_LOG TELEMETRY</span>
          <div className="bg-zinc-950/90 border border-zinc-800/80 rounded p-2 text-[8px] text-zinc-500 space-y-0.5 font-mono max-h-[70px] overflow-y-auto">
            <div>&gt; GRID INDEX SECURE</div>
            <div>&gt; STREAM PTS: {filteredFeatures.length}</div>
            <div>&gt; ACTIVE ID: {selectedIncident ? "SET" : "NULL"}</div>
          </div>
        </div>
      </div>

      {/* 3. INTELLIGENCE INSPECTOR (Bottom-Center Detail Matrix) */}
      {selectedIncident && (() => {
        const themes = selectedIncident.properties?.themes || "";
        const isProtestOrCrime = themes.includes("PROTEST") || themes.includes("CRIME");
        const isDisasterOrWeather = themes.includes("NATURAL_DISASTER") || themes.includes("ENV_WEATHER");

        let themeColor = "border-t-cyan-500";
        let themeLabel = "NEWS";
        let badgeStyle = "border-cyan-500/30 text-cyan-400 bg-cyan-950/20";

        if (isProtestOrCrime) {
          themeColor = "border-t-red-500";
          themeLabel = themes.includes("PROTEST") ? "PROTEST" : "CRIME";
          badgeStyle = "border-red-500/30 text-red-400 bg-red-950/20";
        } else if (isDisasterOrWeather) {
          themeColor = "border-t-blue-500";
          themeLabel = themes.includes("NATURAL_DISASTER") ? "DISASTER" : "WEATHER";
          badgeStyle = "border-blue-500/30 text-blue-400 bg-blue-950/20";
        }

        const name = selectedIncident.properties?.name || "India Location";
        const url = selectedIncident.properties?.url || "#";
        const coords = selectedIncident.geometry?.coordinates || [0, 0];
        const displayThemes = themes.split(";").filter(Boolean).slice(0, 6) || ["GENERAL"];

        return (
          <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-xl p-4 shadow-2xl w-[90%] max-w-xl border-t-2 ${themeColor} transition-all duration-300`}>
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-bold tracking-widest px-2 py-0.5 border rounded uppercase ${badgeStyle}`}>
                  {themeLabel}
                </span>
                <span className="text-[9px] text-zinc-500">LAT: {coords[1].toFixed(4)} // LNG: {coords[0].toFixed(4)}</span>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-zinc-500 hover:text-zinc-300 font-bold transition-colors cursor-pointer text-xs"
                title="Close Inspector"
              >
                ✖
              </button>
            </div>
            
            <h3 className="text-xs font-bold text-zinc-100 leading-normal mb-3 font-mono">
              {name}
            </h3>

            <div className="flex flex-wrap gap-1 mb-4">
              {displayThemes.map((theme: string, i: number) => (
                <span key={theme + i} className="text-[8px] text-zinc-500 border border-zinc-900 bg-zinc-900/30 px-1.5 py-0.5 rounded font-mono">
                  {theme}
                </span>
              ))}
            </div>

            <div className="flex justify-between items-center border-t border-zinc-900 pt-3">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold transition-colors flex items-center gap-1 font-mono"
              >
                OPEN INTEL SOURCE REPORT ↗
              </a>
              <span className="text-[8px] text-zinc-600 font-mono">VECTOR FEED GRID REFERENCE</span>
            </div>
          </div>
        );
      })()}

      {/* Main Map container */}
      <div ref={mapContainer} className="w-full h-full" id="map-container" />
    </div>
  );
}
