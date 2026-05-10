import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, Video, Play, FastForward, CheckCircle, Trash2, Plane, Car, Train, Ship, Navigation, ArrowLeft, Plus, History, Save, Clock } from 'lucide-react';
import { searchLocation, LocationSearchResult } from './lib/geocoder';
import { fetchWorldFeatures } from './lib/geo';
import { drawMapFrame } from './lib/drawer';
import { MP4Encoder } from './lib/video-encoder';
import { saveTrip, getTrips, deleteTrip, SavedTrip } from './lib/opfs';

export type TransportMode = 'plane' | 'car' | 'train' | 'boat';
type ActiveInput = { index: number; type: 'from' | 'to' } | null;

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [stops, setStops] = useState<(LocationSearchResult | null)[]>([null, null]);
  const [modes, setModes] = useState<TransportMode[]>(['plane']);
  const [segmentTravelers, setSegmentTravelers] = useState<Array<Array<{name: string, photo: string | null}>>>([]);
  const [activeInput, setActiveInput] = useState<ActiveInput>(null);
  
  const [activeView, setActiveView] = useState<'journey' | 'history'>('journey');
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  
  const [worldData, setWorldData] = useState<any>(null);
  const [progress, setProgress] = useState(1); // 0 to 1
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  // Load map data & localstorage
  useEffect(() => {
    fetchWorldFeatures().then(setWorldData).catch(err => {
      console.error('Failed to load world map', err);
    });
    
    try {
      const saved = localStorage.getItem('trip_state_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.stops && parsed.stops.length > 0) {
          setStops(parsed.stops);
          setModes(parsed.modes || ['plane']);
          if (parsed.segmentTravelers) setSegmentTravelers(parsed.segmentTravelers);
        }
      }
    } catch(e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem('trip_state_v2', JSON.stringify({ stops, modes, segmentTravelers }));
  }, [stops, modes, segmentTravelers]);

  useEffect(() => {
    getTrips().then(setSavedTrips);
  }, [activeView]);

  const handleSaveTrip = async () => {
    const validStops = stops.filter((s): s is LocationSearchResult => s !== null);
    if (validStops.length < 2) return alert('Need at least 2 stops to save a trip');
    
    setIsSaving(true);
    try {
      const name = `${validStops[0].name} to ${validStops[validStops.length - 1].name}`;
      await saveTrip(name, { stops, modes, segmentTravelers });
      const updated = await getTrips();
      setSavedTrips(updated);
      alert('Trip saved to history!');
    } catch (e) {
      console.error(e);
      alert('Failed to save trip');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadTrip = (trip: SavedTrip) => {
    setStops(trip.stops);
    setModes(trip.modes);
    setSegmentTravelers(trip.segmentTravelers);
    // Reload images to blob urls so drawing works or just leave them as base64
    // Base64 works perfectly with new Image().src = base64!
    trip.segmentTravelers.forEach(segment => {
      segment?.forEach(traveler => {
        if (traveler?.photo) {
          const img = new Image();
          img.src = traveler.photo;
          imageCache.current[traveler.photo] = img;
        }
      });
    });
    setActiveView('journey');
    setProgress(1);
  };

  const handleDeleteTrip = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTrip(id);
      setSavedTrips(await getTrips());
    } catch (e) {
      console.error(e);
    }
  };

  // Main UI render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !worldData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Auto-resize handler for UI view
    const updateCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        const validStops = stops.filter((s): s is LocationSearchResult => s !== null);
        const pts: [number, number][] = validStops.map(s => [s.lon, s.lat]);
        const names = validStops.map(s => s.name);
        const validModes = modes.slice(0, Math.max(1, validStops.length - 1));
        drawMapFrame(ctx, canvas.width, canvas.height, worldData, pts, names, validModes, segmentTravelers, imageCache.current, progress);
      }
    };

    updateCanvas();
    window.addEventListener('resize', updateCanvas);
    return () => window.removeEventListener('resize', updateCanvas);
  }, [stops, worldData, progress, modes, segmentTravelers]);

  // Search
  useEffect(() => {
    const delay = setTimeout(async () => {
      if (searchQuery.length > 2) {
        const results = await searchLocation(searchQuery);
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  const handlePhotoUpload = (segIndex: number, personIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    imageCache.current[url] = img;
    
    setSegmentTravelers(prev => {
      const newTravelers = [...prev];
      if (!newTravelers[segIndex]) newTravelers[segIndex] = [];
      const newSeg = [...newTravelers[segIndex]];
      if (!newSeg[personIndex]) newSeg[personIndex] = { name: '', photo: null };
      newSeg[personIndex].photo = url;
      newTravelers[segIndex] = newSeg;
      return newTravelers;
    });
  };

  const handleTravelerName = (segIndex: number, personIndex: number, name: string) => {
    setSegmentTravelers(prev => {
      const newTravelers = [...prev];
      if (!newTravelers[segIndex]) newTravelers[segIndex] = [];
      const newSeg = [...newTravelers[segIndex]];
      if (!newSeg[personIndex]) newSeg[personIndex] = { name: '', photo: null };
      newSeg[personIndex].name = name;
      newTravelers[segIndex] = newSeg;
      return newTravelers;
    });
  };

  const handleAddTraveler = (segIndex: number) => {
    setSegmentTravelers(prev => {
      const newTravelers = [...prev];
      if (!newTravelers[segIndex]) newTravelers[segIndex] = [];
      newTravelers[segIndex] = [...newTravelers[segIndex], { name: '', photo: null }];
      return newTravelers;
    });
  };

  const handleRemoveTraveler = (segIndex: number, personIndex: number) => {
    setSegmentTravelers(prev => {
      const newTravelers = [...prev];
      if (!newTravelers[segIndex]) return prev;
      const newSeg = [...newTravelers[segIndex]];
      newSeg.splice(personIndex, 1);
      newTravelers[segIndex] = newSeg;
      return newTravelers;
    });
  };

  const handleSelectLocation = (loc: LocationSearchResult) => {
    if (!activeInput) return;
    const newStops = [...stops];
    
    if (activeInput.type === 'from') {
      newStops[activeInput.index] = loc;
    } else {
      newStops[activeInput.index + 1] = loc;
    }
    
    setStops(newStops);
    setActiveInput(null);
    setSearchQuery('');
    setSearchResults([]);
    setProgress(1);
  };

  const setMode = (index: number, mode: TransportMode) => {
    const newModes = [...modes];
    newModes[index] = mode;
    setModes(newModes);
  };

  const handleAddAnotherStop = () => {
    setStops(s => [...s, null]);
    setModes(m => [...m, 'plane']);
    setSegmentTravelers(prev => {
      const lastSegment = prev[prev.length - 1] || [];
      const newSegment = lastSegment.map(t => ({ ...t }));
      return [...prev, newSegment];
    });
    setProgress(1);
  };

  const handleDeleteCard = (index: number) => {
    if (stops.length <= 2) {
      setStops([null, null]);
      setModes(['plane']);
      setSegmentTravelers([]);
      return;
    }
    const newStops = [...stops];
    newStops.splice(index, 1); // remove the destination boundary that this leg started at
    setStops(newStops);
    
    const newModes = [...modes];
    newModes.splice(index, 1);
    setModes(newModes);

    const newTravelers = [...segmentTravelers];
    newTravelers.splice(index, 1);
    setSegmentTravelers(newTravelers);

    setProgress(1);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    } else {
      setProgress(0);
      setIsPlaying(true);
      let startTime = performance.now();
      const validStops = stops.filter((s): s is LocationSearchResult => s !== null);
      // Increased duration for slow motion 
      const duration = Math.max(6000, (validStops.length - 1) * 6000); 

      const animate = (time: number) => {
        let p = (time - startTime) / duration;
        if (p > 1) {
          p = 1;
          setIsPlaying(false);
          setProgress(1);
          return;
        }
        setProgress(p);
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    }
  };

  const exportVideo = async () => {
    const validStops = stops.filter((s): s is LocationSearchResult => s !== null);
    if (validStops.length < 2) return alert('Need at least 2 stops to make a video');
    if (!worldData) return alert('Map data not ready');
    
    setIsExporting(true);
    setExportProgress(0);
    
    try {
      const width = 1080;
      const height = 1920;
      const fps = 30;
      // 6 seconds per segment + 1 second hold
      const durationSeconds = (validStops.length - 1) * 6 + 1;
      const totalFrames = durationSeconds * fps;
      
      const encoder = new MP4Encoder({ width, height, fps, bitrate: 10_000_000 });
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = width;
      renderCanvas.height = height;
      const ctx = renderCanvas.getContext('2d');
      if (!ctx) throw new Error('No 2d context for render');
      
      const pts: [number, number][] = validStops.map(s => [s.lon, s.lat]);
      const names = validStops.map(s => s.name);
      const validModes = modes.slice(0, Math.max(1, validStops.length - 1));

      for (let i = 0; i <= totalFrames; i++) {
        const frameProgress = Math.min(1, i / (totalFrames - fps));
        drawMapFrame(ctx, width, height, worldData, pts, names, validModes, segmentTravelers, imageCache.current, frameProgress);
        
        await encoder.addFrameFromCanvas(renderCanvas);
        
        if (i % 5 === 0) setExportProgress(Math.round((i / totalFrames) * 100));
        await new Promise(r => setTimeout(r, 0));
      }
      
      const buffer = await encoder.end();
      
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trip-replay.mp4';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error exporting video: ' + String(err));
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const validCount = stops.filter(s => s !== null).length;

  return (
    <div className="flex flex-col h-screen w-full bg-[#0A0A0A] font-sans text-[#E0E0E0] overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#0F0F0F] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500 rounded-sm flex items-center justify-center">
            <MapPin className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-xl font-serif tracking-tight font-bold text-white">Trip Replay</h1>
          <span className="px-2 py-0.5 rounded border border-white/20 text-[10px] uppercase tracking-widest text-white/50 hidden sm:block">v1.0.4 Beta</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs text-white/40 font-mono hidden sm:flex">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>WebCodecs Active
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar */}
        <aside className="w-full md:w-[400px] border-r border-[#1F1F1F] bg-[#0A0C10] flex flex-col overflow-hidden z-10 shrink-0 shadow-2xl">
          {activeView === 'history' ? (
            <div className="flex flex-col h-full bg-[#0A0C10] animate-in slide-in-from-right-4 duration-200">
              <div className="p-4 border-b border-[#1F1F1F] flex items-center gap-3 shrink-0">
                <button onClick={() => setActiveView('journey')} className="text-white/50 hover:text-white p-1">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-white flex-1">Trip History</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {savedTrips.length === 0 ? (
                  <div className="text-center p-8 text-white/40 text-sm font-medium">No saved trips</div>
                ) : (
                  savedTrips.map(trip => (
                    <div key={trip.id} className="bg-[#171923] border border-[#2B2F42] hover:border-white/20 rounded-xl p-4 transition-colors cursor-pointer group" onClick={() => handleLoadTrip(trip)}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-teal-400 transition-colors">{trip.name}</p>
                          <div className="flex items-center gap-2 mt-2 text-xs text-white/50">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{new Date(trip.timestamp).toLocaleDateString()}</span>
                            <span>•</span>
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{trip.stops.filter((s:any) => s!==null).length} stops</span>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => handleDeleteTrip(trip.id, e)} 
                          className="text-white/20 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-white/5"
                          title="Delete trip"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeInput ? (
            <div className="flex flex-col h-full bg-[#0A0C10] animate-in slide-in-from-right-4 duration-200">
              <div className="p-4 border-b border-[#1F1F1F] flex items-center gap-3 shrink-0">
                <button onClick={() => setActiveInput(null)} className="text-white/50 hover:text-white p-1">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <input 
                  autoFocus
                  placeholder="Search for a location..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none outline-none text-white w-full text-base"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {searchResults.length === 0 && searchQuery.length > 2 && (
                  <div className="text-center p-8 text-white/40 text-sm font-medium">Searching...</div>
                )}
                {searchResults.map(res => (
                  <button 
                    key={res.id} 
                    onClick={() => handleSelectLocation(res)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 rounded-lg block transition-colors"
                  >
                    <p className="text-sm font-medium text-white">{res.name}</p>
                    <p className="text-xs text-white/40 mt-1 truncate">{res.displayName}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden">
               <div className="p-6 pb-2 shrink-0 flex items-start justify-between">
                 <div>
                   <h2 className="text-2xl tracking-tight font-bold text-white mb-1">Your Journey</h2>
                   <p className="text-sm text-white/50 font-medium">
                     {validCount} of {Math.max(2, stops.length)} stops ready
                   </p>
                 </div>
                 <div className="flex gap-2">
                   <button 
                     onClick={handleSaveTrip} 
                     disabled={validCount < 2 || isSaving || isExporting}
                     className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/80 transition-colors disabled:opacity-50"
                     title="Save Journey"
                   >
                     <Save className="w-3.5 h-3.5" />
                     <span className="hidden sm:inline">Save</span>
                   </button>
                   <button 
                     onClick={() => setActiveView('history')}
                     disabled={isExporting}
                     className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/80 transition-colors"
                     title="View History"
                   >
                     <History className="w-3.5 h-3.5" />
                     <span className="hidden sm:inline">History</span>
                   </button>
                 </div>
               </div>

               <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4 shadow-[inset_0_-20px_20px_-20px_rgba(0,0,0,0.5)]">
                 {Array.from({ length: Math.max(1, stops.length - 1) }).map((_, i) => {
                   const fromStop = stops[i];
                   const toStop = stops[i+1];
                   const currentMode = modes[i] || 'plane';

                   return (
                     <div key={i} className="bg-[#171923] border border-[#2B2F42] rounded-2xl p-4 shadow-lg relative">
                       {/* Card Header */}
                       <div className="flex items-center justify-between mb-4">
                         <div className="flex items-center gap-2">
                           <div className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 text-xs font-bold">
                             {i + 1}
                           </div>
                           <span className="text-sm font-semibold text-white/70">
                             {i === 0 ? 'Starting Point' : `Stop ${i}`}
                           </span>
                         </div>
                         <button onClick={() => handleDeleteCard(i)} className="text-white/30 hover:text-red-400 transition-colors p-1">
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>

                       {/* Inputs */}
                       <div className="flex gap-2 mb-4">
                         {/* FROM */}
                         <button 
                           onClick={() => setActiveInput({ index: i, type: 'from' })}
                           disabled={isExporting}
                           className="flex-1 bg-[#101218] border border-transparent hover:border-white/10 rounded-xl p-3 flex items-center gap-2 text-left transition-colors overflow-hidden"
                         >
                           <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
                           <span className={`text-sm truncate flex-1 font-medium ${fromStop ? 'text-white' : 'text-white/40'}`}>
                             {fromStop ? fromStop.name : 'From...'}
                           </span>
                           {fromStop && <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                         </button>

                         {/* TO */}
                         <button 
                           onClick={() => setActiveInput({ index: i, type: 'to' })}
                           disabled={isExporting}
                           className="flex-1 bg-[#101218] border border-transparent hover:border-white/10 rounded-xl p-3 flex items-center gap-2 text-left transition-colors overflow-hidden"
                         >
                           <Navigation className="w-4 h-4 text-rose-400 shrink-0 transform rotate-45" />
                           <span className={`text-sm truncate flex-1 font-medium ${toStop ? 'text-white' : 'text-white/40'}`}>
                             {toStop ? toStop.name : 'To...'}
                           </span>
                           {toStop && <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
                         </button>
                       </div>

                       {/* Modes */}
                       <div className="flex gap-1.5 mb-4">
                         {([
                           { id: 'plane', label: 'Plane', icon: Plane },
                           { id: 'car', label: 'Car', icon: Car },
                           { id: 'train', label: 'Train', icon: Train },
                           { id: 'boat', label: 'Boat', icon: Ship },
                         ] as const).map(mode => {
                           const isActive = currentMode === mode.id;
                           const Icon = mode.icon;
                           return (
                             <button 
                               key={mode.id}
                               onClick={() => setMode(i, mode.id)}
                               disabled={isExporting}
                               className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 border text-xs font-semibold transition-colors ${
                                 isActive 
                                   ? 'bg-[#2DD4BF]/10 border-[#2DD4BF]/30 text-[#2DD4BF]' 
                                   : 'bg-[#101218] border-transparent text-white/50 hover:bg-white/5'
                               }`}
                             >
                               <Icon className="w-3.5 h-3.5" />
                               <span className="capitalize hidden sm:inline">{mode.label}</span>
                             </button>
                           );
                         })}
                       </div>

                       {/* Travelers */}
                       <div className="flex flex-col gap-2 w-full bg-[#101218] rounded-xl p-3 border border-transparent hover:border-white/10 transition-colors">
                         <div className="text-xs text-white/50 font-medium pb-1">Travelers on this route</div>
                         <div className="flex flex-wrap gap-2">
                           {(segmentTravelers[i] || []).map((traveler, tIdx) => (
                             <div key={tIdx} className="flex items-center gap-2 bg-[#1A1D27] rounded-full p-1 pr-3 border border-white/5">
                               <label className="flex flex-shrink-0 items-center justify-center w-8 h-8 rounded-full border border-slate-700 bg-slate-800 cursor-pointer overflow-hidden hover:border-slate-500 transition-colors" title="Upload traveler photo">
                                 {traveler.photo ? (
                                     <img src={traveler.photo} className="w-full h-full object-cover" />
                                 ) : (
                                     <Plus className="w-4 h-4 text-slate-400" />
                                 )}
                                 <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePhotoUpload(i, tIdx, e)} disabled={isExporting}/>
                               </label>
                               <input 
                                   placeholder="Name" 
                                   className="bg-transparent border-none outline-none text-white text-xs w-20"
                                   value={traveler.name}
                                   onChange={(e) => handleTravelerName(i, tIdx, e.target.value)}
                                   disabled={isExporting}
                               />
                               <button onClick={() => handleRemoveTraveler(i, tIdx)} disabled={isExporting} className="text-white/30 hover:text-red-400 p-1">
                                  <Trash2 className="w-3 h-3" />
                               </button>
                             </div>
                           ))}
                           <button 
                             onClick={() => handleAddTraveler(i)} 
                             disabled={isExporting}
                             className="flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-white/20 hover:border-white/50 text-white/50 hover:text-white transition-colors ml-1"
                           >
                             <Plus className="w-4 h-4" />
                           </button>
                         </div>
                       </div>
                     </div>
                   );
                 })}

                 <button 
                   onClick={handleAddAnotherStop}
                   disabled={isExporting}
                   className="w-full py-4 rounded-xl flex items-center justify-center gap-2 border border-white/5 text-white/80 text-sm font-medium hover:bg-white/5 hover:border-white/10 transition-colors shadow-sm"
                 >
                   <Plus className="w-4 h-4" />
                   Add Another Stop
                 </button>
               </div>

               {/* Bottom Actions */}
               <div className="p-6 pt-4 shrink-0 border-t border-[#1F1F1F] space-y-3 bg-[#0A0C10]">
                  <button
                    onClick={togglePlayback}
                    disabled={validCount < 2 || isExporting}
                    className="w-full py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isPlaying ? <FastForward className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
                    {isPlaying ? 'Stop Preview' : 'Preview Animation'}
                  </button>
                  
                  <button
                    onClick={exportVideo}
                    disabled={validCount < 2 || isExporting}
                    className="w-full py-2 bg-white text-black font-semibold text-sm hover:bg-amber-400 rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                  >
                    {isExporting ? (
                      <div className="absolute inset-0 bg-amber-500 flex items-center justify-start">
                        <div 
                          className="h-full bg-amber-400 transition-all duration-300 ease-out"
                          style={{ width: `${exportProgress}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center font-medium shadow-sm text-black">
                          Rendering {exportProgress}%
                        </span>
                      </div>
                    ) : (
                      <>
                        <Video className="w-4 h-4" />
                        Render Export
                      </>
                    )}
                  </button>

                  {isExporting && (
                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded">
                      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5 font-bold">Exporting...</p>
                      <p className="text-[10px] leading-relaxed text-white/50">Please keep the browser tab active.</p>
                    </div>
                  )}
               </div>
            </div>
          )}
        </aside>

        {/* Main Map Viewer */}
        <div className="flex-1 bg-[#050505] flex items-center justify-center p-4 md:p-8 relative">
          {/* Subtle background flair */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="w-full h-full bg-[radial-gradient(circle_at_center,_#333_1px,_transparent_1px)] bg-[size:20px_20px]"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/5 rounded-full blur-[100px]"></div>
          </div>

          {!worldData && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40 z-10 text-sm font-mono">
              INITIALIZING GEOMETRY...
            </div>
          )}
          
          {/* Aspect Ratio container */}
          <div className="relative shadow-2xl rounded overflow-hidden border border-white/10 bg-[#111] z-10 group"
               style={{
                   width: '100%',
                   maxWidth: 'calc((100vh - 114px) * (9/16))',
                   aspectRatio: '9/16'
               }}>
              <canvas 
                  ref={canvasRef} 
                  className="absolute inset-0 w-full h-full block"
              />
              {/* Safe zone overlay */}
              <div className="absolute inset-0 pointer-events-none opacity-20 border-[16px] border-black/0 shadow-[inset_0_0_80px_rgba(0,0,0,0.8)]" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-12 border-t border-white/10 bg-[#0F0F0F] flex items-center px-6 justify-between text-[11px] shrink-0">
        <div className="flex gap-6 md:gap-8">
          <div className="flex items-center gap-2">
            <span className="text-white/40">Format:</span>
            <span className="text-white font-mono uppercase">mp4 (H.264)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/40">Storage:</span>
            <span className="text-white font-mono uppercase">localStorage</span>
          </div>
        </div>
        <div className="text-white/40 font-mono italic tracking-tighter hidden md:block">
          Built for high-performance canvas rendering and private storytelling.
        </div>
      </footer>
    </div>
  );
}
