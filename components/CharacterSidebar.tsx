import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Edit2, BookOpen, User, Sword, ExternalLink } from 'lucide-react';
import { Character } from '../types';

interface CharacterSidebarProps {
  character: Character | null;
  onClose: () => void;
  onUpdate: (character: Character) => void;
}

const CharacterSidebar: React.FC<CharacterSidebarProps> = ({ character, onClose, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Character>>({});
  const isAdminMode = import.meta.env.VITE_ADMIN_MODE === 'true';

  useEffect(() => {
    setIsEditing(false);
    if (character) {
      setFormData(character);
    }
  }, [character]);

  const handleSave = () => {
    if (!isAdminMode) return;
    if (character && formData) {
      onUpdate({ ...character, ...formData } as Character);
      setIsEditing(false);
    }
  };

  if (!character) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="char-sidebar"
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="fixed top-0 right-0 h-full w-full sm:w-[500px] z-[60] p-0 shadow-2xl"
      >
        <div className="h-full w-full bg-slate-950 border-l border-amber-500/20 flex flex-col overflow-hidden relative">
          
          {/* Header / Cover Image */}
          <div className="relative h-72 shrink-0">
             <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-950 z-10"></div>
             <img src={formData.imageUrl} alt={formData.name} className="w-full h-full object-cover object-top" />
             
             <button 
              onClick={onClose}
              className="absolute top-4 left-4 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors z-20 backdrop-blur-md border border-white/10"
            >
              <X size={20} />
            </button>

            {!isEditing && isAdminMode && (
              <button 
                onClick={() => setIsEditing(true)}
                className="absolute top-4 right-4 p-2 bg-amber-600/90 hover:bg-amber-500 rounded-full text-white shadow-lg border border-amber-400/50 transition-all hover:scale-105 z-20"
              >
                <Edit2 size={16} />
              </button>
            )}

            {!isEditing && (
              <a
                href={`/character/${encodeURIComponent(character.slug)}`}
                className="absolute top-4 right-16 px-3 py-2 bg-black/50 hover:bg-black/70 rounded-full text-white/90 transition-colors z-20 backdrop-blur-md border border-white/10 text-xs font-semibold uppercase tracking-widest inline-flex items-center gap-2"
                title="查看详情"
              >
                <ExternalLink size={14} />
                详情
              </a>
            )}

            <div className="absolute bottom-0 left-0 w-full p-8 z-20">
               {isAdminMode && isEditing ? (
                  <div className="space-y-2">
                     <input 
                        className="bg-black/50 border border-amber-500/50 text-3xl font-bold text-white w-full px-2 py-1 rounded fantasy-font"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                     />
                     <input 
                        className="bg-black/50 border border-slate-600 text-amber-400 text-sm uppercase tracking-widest font-bold w-full px-2 py-1 rounded"
                        value={formData.title}
                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                     />
                  </div>
               ) : (
                  <>
                    <motion.h2 layoutId={`char-name-${character.id}`} className="text-4xl font-bold text-white fantasy-font leading-none mb-2">{character.name}</motion.h2>
                    <p className="text-amber-500 uppercase tracking-[0.2em] text-sm font-bold">{character.title}</p>
                  </>
               )}
            </div>
          </div>

          {/* Content Scroll Area */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 relative z-10 bg-slate-950">
             
             {/* Faction & Role */}
             <div className="flex items-center gap-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                   <Sword size={14} className="text-slate-500" />
                   <span>{character.faction}</span>
                </div>
                <div className="w-1 h-1 bg-slate-600 rounded-full"></div>
                <div className="flex items-center gap-2">
                   <User size={14} className="text-slate-500" />
                   <span>英雄</span>
                </div>
             </div>

             {/* Biography */}
             <div className="space-y-4">
                <div className="flex items-center gap-2 text-white border-b border-slate-800 pb-2">
                   <BookOpen size={18} className="text-amber-500" />
                   <h3 className="text-lg font-serif">传记</h3>
                </div>
                
                {isAdminMode && isEditing ? (
                   <textarea 
                      className="w-full h-40 bg-slate-900 border border-slate-700 rounded p-4 text-slate-300 leading-relaxed focus:border-amber-500 outline-none"
                      value={formData.lore}
                      onChange={(e) => setFormData({...formData, lore: e.target.value})}
                   />
                ) : (
                   <p className="text-slate-300 leading-7 font-light text-justify">
                      {character.lore || character.description}
                   </p>
                )}
             </div>

             {/* Stories Section */}
             <div className="space-y-4">
                <div className="flex items-center gap-2 text-white border-b border-slate-800 pb-2">
                   <BookOpen size={18} className="text-cyan-500" />
                   <h3 className="text-lg font-serif">相关故事</h3>
                </div>
                
                <div className="text-sm text-slate-400 leading-6">
                  相关短篇已迁移到设定集系统，请前往{' '}
                  <a
                    className="text-amber-300 underline"
                    href={`/character/${encodeURIComponent(character.slug)}`}
                  >
                    英雄详情页
                  </a>{' '}
                  查看。
                </div>
             </div>

             {/* Edit Actions */}
             {isAdminMode && isEditing && (
                <div className="sticky bottom-0 pt-4 bg-slate-950 border-t border-slate-800 flex gap-2">
                   <button onClick={handleSave} className="flex-1 bg-green-700 hover:bg-green-600 text-white py-3 rounded font-bold flex items-center justify-center gap-2 transition-colors">
                      <Save size={18} /> 保存修改
                   </button>
                   <button onClick={() => setIsEditing(false)} className="px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded font-bold transition-colors">
                      取消
                   </button>
                </div>
             )}
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CharacterSidebar;
