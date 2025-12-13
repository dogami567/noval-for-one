import React, { useMemo, useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Github, Twitter } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import ChatWidget from './components/ChatWidget';
import CharacterGridSection from './components/CharacterGridSection';
import CharacterSidebar from './components/CharacterSidebar';
import ChroniclesView from './components/ChroniclesView';
import InteractiveMap from './components/InteractiveMap';
import { PLACES, CHARACTERS, CHRONICLES } from './constants';
import { Place, ViewType, Character, ChronicleEntry } from './types';
import { listPlacesForMap } from './services/placeService';
import { listCharacters } from './services/characterService';
import { listTimelineEvents } from './services/chronicleService';

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('map');
  const [locations, setLocations] = useState<Place[]>(() =>
    PLACES.filter((p) => p.mapX !== undefined && p.mapY !== undefined)
  );
  const [characters, setCharacters] = useState<Character[]>(CHARACTERS);
  const [chronicleEntries, setChronicleEntries] = useState<ChronicleEntry[]>(CHRONICLES);
  const [selectedLocation, setSelectedLocation] = useState<Place | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [currentLocationId, setCurrentLocationId] = useState<string>('loc_1');
  const [activeLocationId, setActiveLocationId] = useState<string | null>('loc_1');
  const [isTraveling, setIsTraveling] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fallbackMapPlaces = PLACES.filter((p) => p.mapX !== undefined && p.mapY !== undefined);

    const loadFromSupabase = async () => {
      try {
        const [dbLocations, dbCharacters, dbChronicles] = await Promise.all([
          listPlacesForMap(),
          listCharacters(),
          listTimelineEvents(),
        ]);

        if (cancelled) return;

        const nextLocations = dbLocations.length > 0 ? dbLocations : fallbackMapPlaces;
        const nextCharacters = dbCharacters.length > 0 ? dbCharacters : CHARACTERS;
        const nextChronicles = dbChronicles.length > 0 ? dbChronicles : CHRONICLES;

        setLocations(nextLocations);
        setCharacters(nextCharacters);
        setChronicleEntries(nextChronicles);

        const firstUnlockedId =
          nextLocations.find((loc) => loc.status !== 'locked')?.id ?? nextLocations[0]?.id;
        if (firstUnlockedId) {
          setCurrentLocationId(firstUnlockedId);
          setActiveLocationId(firstUnlockedId);
        }
      } catch (error) {
        console.warn('[supabase] Failed to load, falling back to constants', error);
        if (cancelled) return;
        setLocations(fallbackMapPlaces);
        setCharacters(CHARACTERS);
        setChronicleEntries(CHRONICLES);
        const fallbackId = fallbackMapPlaces[0]?.id ?? 'loc_1';
        setCurrentLocationId(fallbackId);
        setActiveLocationId(fallbackId);
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    loadFromSupabase();
    return () => {
      cancelled = true;
    };
  }, []);

  const topRef = useRef<HTMLDivElement>(null);
  const characterSectionRef = useRef<HTMLDivElement>(null);
  const chronicleSectionRef = useRef<HTMLDivElement>(null);

  const handleNavigate = (view: ViewType) => {
    setCurrentView(view);
    if (view === 'map') {
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    if (view === 'characters') {
      characterSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    if (view === 'chronicles') {
      chronicleSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleLocationClick = (location: Place) => {
    setSelectedLocation(location);
  };

  const handleUpdateLocation = (updatedLocation: Place) => {
    const newLocations = locations.map((loc) =>
      loc.id === updatedLocation.id ? updatedLocation : loc
    );
    setLocations(newLocations);
    setSelectedLocation(updatedLocation);
  };

  const handleUpdateCharacter = (updatedChar: Character) => {
    const newChars = characters.map((c) => (c.id === updatedChar.id ? updatedChar : c));
    setCharacters(newChars);
    setSelectedCharacter(updatedChar);
  };

  const handleTravel = () => {
    if (selectedLocation && selectedLocation.status !== 'locked') {
      const destinationId = selectedLocation.id;
      setSelectedLocation(null);
      setIsTraveling(true);
      setTimeout(() => {
        setIsTraveling(false);
        setCurrentLocationId(destinationId);
        setActiveLocationId(destinationId);
      }, 2500);
    }
  };

  const handleViewChampionsForLocation = (location: Place) => {
    setActiveLocationId(location.id);
    setCurrentView('characters');
    characterSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const activeLocation = activeLocationId
    ? locations.find((loc) => loc.id === activeLocationId) ?? null
    : null;

  const isActiveLocationLocked = activeLocation?.status === 'locked';

  const filteredCharacters = useMemo(() => {
    if (!activeLocationId) {
      return characters.filter((c) => c.discoveryStage !== 'hidden');
    }
    if (isActiveLocationLocked) return [];
    return characters.filter((c) => c.currentPlaceId === activeLocationId);
  }, [activeLocationId, characters, isActiveLocationLocked]);

  return (
    <div className="relative w-full min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30 font-sans">
      <Navbar currentView={currentView} onNavigate={handleNavigate} />
      <ChatWidget selectedLocation={selectedLocation} />

      {/* HERO MAP */}
      <section ref={topRef} className="relative h-screen w-full px-4 pt-20 sm:px-10">
        <InteractiveMap
          locations={locations}
          selectedLocationId={selectedLocation?.id ?? null}
          currentLocationId={currentLocationId}
          onSelectLocation={handleLocationClick}
          onClearSelection={() => setSelectedLocation(null)}
        />

        {/* Scroll Indicator */}
        <div className="pointer-events-none absolute bottom-8 left-0 w-full flex justify-center">
          <motion.div
            className="flex flex-col items-center gap-2 text-slate-400 opacity-80"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-xs tracking-[0.2em] font-semibold text-cyan-400 drop-shadow-md">
              向下滚动探索
            </span>
            <ChevronDown size={32} className="text-white drop-shadow-md" />
          </motion.div>
        </div>
      </section>

      {/* CONTENT */}
      <main className="relative z-10 w-full bg-slate-950 shadow-[0_-50px_100px_rgba(2,6,23,1)] border-t border-amber-500/10">
        <div className="w-full h-16 -mt-10 bg-gradient-to-b from-transparent to-slate-950 pointer-events-none"></div>

        <section ref={characterSectionRef} className="relative px-4 pt-12 pb-24 sm:px-10">
          <CharacterGridSection
            characters={filteredCharacters}
            activeLocationId={activeLocationId}
            activeLocationName={activeLocation?.name ?? null}
            isActiveLocationLocked={isActiveLocationLocked}
            onClearFilter={() => setActiveLocationId(null)}
            onSelectCharacter={setSelectedCharacter}
          />
        </section>

        <section
          ref={chronicleSectionRef}
          className="relative bg-slate-900/50 border-t border-slate-800 px-4 sm:px-10"
        >
          <div className="py-24">
            <ChroniclesView entries={chronicleEntries} isLoading={isLoadingData} />
          </div>
        </section>

        <footer className="w-full bg-black py-12 border-t border-slate-900 text-center">
          <h3 className="fantasy-font text-2xl text-slate-600 mb-4">艾瑟瑞亚编年史</h3>
          <div className="flex justify-center gap-6 text-slate-500 mb-8">
            <Github className="hover:text-white cursor-pointer transition-colors" />
            <Twitter className="hover:text-white cursor-pointer transition-colors" />
          </div>
          <p className="text-slate-700 text-sm">© 2024 大陆档案馆。保留所有权利。</p>
        </footer>
      </main>

      {/* OVERLAYS */}
      <Sidebar
        location={selectedLocation}
        currentLocationId={currentLocationId}
        onClose={() => setSelectedLocation(null)}
        onUpdate={handleUpdateLocation}
        onTravel={handleTravel}
        onViewChampions={handleViewChampionsForLocation}
      />

      <CharacterSidebar
        character={selectedCharacter}
        onClose={() => setSelectedCharacter(null)}
        onUpdate={handleUpdateCharacter}
      />

      <AnimatePresence>
        {isTraveling && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md pointer-events-none"
          >
            <div className="text-center flex flex-col items-center">
              <motion.div
                animate={{ scale: [1, 1.05, 1], textShadow: '0px 0px 8px rgb(251, 191, 36)' }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="text-amber-400 text-5xl font-bold fantasy-font mb-8"
              >
                正在穿越大陆…
              </motion.div>
              <div className="mb-8 relative w-24 h-24 border-4 border-slate-700 rounded-full flex items-center justify-center">
                <motion.div
                  className="w-16 h-1 bg-cyan-500 absolute"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="w-1 h-16 bg-cyan-500 absolute"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
