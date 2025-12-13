import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Home, Search } from 'lucide-react';
import { Place } from '../types';
import { listPlaces } from '../services/placeService';
import { PLACES } from '../constants';

const LorePage: React.FC = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await listPlaces();
        if (!cancelled) setPlaces(data.length > 0 ? data : PLACES);
      } catch (error) {
        console.warn('[lore] failed to load places, fallback to constants', error);
        if (!cancelled) setPlaces(PLACES);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPlaces = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return places;
    return places.filter((p) => {
      const hay = `${p.name} ${p.slug}`.toLowerCase();
      return hay.includes(q);
    });
  }, [places, query]);

  const byParent = useMemo(() => {
    const map = new Map<string, Place[]>();
    for (const p of filteredPlaces) {
      const key = p.parentId ?? 'root';
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      );
    }
    return map;
  }, [filteredPlaces]);

  const MAX_TREE_DEPTH = 12;

  const renderTree = (parentKey: string, depth: number, visited: Set<string>) => {
    if (depth > MAX_TREE_DEPTH) {
      return (
        <div className="text-xs text-slate-500 px-4 py-2 rounded-lg border border-white/10 bg-slate-950/30">
          已达到最大展开层级（可能存在异常层级配置）
        </div>
      );
    }

    const children = byParent.get(parentKey) ?? [];
    if (children.length === 0) return null;
    return (
      <div className={depth === 0 ? 'space-y-2' : 'space-y-1'}>
        {children.map((p) => {
          const isCycle = visited.has(p.id);
          const nextVisited = new Set(visited);
          nextVisited.add(p.id);

          return (
          <div key={p.id} className="space-y-1">
            <a
              href={`/place/${encodeURIComponent(p.slug)}`}
              className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-900/40 hover:bg-slate-900/70 px-4 py-3 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs uppercase tracking-widest text-slate-500 shrink-0">
                    {p.kind}
                  </span>
                  <span className="text-slate-100 font-semibold truncate">{p.name}</span>
                </div>
                {p.description && (
                  <div className="text-xs text-slate-400 mt-1 line-clamp-2">{p.description}</div>
                )}
              </div>
              <ChevronRight className="text-slate-500 group-hover:text-amber-300 shrink-0" size={18} />
            </a>
            <div className="pl-5 border-l border-white/5">
              {isCycle ? (
                <div className="text-xs text-rose-400 px-4 py-2 rounded-lg border border-rose-500/20 bg-rose-500/10">
                  检测到循环引用（parent_id 配置可能有误），已停止展开
                </div>
              ) : (
                renderTree(p.id, depth + 1, nextVisited)
              )}
            </div>
          </div>
          );
        })}
      </div>
    );
  };

  const hasQuery = query.trim().length > 0;
  const continents = filteredPlaces.filter((p) => p.kind === 'continent');
  const hasContinents = continents.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur border-b border-white/10 px-4 sm:px-10 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-xl sm:text-2xl fantasy-font text-amber-300">设定集</div>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            <Home size={16} />
            返回首页
          </a>
        </div>

        <div className="relative w-full max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索地点/地区…"
            className="w-full bg-slate-900/60 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </header>

      <main className="px-4 sm:px-10 py-8">
        {isLoading ? (
          <div className="text-sm text-slate-400 italic">正在加载设定集…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-8">
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6">
                <div className="text-slate-100 font-semibold mb-2">地区树</div>
                <div className="text-sm text-slate-400 leading-6">
                  从大陆到城市，再到地图上的每一处地标。
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6">
                {hasQuery ? (
                  filteredPlaces.length > 0 ? (
                    <div className="space-y-2">
                      {filteredPlaces
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
                        .slice(0, 50)
                        .map((p) => (
                          <a
                            key={p.id}
                            href={`/place/${encodeURIComponent(p.slug)}`}
                            className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/40 hover:bg-slate-950/70 px-4 py-3 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs uppercase tracking-widest text-slate-500 shrink-0">
                                  {p.kind}
                                </span>
                                <span className="text-slate-100 font-semibold truncate">{p.name}</span>
                              </div>
                              {p.description && (
                                <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                                  {p.description}
                                </div>
                              )}
                            </div>
                            <ChevronRight
                              className="text-slate-500 group-hover:text-amber-300 shrink-0"
                              size={18}
                            />
                          </a>
                        ))}
                      {filteredPlaces.length > 50 && (
                        <div className="text-xs text-slate-500 px-4 pt-2">
                          已匹配 {filteredPlaces.length} 条，仅展示前 50 条
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">未找到匹配地点/地区。</div>
                  )
                ) : hasContinents ? (
                  <div className="space-y-3">
                    {continents.map((c) => (
                      <div key={c.id} className="space-y-2">
                        <a
                          href={`/place/${encodeURIComponent(c.slug)}`}
                          className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/40 hover:bg-slate-950/70 px-4 py-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-slate-100 font-semibold truncate">{c.name}</div>
                            {c.description && (
                              <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                                {c.description}
                              </div>
                            )}
                          </div>
                          <ChevronRight
                            className="text-slate-500 group-hover:text-amber-300 shrink-0"
                            size={18}
                          />
                        </a>
                        <div className="pl-5 border-l border-white/5">
                          {renderTree(c.id, 1, new Set([c.id]))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">
                    暂无大陆数据。你可以先在 <a className="text-amber-300 underline" href="/admin">/admin</a>{' '}
                    创建 places。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8">
              <div className="text-2xl fantasy-font text-amber-200 mb-4">欢迎来到设定集</div>
              <div className="text-slate-300 leading-7">
                这里汇聚了大陆、国家、城市与地标的设定，以及英雄与短篇故事。使用左侧地区树进入详情页，
                或在顶部搜索快速定位。
              </div>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredPlaces
                  .filter((p) => p.kind === 'poi' && p.mapX !== undefined && p.mapY !== undefined)
                  .slice(0, 6)
                  .map((p) => (
                    <a
                      key={p.id}
                      href={`/place/${encodeURIComponent(p.slug)}`}
                      className="rounded-xl border border-white/10 bg-slate-950/40 hover:bg-slate-950/70 p-4 transition-colors"
                    >
                      <div className="text-slate-100 font-semibold">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-1 line-clamp-2">{p.description}</div>
                    </a>
                  ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default LorePage;
