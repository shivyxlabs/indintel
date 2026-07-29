"use client";

import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Interface and Component for direct HTML5 HLS stream playback bypassing YouTube blocks
interface HlsPlayerProps {
  url: string;
}

function HlsPlayer({ url }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Destroy any existing hls instance to prevent leaks
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const initHls = () => {
      const HlsClass = (window as any).Hls;
      if (HlsClass && HlsClass.isSupported()) {
        const hls = new HlsClass();
        hls.loadSource(url);
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
      }
    };

    if ((window as any).Hls) {
      initHls();
    } else {
      const scriptId = "hls-js-cdn-script";
      let script = document.getElementById(scriptId) as HTMLScriptElement;
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        document.head.appendChild(script);
      }

      const handleLoad = () => {
        initHls();
      };

      script.addEventListener("load", handleLoad);
      
      return () => {
        script.removeEventListener("load", handleLoad);
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      playsInline
      className="flex-1 w-full h-full object-cover bg-black"
    />
  );
}

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
  const [activeLayers, setActiveLayers] = useState({ security: true, environment: true, infrastructure: true });
  const [terminatorActive, setTerminatorActive] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState("");
  const [searchQuery, setSearchQuery] = useState("");


  const transformGdeltData = (features: any[]) => {
    if (!Array.isArray(features)) return [];
    return features.map((feature: any) => {
      const coords = feature.geometry?.coordinates || [0, 0];
      const lon = coords[0];
      const lat = coords[1];
      const stableId = `${lat}_${lon}`;

      const props = feature.properties || {};
      let sourceUrl = "";
      if (props.url && typeof props.url === 'string' && props.url.startsWith('http')) {
        sourceUrl = props.url.trim();
      } else if (props.articleurl && typeof props.articleurl === 'string' && props.articleurl.startsWith('http')) {
        sourceUrl = props.articleurl.trim();
      } else if (props.html && typeof props.html === 'string') {
        const match = props.html.match(/href=["'](https?:\/\/[^"'>]+)["']/i);
        if (match && match[1]) {
          sourceUrl = match[1].trim();
        }
      }

      // Parse the category based on properties.html (Security, Environment, Infrastructure) and assign to categoryId
      const htmlText = (props.html || "").toUpperCase();
      let categoryId = "infrastructure";
      if (
        htmlText.includes("PROTEST") ||
        htmlText.includes("CRIME") ||
        htmlText.includes("VIOLENCE") ||
        htmlText.includes("TERROR") ||
        htmlText.includes("CYBER")
      ) {
        categoryId = "security";
      } else if (
        htmlText.includes("ENV_WEATHER") ||
        htmlText.includes("NATURAL_DISASTER") ||
        htmlText.includes("WATER")
      ) {
        categoryId = "environment";
      }

      return {
        ...feature,
        id: stableId,
        properties: {
          ...props,
          id: stableId,
          source: sourceUrl || "GDELT",
          url: sourceUrl || "GDELT",
          categoryId: categoryId
        }
      };
    });
  };

  const [liveNewsOpen, setLiveNewsOpen] = useState(true);
  const [streamSize, setStreamSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [activeStreams, setActiveStreams] = useState<string[]>([
    "dd_news",
    "india_today"
  ]);

  const channelsList = [
    { name: "DD News HD", id: "dd_news", streamUrl: "https://d3qs3d2rkhfqrt.cloudfront.net/out/v1/0811cd8c37ca4c409d5385a6cd2fa18b/index.m3u8" },
    { name: "India Today", id: "india_today", streamUrl: "https://d1rc86nwwc9fag.cloudfront.net/vglive-sk-293160/master.m3u8" },
    { name: "NDTV Profit Live", id: "ndtv_profit", streamUrl: "https://ndtvprofit.akamaized.net/hls/live/2107404/ndtvprofit/chunklist_5.m3u8" },
    { name: "NDTV MP-CG Live", id: "ndtv_mpcg", streamUrl: "https://ndtvregional.akamaized.net/hls/live/2102726-b/ndtvmpcg/master_1.m3u8" },
    { name: "Republic TV Live", id: "republic_tv", streamUrl: "https://raw.githubusercontent.com/amazeyourself/adaptive-streams/refs/heads/main/streams/in/YuppTV/RepublicTV.m3u8" },
    { name: "DW News English", id: "dw_news", streamUrl: "https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8" },
    { name: "Aaj Tak HD", id: "aaj_tak", streamUrl: "https://feeds.intoday.in/aajtak/api/aajtakhd/master.m3u8" },
    { name: "News18 India Live", id: "news18_india", streamUrl: "https://n18syndication.akamaized.net/bpk-tv/News18_India_NW18_MOB/output01/master.m3u8" },
    { name: "ABP News Live", id: "abp_news", streamUrl: "https://d1rc86nwwc9fag.cloudfront.net/vglive-sk-472500/abpnews/master.m3u8" },
    { name: "Zee News Live", id: "zee_news", streamUrl: "https://dknttpxmr0dwf.cloudfront.net/index_57.m3u8" }
  ];



  // Live ticking Delhi Secure Time clock
  useEffect(() => {
    const updateTime = () => {
      const delhiTime = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      setCurrentTime(delhiTime);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Helper function to map category to threat color
  const getMarkerColor = (category: string) => {
    if (category === 'security') return '#ef4444'; // Red
    if (category === 'environment') return '#3b82f6'; // Blue
    return '#10b981'; // Emerald
  };

  // Helper function to resolve category from themes mapping
  const getCategory = (themeString: string) => {
    if (!themeString) return 'infrastructure';
    const upper = themeString.toUpperCase();
    if (
      upper.includes('PROTEST') ||
      upper.includes('CRIME') ||
      upper.includes('VIOLENCE') ||
      upper.includes('TERROR') ||
      upper.includes('CYBER')
    ) {
      return 'security';
    }
    if (
      upper.includes('ENV_WEATHER') ||
      upper.includes('NATURAL_DISASTER') ||
      upper.includes('WATER')
    ) {
      return 'environment';
    }
    return 'infrastructure';
  };

  // Derived state to filter validFeatures based on active layers and keyword search (case-insensitive query matching)
  const filteredFeatures = validFeatures.filter((feature) => {
    const category = (feature.properties?.categoryId || getCategory(feature.properties?.themes || feature.properties?.theme || feature.properties?.html || "")) as keyof typeof activeLayers;
    const matchesLayer = activeLayers[category];
    
    const title = (feature.properties?.name || "").toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesQuery = query === "" || title.includes(query);

    return matchesLayer && matchesQuery;
  });

  const filteredFeaturesRef = useRef(filteredFeatures);
  useEffect(() => {
    filteredFeaturesRef.current = filteredFeatures;
  }, [filteredFeatures]);

  const drawMarkers = () => {
    if (!mapRef.current) return;
    
    // Clear old markers using currentMarkers
    currentMarkers.current.forEach((marker) => marker.remove());
    currentMarkers.current = [];

    const map = mapRef.current;
    
    filteredFeaturesRef.current.forEach((feature) => {
      const coords = feature.geometry?.coordinates;
      if (!coords || coords.length < 2) return;
      const lng = coords[0];
      const lat = coords[1];

      const categoryId = feature.properties?.categoryId || "infrastructure";
      
      const el = document.createElement("div");
      el.style.width = "10px";
      el.style.height = "10px";
      el.style.cursor = "pointer";

      const pin = document.createElement("div");
      pin.style.width = "100%";
      pin.style.height = "100%";
      pin.style.borderRadius = "50%";
      pin.style.border = "1.5px solid #ffffff";
      pin.style.boxShadow = "0 0 6px rgba(0,0,0,0.6)";
      pin.style.transition = "transform 0.15s ease-in-out";

      el.appendChild(pin);

      el.onmouseenter = () => pin.style.transform = "scale(1.25)";
      el.onmouseleave = () => pin.style.transform = "scale(1.0)";

      if (categoryId === 'security') {
        pin.className = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]";
        pin.style.backgroundColor = "#ef4444";
      } else if (categoryId === 'environment') {
        pin.className = "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]";
        pin.style.backgroundColor = "#3b82f6";
      } else {
        pin.className = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        pin.style.backgroundColor = "#10b981";
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedIncident(feature);
      });

      const markerInstance = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

      currentMarkers.current.push(markerInstance);
    });
  };

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

      // Inject full-map Night Terminator source and layer (represented as slate shadow)
      map.addSource("terminator-source", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-180, -90],
                [180, -90],
                [180, 90],
                [-180, 90],
                [-180, -90]
              ]
            ]
          },
          properties: {}
        }
      });

      map.addLayer({
        id: "terminator-layer",
        type: "fill",
        source: "terminator-source",
        paint: {
          "fill-color": "#020617", // deep slate-950 night shadow
          "fill-opacity": 0 // default hidden
        }
      });

      setMapLoaded(true);
      drawMarkers();
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Projection mode is locked to 2D Mercator flat map projection

  // Sync Terminator Layer Opacity
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    try {
      const map = mapRef.current;
      if (map.getLayer("terminator-layer")) {
        map.setPaintProperty(
          "terminator-layer",
          "fill-opacity",
          terminatorActive ? 0.35 : 0
        );
      }
    } catch (e) {
      console.warn("Failed to update terminator opacity:", e);
    }
  }, [mapLoaded, terminatorActive]);

  // Fetch GDELT feed from our backend API route with 5-minute polling cycle
  useEffect(() => {
    const fetchRadarData = async () => {
      try {
        setFeedStatus('CONNECTING');
        const response = await fetch("/api/news");
        if (!response.ok) {
          const errorPayload = await response.text();
          console.error("RAW BACKEND ERROR:", errorPayload);
          setFeedStatus('OFFLINE');
          return;
        }
        const data = await response.json();
        console.log("Frontend received:", data);
        
        if (data && data.features) {
          const transformed = transformGdeltData(data.features);
          setNewsFeatures(transformed);
          setFeedStatus('LIVE');
          setLastSyncTime(new Date().toLocaleTimeString());
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

    fetchRadarData();
    const intervalId = setInterval(fetchRadarData, 300000); // 5 minutes

    return () => clearInterval(intervalId);
  }, []);

  // Sync news pins whenever map or GDELT data loads, strictly depending ONLY on filteredFeatures
  useEffect(() => {
    drawMarkers();
  }, [filteredFeatures]);

  // Pan to selected sidebar event
  const handleEventClick = (feature: any) => {
    if (!mapRef.current) return;
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return;

    setSelectedIncident(feature);
    mapRef.current.flyTo({
      center: [coords[0], coords[1]],
      zoom: 7.0,
      essential: true
    });
  };

  return (
    <div className="flex flex-col min-h-screen w-screen bg-slate-950 font-mono text-zinc-100 select-none overflow-y-auto scrollbar-thin relative">
      
      {/* 1. Breaking Alert Ticker Banner */}
      <div className="h-7 bg-red-950/20 border-b border-red-900/30 flex items-center px-4 overflow-hidden text-[9px] tracking-wider text-red-400 font-mono select-none relative z-50">
        <div className="animate-marquee-custom whitespace-nowrap flex gap-12">
          <span>[ALERT MONITOR: ACTIVE] // LIVE GEOPOLITICAL DATA INGESTED FROM SUPABASE PORT</span>
          <span>// AIRSPACE LOGS: NEW DELHI (NORMAL) // MUMBAI (DELAY - WEATHER CONSTRAINTS) // BANGALORE (NORMAL)</span>
          <span>// DATABASE Latency: 22ms // ENCRYPTION NODE: SECURE</span>
          <span>// INCIDENTS TABLE FEED FILTER ACTIVE // SCANNING 150 HOST ARCHIVES</span>
          {/* Duplicate to create infinite loop scroll */}
          <span>[ALERT MONITOR: ACTIVE] // LIVE GEOPOLITICAL DATA INGESTED FROM SUPABASE PORT</span>
          <span>// AIRSPACE LOGS: NEW DELHI (NORMAL) // MUMBAI (DELAY - WEATHER CONSTRAINTS) // BANGALORE (NORMAL)</span>
          <span>// DATABASE Latency: 22ms // ENCRYPTION NODE: SECURE</span>
          <span>// INCIDENTS TABLE FEED FILTER ACTIVE // SCANNING 150 HOST ARCHIVES</span>
        </div>
      </div>

      {/* 2. Top-Level Control Header */}
      <header className="h-14 bg-zinc-950 border-b border-zinc-900 flex items-center justify-between px-4 z-40 select-none">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <div className="flex items-center gap-3">
            <h1 className="text-lg md:text-xl font-black tracking-widest text-zinc-100 flex items-center gap-1">
              <span>IND</span>
              <span className="text-cyan-400 font-extrabold drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]">INTEL</span>
            </h1>
            <span className="text-[9px] border border-cyan-900/30 px-2 py-0.5 rounded bg-cyan-950/10 text-cyan-400/80 uppercase tracking-widest font-bold font-mono">
              INDIA COMMAND CENTER
            </span>
          </div>
        </div>

        {/* Delhi Time Blinking Clock */}
        <div className="hidden md:flex items-center gap-2 text-zinc-400 font-mono text-[11px] tracking-widest">
          <span className="text-zinc-600 font-bold">SECURE DEL CLOCK //</span>
          <span className="text-cyan-400 font-extrabold glow-cyan">{currentTime || "CONNECTING..."}</span>
        </div>

        {/* System Telemetry Badges */}
        <div className="flex items-center gap-3 text-[9px]">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded">
            <span className={`w-1 h-1 rounded-full ${feedStatus === 'LIVE' ? 'bg-green-500 animate-pulse' : 'bg-red-500 animate-pulse'}`}></span>
            <span className="text-zinc-400 uppercase">FEED: {feedStatus}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded">
            <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></span>
            <span className="text-zinc-400">DATABASE: SECURE</span>
          </div>
        </div>
      </header>

      {/* 3. Main Workspace Grid */}
      <div className="flex overflow-hidden relative w-full h-[calc(100vh-84px)] min-h-[600px] border-b border-zinc-900 flex-shrink-0">
        
        {/* Left Column Dashboard Panels */}
        <aside className="w-80 border-r border-zinc-900 bg-zinc-950/80 backdrop-blur-md p-4 flex flex-col gap-4 overflow-y-auto z-30 select-none">
          
          {/* Intel Layers */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col gap-2.5">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/60 pb-1.5 font-mono">
              TACTICAL INTEL LAYERS
            </h3>
            <div className="flex flex-col gap-1.5 text-[9px] font-mono">
              {/* Security layer toggle */}
              <button
                onClick={() => setActiveLayers(prev => ({ ...prev, security: !prev.security }))}
                className={`w-full px-2.5 py-1.5 border rounded text-left flex justify-between items-center transition-all duration-200 cursor-pointer ${
                  activeLayers.security
                    ? 'border-red-500 text-red-400 bg-red-950/20 shadow-[0_0_8px_rgba(239,68,68,0.25)] font-bold'
                    : 'border-zinc-800 text-zinc-500 bg-zinc-900/10 hover:border-zinc-700'
                }`}
              >
                <span>[SEC] SECURITY INTEL</span>
                <span className={`w-1.5 h-1.5 rounded-full ${activeLayers.security ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]' : 'bg-zinc-700'}`}></span>
              </button>

              {/* Environmental layer toggle */}
              <button
                onClick={() => setActiveLayers(prev => ({ ...prev, environment: !prev.environment }))}
                className={`w-full px-2.5 py-1.5 border rounded text-left flex justify-between items-center transition-all duration-200 cursor-pointer ${
                  activeLayers.environment
                    ? 'border-blue-500 text-blue-400 bg-blue-950/20 shadow-[0_0_8px_rgba(59,130,246,0.25)] font-bold'
                    : 'border-zinc-800 text-zinc-500 bg-zinc-900/10 hover:border-zinc-700'
                }`}
              >
                <span>[ENV] ENVIRONMENTAL</span>
                <span className={`w-1.5 h-1.5 rounded-full ${activeLayers.environment ? 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]' : 'bg-zinc-700'}`}></span>
              </button>

              {/* Infrastructure layer toggle */}
              <button
                onClick={() => setActiveLayers(prev => ({ ...prev, infrastructure: !prev.infrastructure }))}
                className={`w-full px-2.5 py-1.5 border rounded text-left flex justify-between items-center transition-all duration-200 cursor-pointer ${
                  activeLayers.infrastructure
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20 shadow-[0_0_8px_rgba(16,185,129,0.25)] font-bold'
                    : 'border-zinc-800 text-zinc-500 bg-zinc-900/10 hover:border-zinc-700'
                }`}
              >
                <span>[INF] INFRASTRUCTURE</span>
                <span className={`w-1.5 h-1.5 rounded-full ${activeLayers.infrastructure ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-zinc-700'}`}></span>
              </button>

              {/* Scroll down to live news section */}
              <button
                onClick={() => {
                  const element = document.getElementById("live-intel-monitors");
                  if (element) {
                    element.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="w-full px-2.5 py-1.5 border border-zinc-800 text-zinc-400 bg-zinc-900/10 hover:border-cyan-500/50 hover:text-cyan-400 transition-all duration-200 cursor-pointer flex justify-between items-center rounded"
              >
                <span>[LIVE] LIVE FEEDS</span>
                <span className="text-[8px] text-cyan-400 font-bold tracking-widest">GOTO ⬇</span>
              </button>
              {/* Keyword Search Filter input */}
              <input
                type="text"
                placeholder="SEARCH INTEL VECTORS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs p-2 mt-4 rounded focus:outline-none focus:border-cyan-500 transition-colors uppercase tracking-widest font-mono"
              />
            </div>
          </div>

          {/* Civil Airspace Delay Monitor */}
          <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-3.5 flex flex-col gap-2.5">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/60 pb-1.5 font-mono">
              CIVIL AIRSPACE MONITORS
            </h3>
            <div className="flex flex-col gap-2 text-[9px] font-mono text-zinc-400">
              <div className="flex justify-between items-center border-b border-zinc-900/80 pb-1.5">
                <span>NEW DELHI (DEL)</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  <span className="text-zinc-500">0m DELAY // OK</span>
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-zinc-900/80 pb-1.5">
                <span>MUMBAI (BOM)</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                  <span className="text-yellow-500 font-bold">12m DELAY // MONSOON</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>BANGALORE (BLR)</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  <span className="text-zinc-500">0m DELAY // OK</span>
                </span>
              </div>
            </div>
          </div>

        </aside>

        {/* Center Map Workspace Canvas */}
        <main className="flex-1 h-full relative bg-slate-950">
          <div ref={mapContainer} className="w-full h-full" id="map-container" />
          
          {/* Map is controlled by standard MapLibre NavigationControl overlay */}

          {/* 3. INTELLIGENCE INSPECTOR (Bottom-Center Detail Matrix Overlay inside Map Canvas) */}
          {selectedIncident && (() => {
            const themes = selectedIncident.properties?.themes || selectedIncident.properties?.theme || selectedIncident.properties?.html || "";
            const category = getCategory(themes);

            let themeColor = "border-t-emerald-500";
            let themeLabel = "INFRASTRUCTURE";
            let badgeStyle = "border-emerald-500/30 text-emerald-400 bg-emerald-950/20";

            if (category === "security") {
              themeColor = "border-t-red-500";
              themeLabel = "SECURITY";
              badgeStyle = "border-red-500/30 text-red-400 bg-red-950/20";
            } else if (category === "environment") {
              themeColor = "border-t-blue-500";
              themeLabel = "ENVIRONMENTAL";
              badgeStyle = "border-blue-500/30 text-blue-400 bg-blue-950/20";
            }

            const headline = selectedIncident.properties?.name || "Unknown Headline";
            const rawUrl = selectedIncident.properties?.url || selectedIncident.properties?.source || "";
            const url = rawUrl && rawUrl.startsWith("http") ? rawUrl.trim() : "";
            const coords = selectedIncident.geometry?.coordinates || [0, 0];
            const displayThemes = themes.split(";").filter(Boolean).slice(0, 6) || ["GENERAL"];

            // Detect location string
            const text = `${url} ${headline}`.toLowerCase();
            const cityMap = [
              { kw: ['delhi','ndtv','hindustantimes','theprint','thewire'], name: 'New Delhi, India' },
              { kw: ['mumbai','timesofindia','mid-day','dnaindia'], name: 'Mumbai, Maharashtra, India' },
              { kw: ['bangalore','bengaluru','deccanherald'], name: 'Bangalore, Karnataka, India' },
              { kw: ['kolkata','telegraphindia','anandabazar'], name: 'Kolkata, West Bengal, India' },
              { kw: ['chennai','madras','thehindu','newindianexpress'], name: 'Chennai, Tamil Nadu, India' },
              { kw: ['hyderabad','telangana','telanganatoday'], name: 'Hyderabad, Telangana, India' },
              { kw: ['lucknow','uttar pradesh','amarujala','navbharattimes'], name: 'Lucknow, Uttar Pradesh, India' },
              { kw: ['ahmedabad','gujarat','gujaratsamachar'], name: 'Ahmedabad, Gujarat, India' },
              { kw: ['chandigarh','punjab','haryana','tribuneindia'], name: 'Chandigarh, Punjab/Haryana, India' },
              { kw: ['srinagar','kashmir','greaterkashmir'], name: 'Srinagar, Jammu & Kashmir, India' },
              { kw: ['kochi','kerala','manoramaonline','mathrubhumi'], name: 'Kochi, Kerala, India' },
              { kw: ['guwahati','assam','sentinelassam'], name: 'Guwahati, Assam, India' },
              { kw: ['patna','bihar','prabhatkhabar'], name: 'Patna, Bihar, India' },
              { kw: ['jaipur','rajasthan'], name: 'Jaipur, Rajasthan, India' },
              { kw: ['bhubaneswar','odisha'], name: 'Bhubaneswar, Odisha, India' },
            ];
            let locationStr = 'India Location';
            for (const c of cityMap) {
              if (c.kw.some(k => text.includes(k))) {
                locationStr = c.name;
                break;
              }
            }

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

                <div className="mb-2">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-widest block font-mono">
                    LOCATION: {locationStr}
                  </span>
                </div>
                 
                <h3 className="text-sm font-bold text-zinc-100 leading-normal mb-3 font-mono line-clamp-2" title={headline}>
                  {headline}
                </h3>

                <div className="flex flex-wrap gap-1 mb-4">
                  {displayThemes.map((theme: string, i: number) => (
                    <span key={theme + i} className="text-[8px] text-zinc-500 border border-zinc-900 bg-zinc-900/30 px-1.5 py-0.5 rounded font-mono">
                      {theme}
                    </span>
                  ))}
                </div>

                <div className="flex justify-between items-center border-t border-zinc-900 pt-3">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-cyan-400 hover:text-cyan-200 font-bold transition-colors flex items-center gap-1 font-mono underline underline-offset-2"
                    >
                      OPEN INTEL SOURCE REPORT ↗
                    </a>
                  ) : (
                    <span className="text-[10px] text-zinc-600 font-mono italic">
                      SOURCE REPORT UNAVAILABLE
                    </span>
                  )}
                  <span className="text-[8px] text-zinc-600 font-mono">VECTOR FEED GRID REFERENCE</span>
                </div>
              </div>
            );
          })()}

        </main>

        {/* 4. TACTICAL FEED STREAM (Right Side Panel) */}
        <aside className="w-96 border-l border-zinc-900 bg-zinc-950/80 backdrop-blur-md flex flex-col overflow-hidden z-30 select-none">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-zinc-400 tracking-wider">TACTICAL FEED STREAM</h2>
              <span className="text-[9px] text-zinc-500">GDELT LIVE news vector INDEX</span>
            </div>
            <span className="text-[9px] bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-cyan-400 font-mono font-bold">
              {filteredFeatures.length} STREAM_PTS
            </span>
          </div>

          {/* Chronological list of events */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-500">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
                </span>
                <span className="text-[10px] tracking-widest animate-pulse font-mono uppercase">Ingesting live article feed...</span>
              </div>
            ) : filteredFeatures.length === 0 ? (
              <div className="text-center py-12 text-xs text-zinc-500 font-mono">
                NO EVENT VECTORS MATCHING ACTIVE LAYERS
              </div>
            ) : (
              filteredFeatures.map((feature, index) => {
                const title = feature.properties?.name || "Unknown Event";
                const url = (feature.properties?.url || feature.properties?.source || "").trim();
                
                // Helper to extract domain name
                let domain = "GDELT";
                try {
                  if (url && url.startsWith("http")) {
                    domain = new URL(url).hostname.replace("www.", "");
                  }
                } catch {}

                // Helper to get city name from title
                const text = `${url} ${title}`.toLowerCase();
                const cityMap = [
                  { kw: ['delhi','ndtv','hindustantimes','theprint','thewire'], name: 'New Delhi' },
                  { kw: ['mumbai','timesofindia','mid-day','dnaindia'], name: 'Mumbai' },
                  { kw: ['bangalore','bengaluru','deccanherald'], name: 'Bangalore' },
                  { kw: ['kolkata','telegraphindia','anandabazar'], name: 'Kolkata' },
                  { kw: ['chennai','madras','thehindu','newindianexpress'], name: 'Chennai' },
                  { kw: ['hyderabad','telangana','telanganatoday'], name: 'Hyderabad' },
                  { kw: ['lucknow','uttar pradesh','amarujala','navbharattimes'], name: 'Lucknow' },
                  { kw: ['ahmedabad','gujarat','gujaratsamachar'], name: 'Ahmedabad' },
                  { kw: ['chandigarh','punjab','haryana','tribuneindia'], name: 'Chandigarh' },
                  { kw: ['srinagar','kashmir','greaterkashmir'], name: 'Srinagar' },
                  { kw: ['kochi','kerala','manoramaonline','mathrubhumi'], name: 'Kochi' },
                  { kw: ['guwahati','assam','sentinelassam'], name: 'Guwahati' },
                  { kw: ['patna','bihar','prabhatkhabar'], name: 'Patna' },
                  { kw: ['jaipur','rajasthan'], name: 'Jaipur' },
                  { kw: ['bhubaneswar','odisha'], name: 'Bhubaneswar' },
                ];
                let artCity = 'India';
                for (const c of cityMap) {
                  if (c.kw.some(k => text.includes(k))) {
                    artCity = c.name;
                    break;
                  }
                }

                const category = feature.properties?.categoryId || "infrastructure";

                let themeColor = "border-emerald-500/25 hover:border-emerald-500/60 bg-emerald-950/5";
                let themeDot = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
                let themeText = "text-emerald-400";
                let themeLabel = "INFRASTRUCTURE";

                if (category === "security") {
                  themeColor = "border-red-500/25 hover:border-red-500/60 bg-red-950/5";
                  themeDot = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]";
                  themeText = "text-red-400";
                  themeLabel = "SECURITY";
                } else if (category === "environment") {
                  themeColor = "border-blue-500/25 hover:border-blue-500/60 bg-blue-950/5";
                  themeDot = "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]";
                  themeText = "text-blue-400";
                  themeLabel = "ENVIRONMENTAL";
                }

                const isSelected = selectedIncident?.properties?.id === feature.properties?.id;

                const selectedColor = themeLabel === 'SECURITY'
                  ? 'border-red-500 bg-red-950/25 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                  : themeLabel === 'ENVIRONMENTAL'
                  ? 'border-blue-500 bg-blue-950/25 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
                  : 'border-emerald-500 bg-emerald-950/25 shadow-[0_0_12px_rgba(16,185,129,0.2)]';

                return (
                  <div
                    key={url + index}
                    onClick={() => handleEventClick(feature)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 flex flex-col gap-1.5 ${isSelected ? selectedColor : themeColor}`}
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
                      {title}
                    </h3>
                    <div className="flex justify-between items-center text-[8px] text-zinc-500 font-mono pt-1.5 border-t border-zinc-900">
                      <span className="truncate max-w-[160px]">{domain}</span>
                      <span className="text-cyan-600 font-bold">{artCity}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Console Telemetry logs */}
          <div className="p-4 border-t border-zinc-800 bg-zinc-950/50">
            <span className="text-[9px] font-bold text-zinc-500 tracking-wider block mb-1.5 font-mono">CON_LOG TELEMETRY</span>
            <div className="bg-zinc-950/90 border border-zinc-800 rounded p-2 text-[8px] text-zinc-500 space-y-0.5 font-mono max-h-[70px] overflow-y-auto">
              <div>&gt; ACTIVE THREATS: {filteredFeatures.length}</div>
              <div>&gt; LAST SYNC: {lastSyncTime || "NEVER"}</div>
              <div>&gt; GRID SCORE: {filteredFeatures.length * 10}</div>
            </div>
          </div>
        </aside>
      </div>

      {/* 5. Live News Bottom Section (Placed permanently below the main viewport map) */}
      <section id="live-intel-monitors" className="bg-zinc-950 border-t border-zinc-900 flex flex-col flex-shrink-0 relative w-full py-6 px-6 z-30 select-none">
        {/* Section Header */}
        <div className="flex justify-between items-center mb-4 border-b border-zinc-850 pb-3 font-mono">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
              SECURE LIVE INTEL MONITORS
            </span>
          </div>

          {/* Grid Size Selector */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-0.5 rounded text-[10px]">
            <span className="text-zinc-500 px-1.5 uppercase font-bold">GRID SIZE:</span>
            <button
              onClick={() => setStreamSize('sm')}
              className={`px-2.5 py-0.5 rounded cursor-pointer ${streamSize === 'sm' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              SM
            </button>
            <button
              onClick={() => setStreamSize('md')}
              className={`px-2.5 py-0.5 rounded cursor-pointer ${streamSize === 'md' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              MD
            </button>
            <button
              onClick={() => setStreamSize('lg')}
              className={`px-2.5 py-0.5 rounded cursor-pointer ${streamSize === 'lg' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              LG
            </button>
          </div>
        </div>

        {/* Section Layout Grid */}
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Channel Selector Sidebar */}
          <div className="w-full lg:w-60 flex-shrink-0 flex flex-col gap-2 bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-3.5">
            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest block mb-1">
              SELECT STREAM SOURCING
            </span>
            {channelsList.map(ch => {
              const isActive = activeStreams.includes(ch.id);
              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    if (isActive) {
                      setActiveStreams(prev => prev.filter(id => id !== ch.id));
                    } else {
                      if (activeStreams.length >= 6) {
                        alert("Maximum 6 active streams supported to preserve resources.");
                        return;
                      }
                      setActiveStreams(prev => [...prev, ch.id]);
                    }
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded border text-[9px] font-bold transition-all duration-150 cursor-pointer flex justify-between items-center ${
                    isActive
                      ? 'border-cyan-500 text-cyan-400 bg-cyan-950/20'
                      : 'border-zinc-850 text-zinc-500 hover:border-zinc-700 bg-zinc-900/10'
                  }`}
                >
                  <span>{ch.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-cyan-500 animate-pulse' : 'bg-zinc-800'}`}></span>
                </button>
              );
            })}
          </div>

          {/* Streams Grid Workspace (Wrap grid layout natively scrolling with the page) */}
          <div className="flex-1 bg-zinc-900/10 border border-zinc-900/60 rounded-xl p-4 min-h-[300px] flex flex-wrap gap-4 items-center justify-start">
            {activeStreams.length === 0 ? (
              <div className="flex-1 text-center text-[10px] text-zinc-500 font-mono uppercase tracking-wider py-12">
                Select active news streams from the selector panel to start decoding
              </div>
            ) : (
              activeStreams.map(id => {
                const channel = channelsList.find(ch => ch.id === id);
                let boxWidth = "w-[280px]";
                let boxHeight = "h-[158px]";
                if (streamSize === "md") {
                  boxWidth = "w-[400px]";
                  boxHeight = "h-[225px]";
                } else if (streamSize === "lg") {
                  boxWidth = "w-[560px]";
                  boxHeight = "h-[315px]";
                }

                return (
                  <div
                    key={id}
                    className={`flex-shrink-0 ${boxWidth} ${boxHeight} border border-zinc-850 bg-zinc-950 rounded-lg overflow-hidden flex flex-col relative transition-all duration-200 shadow-lg`}
                  >
                    {/* Embed Window Title */}
                    <div className="h-6 bg-zinc-900/60 border-b border-zinc-850 px-2 flex justify-between items-center text-[8px] text-zinc-500 font-mono">
                      <span className="font-bold text-zinc-400">{channel?.name || "LIVE STREAM"}</span>
                      <button
                        onClick={() => setActiveStreams(prev => prev.filter(item => item !== id))}
                        className="hover:text-red-400 font-bold transition-colors cursor-pointer text-[8px]"
                      >
                        DISCONNECT
                      </button>
                    </div>
                    
                    {/* Native HTML5 HLS Decoded Video Player */}
                    {channel?.streamUrl && (
                      <HlsPlayer url={channel.streamUrl} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Global CSS Style tag for dynamic marquee animation keyframes and custom scrollbars */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-custom {
          display: inline-flex;
          animation: marquee 30s linear infinite;
        }
        * {
          scrollbar-width: thin;
          scrollbar-color: rgba(34, 211, 238, 0.3) rgba(9, 9, 11, 0.85);
        }
        /* Custom scrollbar styling to match the command center theme */
        ::-webkit-scrollbar {
          width: 7px;
          height: 7px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(9, 9, 11, 0.85);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(34, 211, 238, 0.35);
          border: 1px solid rgba(34, 211, 238, 0.1);
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(34, 211, 238, 0.7);
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
        }
      `}</style>
    </div>
  );
}
