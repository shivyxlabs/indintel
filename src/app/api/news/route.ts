import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// India city coordinate lookup - used to geo-pin GDELT articles
const INDIA_CITIES: { keywords: string[]; city: string; lat: number; lon: number }[] = [
  { keywords: ['delhi', 'new delhi', 'ndtv', 'hindustantimes', 'theprint', 'thewire'], city: 'New Delhi', lat: 28.6139, lon: 77.2090 },
  { keywords: ['mumbai', 'bombay', 'maharashtra', 'timesofindia', 'mid-day', 'dnaindia'], city: 'Mumbai', lat: 19.0760, lon: 72.8777 },
  { keywords: ['bangalore', 'bengaluru', 'karnataka', 'deccanherald', 'bangaloremirror'], city: 'Bangalore', lat: 12.9716, lon: 77.5946 },
  { keywords: ['kolkata', 'calcutta', 'west bengal', 'telegraphindia', 'anandabazar', 'aajkaal'], city: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { keywords: ['chennai', 'madras', 'tamil', 'thehindu', 'newindianexpress'], city: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { keywords: ['hyderabad', 'telangana', 'andhra', 'telanganatoday', 'sakshi', 'eenadu'], city: 'Hyderabad', lat: 17.3850, lon: 78.4867 },
  { keywords: ['pune', 'maharashtra'], city: 'Pune', lat: 18.5204, lon: 73.8567 },
  { keywords: ['ahmedabad', 'gujarat', 'surat', 'gujaratsamachar', 'divyabhaskar'], city: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { keywords: ['jaipur', 'rajasthan', 'rajasthanpatrika'], city: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  { keywords: ['lucknow', 'uttar pradesh', 'up', 'amarujala', 'navbharattimes'], city: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  { keywords: ['chandigarh', 'punjab', 'haryana', 'tribuneindia'], city: 'Chandigarh', lat: 30.7333, lon: 76.7794 },
  { keywords: ['bhopal', 'madhya pradesh', 'indore', 'freepressjournal'], city: 'Bhopal', lat: 23.2599, lon: 77.4126 },
  { keywords: ['patna', 'bihar', 'prabhatkhabar'], city: 'Patna', lat: 25.5941, lon: 85.1376 },
  { keywords: ['guwahati', 'assam', 'northeast', 'sentinelassam'], city: 'Guwahati', lat: 26.1445, lon: 91.7362 },
  { keywords: ['srinagar', 'kashmir', 'jammu', 'greaterkashmir', 'risingkashmir'], city: 'Srinagar', lat: 34.0837, lon: 74.7973 },
  { keywords: ['kochi', 'kerala', 'thiruvananthapuram', 'manoramaonline', 'mathrubhumi'], city: 'Kochi', lat: 9.9312, lon: 76.2673 },
  { keywords: ['bhubaneswar', 'odisha', 'orissa', 'dharitri', 'sambad'], city: 'Bhubaneswar', lat: 20.2961, lon: 85.8245 },
  { keywords: ['raipur', 'chhattisgarh'], city: 'Raipur', lat: 21.2514, lon: 81.6296 },
  { keywords: ['ranchi', 'jharkhand'], city: 'Ranchi', lat: 23.3441, lon: 85.3096 },
  { keywords: ['dehradun', 'uttarakhand', 'uttaranchal'], city: 'Dehradun', lat: 30.3165, lon: 78.0322 },
];

// Assign coordinates by matching article URL/title against city keywords
function assignCoordinates(url: string, title: string): { city: string; lat: number; lon: number } {
  const text = `${url} ${title}`.toLowerCase();
  for (const entry of INDIA_CITIES) {
    if (entry.keywords.some(kw => text.includes(kw))) {
      return { city: entry.city, lat: entry.lat, lon: entry.lon };
    }
  }
  // Default: scatter randomly around India's geographic center with slight jitter
  const jitterLat = (Math.random() - 0.5) * 8;
  const jitterLon = (Math.random() - 0.5) * 12;
  return { city: 'India', lat: 20.5937 + jitterLat, lon: 78.9629 + jitterLon };
}

// Derive GDELT themes from article title keywords
function inferTheme(title: string): string {
  const t = title.toLowerCase();
  if (/attack|terror|militant|bomb|blast|shoot|clash|violence|army|militar|war|strike|protest|riot/.test(t)) return 'PROTEST;TERROR;VIOLENCE;SECURITY_SERVICES';
  if (/flood|cyclone|earthquake|disaster|rain|drought|storm|pollution|climate|fire/.test(t)) return 'ENV_WEATHER;NATURAL_DISASTER;WATER';
  if (/economy|gdp|market|trade|inflation|rupee|bank|finance|invest|budget/.test(t)) return 'COMMERCE;ECONOMY;DEVELOPMENT';
  if (/cyber|hack|data|tech|ai|satellite|space|isro|digital/.test(t)) return 'CYBER;TECH;SCIENCE';
  return 'GENERAL;INFRASTRUCTURE;DEVELOPMENT';
}

export async function GET() {
  try {
    let articles: any[] = [];
    let fetchSucceeded = false;

    // 1. Fetch live articles from GDELT DOC 2.0 API (artlist mode)
    // - query=india -entertainment -bollywood... restricts at query level
    // - sourcelang=English restricts to English
    // - sourcecountry=IN restricts to Indian sources
    const query = 'india -entertainment -bollywood -cinema -movie -actor -actress -celebrity -showbiz -music -song -gossip';
    const gdeltDocUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=120&sourcelang=English&sourcecountry=IN&sort=DateDesc&format=json`;

    try {
      console.log('Fetching GDELT DOC artlist API...');
      const response = await fetch(gdeltDocUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; INDintel/1.0)' },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(12000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.articles?.length > 0) {
          articles = data.articles;
          fetchSucceeded = true;
          console.log(`GDELT DOC API returned ${articles.length} real articles.`);
        }
      } else {
        console.warn(`GDELT DOC API returned HTTP ${response.status}`);
      }
    } catch (e: any) {
      console.warn(`GDELT DOC fetch failed: ${e.message}`);
    }

    // 2. Build processedRows from live articles or fallback
    let processedRows: any[];

    if (fetchSucceeded) {
      // Strict client-side post-fetch filtering to completely remove any entertainment news
      const filteredArticles = articles.filter((article: any) => {
        const title = (article.title || '').toLowerCase();
        const url = (article.url || '').toLowerCase();
        const domain = (article.domain || '').toLowerCase();
        
        const entertainmentKeywords = [
          'entertainment', 'bollywood', 'cinema', 'movie', 'actor', 'actress', 
          'celebrity', 'showbiz', 'gossip', 'music', 'song', 'film', 'theatre',
          'popstar', 'hollywood', 'boxoffice', 'trailer', 'teaser', 'romance', 
          'wedding', 'dating', 'fashion'
        ];

        return !entertainmentKeywords.some(kw => 
          title.includes(kw) || url.includes(kw) || domain.includes(kw)
        );
      });

      console.log(`Filtered out entertainment articles. Remaining: ${filteredArticles.length}`);

      processedRows = filteredArticles.slice(0, 75).map((article: any) => {
        const articleUrl = (article.url || '').trim();
        const title = (article.title || article.domain || 'Unknown Event').trim();
        const { city, lat, lon } = assignCoordinates(articleUrl, title);
        const theme = inferTheme(title);
        const event_id = `${articleUrl.substring(8, 50).replace(/[^a-zA-Z0-9]/g, '_')}`;

        return {
          event_id,
          title,
          theme,
          source: articleUrl || 'GDELT',
          latitude: lat,
          longitude: lon,
        };
      });
    } else {
      // Fallback: use static dataset with real article URLs
      console.warn('Using static fallback dataset.');
      processedRows = fallbackGeoJson.features.map((f: any) => ({
        event_id: `fallback_${f.properties.name?.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`,
        title: f.properties.name,
        theme: f.properties.html,
        source: f.properties.url,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
      }));
    }

    // 4. Upsert into Supabase (Insert new, ignore existing based on event_id)
    if (processedRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('incidents')
        .upsert(processedRows, { onConflict: 'event_id' });

      if (upsertError) {
        console.error("Supabase Upsert Error:", upsertError);
      } else {
        console.log(`Successfully synced ${processedRows.length} records to Supabase.`);
      }
    }

    // 5. READ: Always read the latest 150 records directly from your permanent database
    const { data: dbRecords, error: readError } = await supabase
      .from('incidents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150);

    if (readError) {
      throw new Error(`Database Read Error: ${readError.message}`);
    }

    console.log(`Fetched ${dbRecords?.length || 0} records from Supabase database.`);

    // 6. Convert database records back into GeoJSON format for the map
    const geoJsonFeatures = (dbRecords || []).map((record: any) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [record.longitude, record.latitude]
      },
      properties: {
        name: record.title,
        html: record.theme,
        source: record.source,
        url: record.source,
        db_id: record.id
      }
    }));

    return NextResponse.json({ type: "FeatureCollection", features: geoJsonFeatures });

  } catch (error: any) {
    console.error("Critical Pipeline Error:", error);
    // Return direct fallback payload if Supabase connectivity fails
    return NextResponse.json(fallbackGeoJson, { status: 200 });
  }
}

// FallbackGeoJson dataset
const fallbackGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [77.2090, 28.6139] },
      properties: {
        name: "New Delhi, Delhi, India",
        html: "PROTEST;SECURITY_SERVICES;MILITARY;CIVIL_UNREST",
        url: "https://www.ndtv.com/india-news/security-alert-in-delhi"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [72.8777, 19.0760] },
      properties: {
        name: "Mumbai, Maharashtra, India",
        html: "ENV_WEATHER;NATURAL_DISASTER;MONSOON_FLOOD",
        url: "https://timesofindia.indiatimes.com/city/mumbai/weather"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [77.5946, 12.9716] },
      properties: {
        name: "Bangalore, Karnataka, India",
        html: "TECH;SCIENCE;DEVELOPMENT;COMMERCE",
        url: "https://www.moneycontrol.com/news/technology"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [88.3639, 22.5726] },
      properties: {
        name: "Kolkata, West Bengal, India",
        html: "PROTEST;STRIKE;LABOR_DISPUTE",
        url: "https://www.telegraphindia.com/west-bengal/labor-strike"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [80.2707, 13.0827] },
      properties: {
        name: "Chennai, Tamil Nadu, India",
        html: "ENV_WEATHER;WATER_RESOURCES;CLIMATE_ALERT",
        url: "https://www.thehindu.com/news/cities/chennai/reservoir-levels"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [78.4867, 17.3850] },
      properties: {
        name: "Hyderabad, Telangana, India",
        html: "TECH;CYBER_ATTACK;SECURITY_ALERT",
        url: "https://telanganatoday.com/hyderabad-tech-security"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [74.7973, 34.0837] },
      properties: {
        name: "Srinagar, Jammu and Kashmir, India",
        html: "SECURITY_SERVICES;MILITARY_UNREST;BORDER_SAFETY",
        url: "https://www.greaterkashmir.com/srinagar-security-forces"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [91.7362, 26.1445] },
      properties: {
        name: "Guwahati, Assam, India",
        html: "ENV_WEATHER;FLOOD_WARNING;NATURAL_DISASTER",
        url: "https://www.sentinelassam.com/guwahati-floods"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [75.8577, 22.7196] },
      properties: {
        name: "Indore, Madhya Pradesh, India",
        html: "ECONOMY;COMMERCE;DEVELOPMENT",
        url: "https://www.freepressjournal.in/indore"
      }
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [72.5714, 23.0225] },
      properties: {
        name: "Ahmedabad, Gujarat, India",
        html: "INFRASTRUCTURE;DEVELOPMENT;URBAN_PLANNING",
        url: "https://indianexpress.com/section/cities/ahmedabad"
      }
    }
  ]
};