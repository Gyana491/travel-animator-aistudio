export async function fetchWorldFeatures() {
  const [worldRes, statesRes] = await Promise.all([
    fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson'),
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
  ]);
  
  if (!worldRes.ok) throw new Error('Failed to fetch world geojson');
  
  const world = await worldRes.json();
  const states = statesRes.ok ? await statesRes.json() : null;

  return { world, states };
}
