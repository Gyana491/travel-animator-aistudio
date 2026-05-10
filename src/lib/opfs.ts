export interface TripState {
  stops: any[];
  modes: any[];
  segmentTravelers: any[];
}

export interface SavedTrip extends TripState {
  id: string;
  name: string;
  timestamp: number;
}

async function blobUrlToBase64(blobUrl: string): Promise<string> {
  if (blobUrl.startsWith('data:')) return blobUrl; // already base64
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read blob as string"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Ensure the trips directory exists
async function getTripsDir() {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle('trips', { create: true });
}

export async function saveTrip(name: string, state: TripState): Promise<SavedTrip> {
  const clonedState: TripState = JSON.parse(JSON.stringify(state));
  
  // Convert blob urls to base64
  for (const segment of clonedState.segmentTravelers) {
    if (!segment) continue;
    for (const traveler of segment) {
      if (traveler && traveler.photo && (traveler.photo.startsWith('blob:') || traveler.photo.startsWith('data:'))) {
        try {
          traveler.photo = await blobUrlToBase64(traveler.photo);
        } catch (e) {
          console.error("Failed to convert image for traveler", traveler);
          traveler.photo = null;
        }
      }
    }
  }

  const id = Date.now().toString();
  const newTrip: SavedTrip = {
    id,
    name,
    timestamp: Date.now(),
    ...clonedState
  };

  const tripsDir = await getTripsDir();
  const fileHandle = await tripsDir.getFileHandle(`${id}.json`, { create: true });
  // @ts-ignore
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(newTrip));
  await writable.close();

  return newTrip;
}

export async function getTrips(): Promise<SavedTrip[]> {
  try {
    const tripsDir = await getTripsDir();
    const trips: SavedTrip[] = [];
    
    // @ts-ignore
    for await (const [name, handle] of tripsDir.entries()) {
      if (handle.kind === 'file' && name.endsWith('.json')) {
        try {
          const file = await handle.getFile();
          const text = await file.text();
          const trip = JSON.parse(text) as SavedTrip;
          trips.push(trip);
        } catch (e) {
          console.error("Failed to read trip file", name, e);
        }
      }
    }
    
    trips.sort((a, b) => b.timestamp - a.timestamp);
    return trips;
  } catch (e) {
    console.warn("OPFS trips directory not accessible or empty", e);
    return [];
  }
}

export async function deleteTrip(id: string): Promise<void> {
  const tripsDir = await getTripsDir();
  await tripsDir.removeEntry(`${id}.json`);
}
