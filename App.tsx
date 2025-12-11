import React, { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Github, Twitter } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import ChatWidget from './components/ChatWidget';
import CharacterGridSection from './components/CharacterGridSection';
import CharacterSidebar from './components/CharacterSidebar';
import ChroniclesView from './components/ChroniclesView';
import InteractiveMap from './components/InteractiveMap';
import { LOCATIONS, CHARACTERS } from './constants';
import { Location, ViewType, Character } from './types';

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('map');
  const [locations, setLocations] = useState<Location[]>(LOCATIONS);
  const [characters, setCharacters] = useState<Character[]>(CHARACTERS);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [currentLocationId, setCurrentLocationId] = useState<string>('loc_1');
  const [isTraveling, setIsTraveling] = useState(false);

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

  const handleLocationClick = (location: Location) => {
    setSelectedLocation(location);
  };

  const handleUpdateLocation = (updatedLocation: Location) => {
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
      setSelectedLocation(null);
      setIsTraveling(true);
      setTimeout(() => {
        setIsTraveling(false);
        setCurrentLocationId(selectedLocation.id);
      }, 2500);
    }
  };

  const handleViewDetails = (location: Location) => {
    setSelectedLocation(location);
    setCurrentView('characters');
    characterSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
          onViewDetails={handleViewDetails}
        />

        {/* Scroll Indicator */}
        <div className="pointer-events-none absolute bottom-8 left-0 w-full flex justify-center">
          <motion.div
            className="flex flex-col items-center gap-2 text-slate-400 opacity-80"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-xs uppercase tracking-[0.2em] font-semibold text-cyan-400 drop-shadow-md">
              Scroll to Explore
            </span>
            <ChevronDown size={32} className="text-white drop-shadow-md" />
          </motion.div>
        </div>
      </section>

      {/* CONTENT */}
      <main className="relative z-10 w-full bg-slate-950 shadow-[0_-50px_100px_rgba(2,6,23,1)] border-t border-amber-500/10">
        <div className="w-full h-16 -mt-10 bg-gradient-to-b from-transparent to-slate-950 pointer-events-none"></div>

        <section ref={characterSectionRef} className="relative px-4 pt-12 pb-24 sm:px-10">
          <CharacterGridSection characters={characters} onSelectCharacter={setSelectedCharacter} />
        </section>

        <section
          ref={chronicleSectionRef}
          className="relative bg-slate-900/50 border-t border-slate-800 px-4 sm:px-10"
        >
          <div className="py-24">
            <ChroniclesView />
          </div>
        </section>

        <footer className="w-full bg-black py-12 border-t border-slate-900 text-center">
          <h3 className="fantasy-font text-2xl text-slate-600 mb-4">Aetheria Chronicles</h3>
          <div className="flex justify-center gap-6 text-slate-500 mb-8">
            <Github className="hover:text-white cursor-pointer transition-colors" />
            <Twitter className="hover:text-white cursor-pointer transition-colors" />
          </div>
          <p className="text-slate-700 text-sm">? 2024 Realm Archives. All rights reserved.</p>
        </footer>
      </main>

      {/* OVERLAYS */}
      <Sidebar
        location={selectedLocation}
        currentLocationId={currentLocationId}
        onClose={() => setSelectedLocation(null)}
        onUpdate={handleUpdateLocation}
        onTravel={handleTravel}
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
                Traversing the Realm...
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
