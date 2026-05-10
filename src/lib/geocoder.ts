export interface LocationSearchResult {
  id: string;
  name: string;
  lat: number;
  lon: number;
  displayName: string;
}

export async function searchLocation(query: string): Promise<LocationSearchResult[]> {
  if (!query || query.length < 2) return [];
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'TripReplay/1.0 (Contact: user@example.com)' // Needs a user agent per OpenStreetMap policy
        }
      }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    return data.map((item: any) => ({
      id: item.place_id,
      name: item.name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      displayName: item.display_name
    }));
  } catch (err) {
    console.error('Geocoder error:', err);
    return [];
  }
}
