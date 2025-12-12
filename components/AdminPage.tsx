import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, LogOut, Shield } from 'lucide-react';
import { Location, Character, ChronicleEntry } from '../types';
import { listLocations } from '../services/locationService';
import { listCharacters } from '../services/characterService';
import { listTimelineEvents } from '../services/chronicleService';
import {
  adminListLocations,
  adminCreateLocation,
  adminUpdateLocation,
  adminDeleteLocation,
  adminCreateCharacter,
  adminUpdateCharacter,
  adminDeleteCharacter,
  adminCreateTimelineEvent,
  adminUpdateTimelineEvent,
  adminDeleteTimelineEvent,
  adminUploadImage,
} from '../services/adminApi';

type TabKey = 'locations' | 'characters' | 'chronicles';

const AdminPage: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('');
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('adminEditToken');
  });
  const [isVerified, setIsVerified] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('locations');
  const [locations, setLocations] = useState<Location[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [chronicles, setChronicles] = useState<ChronicleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState<Partial<Location>>({});

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [characterForm, setCharacterForm] = useState<Partial<Character>>({});
  const [storiesJson, setStoriesJson] = useState('[]');
  const [attributesJson, setAttributesJson] = useState('{}');

  const [selectedChronicleId, setSelectedChronicleId] = useState<string | null>(null);
  const [chronicleForm, setChronicleForm] = useState<Partial<ChronicleEntry>>({});

  const [locationImageFile, setLocationImageFile] = useState<File | null>(null);
  const [characterImageFile, setCharacterImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const reloadData = async () => {
    setIsLoading(true);
    try {
      const [dbLocations, dbCharacters, dbChronicles] = await Promise.all([
        listLocations(),
        listCharacters(),
        listTimelineEvents(),
      ]);
      setLocations(dbLocations);
      setCharacters(dbCharacters);
      setChronicles(dbChronicles);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyToken = async () => {
    try {
      await adminListLocations();
      setIsVerified(true);
      setAuthError(null);
      await reloadData();
    } catch {
      setIsVerified(false);
      setAuthError('管理员口令无效');
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('adminEditToken');
      }
      setAdminToken(null);
    }
  };

  useEffect(() => {
    if (adminToken) {
      verifyToken();
    }
  }, [adminToken]);

  const handleLogin = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('adminEditToken', token);
    }
    setAdminToken(token);
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('adminEditToken');
    }
    setAdminToken(null);
    setIsVerified(false);
    setAuthError(null);
  };

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [locations]
  );
  const sortedCharacters = useMemo(
    () => [...characters].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [characters]
  );
  const sortedChronicles = useMemo(
    () => [...chronicles].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    [chronicles]
  );

  const toLocationRow = (form: Partial<Location>) => ({
    name: form.name ?? '',
    type: form.type ?? 'mystic',
    x: Number(form.x ?? 0),
    y: Number(form.y ?? 0),
    description: form.description ?? '',
    lore: form.lore ?? '',
    image_url: form.imageUrl ?? '',
    status: form.status ?? 'unlocked',
  });

  const toCharacterRow = (form: Partial<Character>) => {
    let stories: unknown = [];
    let attributes: unknown = null;
    try {
      stories = JSON.parse(storiesJson);
    } catch {
      stories = [];
    }
    try {
      attributes = JSON.parse(attributesJson);
    } catch {
      attributes = null;
    }

    return {
      name: form.name ?? '',
      title: form.title ?? '',
      faction: form.faction ?? '',
      description: form.description ?? '',
      lore: form.lore ?? '',
      bio: form.bio ?? '',
      rp_prompt: form.rpPrompt ?? '',
      image_url: form.imageUrl ?? '',
      stories,
      current_location_id: form.currentLocationId ?? locations[0]?.id ?? null,
      home_location_id: form.homeLocationId ?? null,
      discovery_stage: form.discoveryStage ?? 'revealed',
      attributes,
    };
  };

  const toTimelineRow = (form: Partial<ChronicleEntry>) => ({
    title: form.title ?? '',
    date_label: form.date ?? '',
    summary: form.summary ?? '',
    status: form.status ?? 'pending',
  });

  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const parts = result.split(',');
          resolve(parts[1] || '');
        } else {
          resolve('');
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleUploadLocationImage = async () => {
    if (!selectedLocationId) {
      setStatusMessage('请先保存以生成 ID');
      return;
    }
    if (!locationImageFile) {
      setStatusMessage('请先选择图片');
      return;
    }
    if (locationImageFile.size > MAX_IMAGE_BYTES) {
      setStatusMessage('图片过大，请压缩后再上传');
      return;
    }

    setIsUploadingImage(true);
    setStatusMessage(null);
    try {
      const base64 = await readFileAsBase64(locationImageFile);
      const publicUrl = await adminUploadImage({
        entity: 'location',
        id: selectedLocationId,
        filename: locationImageFile.name,
        contentType: locationImageFile.type,
        base64,
      });

      const nextForm = { ...locationForm, imageUrl: publicUrl };
      setLocationForm(nextForm);
      await handleSaveLocation(nextForm);
      setLocationImageFile(null);
    } catch (err: any) {
      setStatusMessage(`上传失败：${err?.message ?? '未知错误'}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUploadCharacterImage = async () => {
    if (!selectedCharacterId) {
      setStatusMessage('请先保存以生成 ID');
      return;
    }
    if (!characterImageFile) {
      setStatusMessage('请先选择图片');
      return;
    }
    if (characterImageFile.size > MAX_IMAGE_BYTES) {
      setStatusMessage('图片过大，请压缩后再上传');
      return;
    }

    setIsUploadingImage(true);
    setStatusMessage(null);
    try {
      const base64 = await readFileAsBase64(characterImageFile);
      const publicUrl = await adminUploadImage({
        entity: 'character',
        id: selectedCharacterId,
        filename: characterImageFile.name,
        contentType: characterImageFile.type,
        base64,
      });

      const nextForm = { ...characterForm, imageUrl: publicUrl };
      setCharacterForm(nextForm);
      await handleSaveCharacter(nextForm);
      setCharacterImageFile(null);
    } catch (err: any) {
      setStatusMessage(`上传失败：${err?.message ?? '未知错误'}`);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveLocation = async (override?: Partial<Location>) => {
    setStatusMessage(null);
    try {
      const payload = toLocationRow(override ?? locationForm);
      if (selectedLocationId) {
        await adminUpdateLocation(selectedLocationId, payload);
      } else {
        const created: any = await adminCreateLocation(payload);
        setSelectedLocationId(created?.id ? String(created.id) : null);
      }
      await reloadData();
      setStatusMessage('已保存');
    } catch (err: any) {
      setStatusMessage(`保存失败：${err?.message ?? '未知错误'}`);
    }
  };

  const handleDeleteLocation = async () => {
    if (!selectedLocationId) return;
    setStatusMessage(null);
    try {
      await adminDeleteLocation(selectedLocationId);
      setSelectedLocationId(null);
      setLocationForm({});
      await reloadData();
      setStatusMessage('已删除');
    } catch (err: any) {
      setStatusMessage(`删除失败：${err?.message ?? '未知错误'}`);
    }
  };

  const handleSaveCharacter = async (override?: Partial<Character>) => {
    setStatusMessage(null);
    try {
      const payload = toCharacterRow(override ?? characterForm);
      if (selectedCharacterId) {
        await adminUpdateCharacter(selectedCharacterId, payload);
      } else {
        const created: any = await adminCreateCharacter(payload);
        setSelectedCharacterId(created?.id ? String(created.id) : null);
      }
      await reloadData();
      setStatusMessage('已保存');
    } catch (err: any) {
      setStatusMessage(`保存失败：${err?.message ?? '未知错误'}`);
    }
  };

  const handleDeleteCharacter = async () => {
    if (!selectedCharacterId) return;
    setStatusMessage(null);
    try {
      await adminDeleteCharacter(selectedCharacterId);
      setSelectedCharacterId(null);
      setCharacterForm({});
      setStoriesJson('[]');
      setAttributesJson('{}');
      await reloadData();
      setStatusMessage('已删除');
    } catch (err: any) {
      setStatusMessage(`删除失败：${err?.message ?? '未知错误'}`);
    }
  };

  const handleSaveChronicle = async () => {
    setStatusMessage(null);
    try {
      const payload = toTimelineRow(chronicleForm);
      if (selectedChronicleId) {
        await adminUpdateTimelineEvent(selectedChronicleId, payload);
      } else {
        const created: any = await adminCreateTimelineEvent(payload);
        setSelectedChronicleId(created?.id ? String(created.id) : null);
      }
      await reloadData();
      setStatusMessage('已保存');
    } catch (err: any) {
      setStatusMessage(`保存失败：${err?.message ?? '未知错误'}`);
    }
  };

  const handleDeleteChronicle = async () => {
    if (!selectedChronicleId) return;
    setStatusMessage(null);
    try {
      await adminDeleteTimelineEvent(selectedChronicleId);
      setSelectedChronicleId(null);
      setChronicleForm({});
      await reloadData();
      setStatusMessage('已删除');
    } catch (err: any) {
      setStatusMessage(`删除失败：${err?.message ?? '未知错误'}`);
    }
  };

  if (!isVerified) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-slate-900/70 border border-white/10 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="text-amber-400" />
            <h1 className="text-2xl font-bold fantasy-font">管理员入口</h1>
          </div>
          <label className="block text-sm text-slate-300 mb-2">请输入管理员口令</label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 outline-none"
            placeholder="管理员口令"
          />
          {authError && <div className="text-rose-400 text-sm mt-3">{authError}</div>}
          <button
            type="button"
            onClick={handleLogin}
            className="mt-6 w-full bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-lg font-semibold transition-colors"
          >
            进入管理面板
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur border-b border-white/10 px-4 sm:px-10 py-4 flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl fantasy-font text-amber-300">世界观管理面板</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          退出管理模式
        </button>
      </header>

      <main className="px-4 sm:px-10 py-6">
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('locations')}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeTab === 'locations' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            地点
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('characters')}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeTab === 'characters' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            角色
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chronicles')}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeTab === 'chronicles' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            编年史事件
          </button>
        </div>

        {statusMessage && (
          <div className="mb-4 text-sm text-slate-200 bg-slate-900/60 border border-white/10 rounded-lg px-4 py-2">
            {statusMessage}
          </div>
        )}

        {isLoading && <div className="mb-4 text-sm text-slate-400 italic">正在加载数据...</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-4 h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-slate-300">
                {activeTab === 'locations' && '地点列表'}
                {activeTab === 'characters' && '角色列表'}
                {activeTab === 'chronicles' && '事件列表'}
              </div>
              <button
                type="button"
                onClick={() => {
                  setStatusMessage(null);
                  if (activeTab === 'locations') {
                    setSelectedLocationId(null);
                    setLocationForm({
                      name: '',
                      type: 'mystic',
                      x: 50,
                      y: 50,
                      description: '',
                      lore: '',
                      imageUrl: '',
                      status: 'unlocked',
                    });
                  }
                  if (activeTab === 'characters') {
                    setSelectedCharacterId(null);
                    setCharacterForm({
                      name: '',
                      title: '',
                      faction: '',
                      description: '',
                      lore: '',
                      bio: '',
                      rpPrompt: '',
                      imageUrl: '',
                      currentLocationId: locations[0]?.id,
                      homeLocationId: undefined,
                      discoveryStage: 'revealed',
                    });
                    setStoriesJson('[]');
                    setAttributesJson('{}');
                  }
                  if (activeTab === 'chronicles') {
                    setSelectedChronicleId(null);
                    setChronicleForm({
                      title: '',
                      date: '',
                      summary: '',
                      status: 'pending',
                    });
                  }
                }}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100"
              >
                <Plus size={14} />
                新增
              </button>
            </div>

            {activeTab === 'locations' &&
              sortedLocations.map((loc) => (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => {
                    setSelectedLocationId(loc.id);
                    setLocationForm(loc);
                    setStatusMessage(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                    selectedLocationId === loc.id
                      ? 'bg-amber-500/20 text-amber-200'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {loc.imageUrl ? (
                      <img
                        src={loc.imageUrl}
                        alt={loc.name}
                        className="w-9 h-9 rounded-full object-cover bg-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-sm font-semibold text-slate-300 shrink-0">
                        {(loc.name || '?').slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{loc.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {loc.type}
                        {loc.status ? ` · ${loc.status}` : ''}
                      </div>
                    </div>
                  </div>
                </button>
              ))}

            {activeTab === 'characters' &&
              sortedCharacters.map((char) => (
                <button
                  key={char.id}
                  type="button"
                  onClick={() => {
                    setSelectedCharacterId(char.id);
                    setCharacterForm(char);
                    setStoriesJson(JSON.stringify(char.stories ?? [], null, 2));
                    setAttributesJson(JSON.stringify(char.attributes ?? {}, null, 2));
                    setStatusMessage(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                    selectedCharacterId === char.id
                      ? 'bg-amber-500/20 text-amber-200'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {char.imageUrl ? (
                      <img
                        src={char.imageUrl}
                        alt={char.name}
                        className="w-9 h-9 rounded-full object-cover bg-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-sm font-semibold text-slate-300 shrink-0">
                        {(char.name || '?').slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{char.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {char.title || char.faction || ''}
                      </div>
                    </div>
                  </div>
                </button>
              ))}

            {activeTab === 'chronicles' &&
              sortedChronicles.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setSelectedChronicleId(entry.id);
                    setChronicleForm(entry);
                    setStatusMessage(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${
                    selectedChronicleId === entry.id
                      ? 'bg-amber-500/20 text-amber-200'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  {entry.title}
                </button>
              ))}
          </div>

          <div className="bg-slate-900/50 border border-white/10 rounded-2xl p-6 h-[70vh] overflow-y-auto">
            {activeTab === 'locations' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                  {locationForm.imageUrl ? (
                    <img
                      src={locationForm.imageUrl}
                      alt={locationForm.name ?? '当前图片'}
                      className="w-full max-h-52 object-contain rounded-lg bg-slate-950/60"
                    />
                  ) : (
                    <div className="w-full h-40 rounded-lg bg-slate-800/60 flex items-center justify-center text-sm text-slate-400">
                      暂无图片
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">名称</label>
                    <input
                      value={locationForm.name ?? ''}
                      onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">类型</label>
                    <select
                      value={locationForm.type ?? 'mystic'}
                      onChange={(e) =>
                        setLocationForm({ ...locationForm, type: e.target.value as Location['type'] })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    >
                      <option value="mystic">mystic</option>
                      <option value="nature">nature</option>
                      <option value="city">city</option>
                      <option value="ruin">ruin</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">X（0-100）</label>
                    <input
                      type="number"
                      value={locationForm.x ?? 0}
                      onChange={(e) => setLocationForm({ ...locationForm, x: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Y（0-100）</label>
                    <input
                      type="number"
                      value={locationForm.y ?? 0}
                      onChange={(e) => setLocationForm({ ...locationForm, y: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">简短描述</label>
                  <textarea
                    rows={3}
                    value={locationForm.description ?? ''}
                    onChange={(e) => setLocationForm({ ...locationForm, description: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">传说</label>
                  <textarea
                    rows={6}
                    value={locationForm.lore ?? ''}
                    onChange={(e) => setLocationForm({ ...locationForm, lore: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">图片 URL</label>
                    <input
                      value={locationForm.imageUrl ?? ''}
                      onChange={(e) => setLocationForm({ ...locationForm, imageUrl: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setLocationImageFile(e.target.files?.[0] ?? null)
                        }
                        className="text-xs text-slate-200 file:mr-2 file:px-3 file:py-1 file:rounded file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-600"
                      />
                      <button
                        type="button"
                        onClick={handleUploadLocationImage}
                        disabled={isUploadingImage || !selectedLocationId}
                        className={`px-3 py-2 text-xs rounded font-semibold transition-colors ${
                          isUploadingImage
                            ? 'bg-slate-700 text-slate-300 cursor-wait'
                            : 'bg-amber-600 hover:bg-amber-500 text-white'
                        } ${!selectedLocationId ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isUploadingImage ? '上传中...' : '上传并替换'}
                      </button>
                    </div>
                    {!selectedLocationId && (
                      <div className="mt-1 text-xs text-slate-500">请先保存以生成 ID</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">状态</label>
                    <select
                      value={locationForm.status ?? 'unlocked'}
                      onChange={(e) =>
                        setLocationForm({ ...locationForm, status: e.target.value as Location['status'] })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    >
                      <option value="unlocked">unlocked</option>
                      <option value="locked">locked</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveLocation}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded text-white font-semibold"
                  >
                    <Save size={16} />
                    保存
                  </button>
                  {selectedLocationId && (
                    <button
                      type="button"
                      onClick={handleDeleteLocation}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-rose-700 hover:bg-rose-600 rounded text-white font-semibold"
                    >
                      <Trash2 size={16} />
                      删除
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'characters' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
                  {characterForm.imageUrl ? (
                    <img
                      src={characterForm.imageUrl}
                      alt={characterForm.name ?? '当前图片'}
                      className="w-full max-h-52 object-contain rounded-lg bg-slate-950/60"
                    />
                  ) : (
                    <div className="w-full h-40 rounded-lg bg-slate-800/60 flex items-center justify-center text-sm text-slate-400">
                      暂无图片
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">名称</label>
                    <input
                      value={characterForm.name ?? ''}
                      onChange={(e) =>
                        setCharacterForm({ ...characterForm, name: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">称号</label>
                    <input
                      value={characterForm.title ?? ''}
                      onChange={(e) =>
                        setCharacterForm({ ...characterForm, title: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">阵营/势力</label>
                    <input
                      value={characterForm.faction ?? ''}
                      onChange={(e) =>
                        setCharacterForm({ ...characterForm, faction: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">图片 URL</label>
                    <input
                      value={characterForm.imageUrl ?? ''}
                      onChange={(e) =>
                        setCharacterForm({ ...characterForm, imageUrl: e.target.value })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setCharacterImageFile(e.target.files?.[0] ?? null)
                        }
                        className="text-xs text-slate-200 file:mr-2 file:px-3 file:py-1 file:rounded file:border-0 file:bg-slate-700 file:text-white hover:file:bg-slate-600"
                      />
                      <button
                        type="button"
                        onClick={handleUploadCharacterImage}
                        disabled={isUploadingImage || !selectedCharacterId}
                        className={`px-3 py-2 text-xs rounded font-semibold transition-colors ${
                          isUploadingImage
                            ? 'bg-slate-700 text-slate-300 cursor-wait'
                            : 'bg-amber-600 hover:bg-amber-500 text-white'
                        } ${!selectedCharacterId ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isUploadingImage ? '上传中...' : '上传并替换'}
                      </button>
                    </div>
                    {!selectedCharacterId && (
                      <div className="mt-1 text-xs text-slate-500">请先保存以生成 ID</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">简短描述</label>
                  <textarea
                    rows={3}
                    value={characterForm.description ?? ''}
                    onChange={(e) =>
                      setCharacterForm({ ...characterForm, description: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">传记 / Lore</label>
                  <textarea
                    rows={5}
                    value={characterForm.lore ?? ''}
                    onChange={(e) =>
                      setCharacterForm({ ...characterForm, lore: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bio（酒馆/叙事）</label>
                  <textarea
                    rows={4}
                    value={characterForm.bio ?? ''}
                    onChange={(e) =>
                      setCharacterForm({ ...characterForm, bio: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">角色 RP Prompt</label>
                  <textarea
                    rows={4}
                    value={characterForm.rpPrompt ?? ''}
                    onChange={(e) =>
                      setCharacterForm({ ...characterForm, rpPrompt: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Stories（JSON 数组）</label>
                  <textarea
                    rows={5}
                    value={storiesJson}
                    onChange={(e) => setStoriesJson(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Attributes（JSON 对象）</label>
                  <textarea
                    rows={5}
                    value={attributesJson}
                    onChange={(e) => setAttributesJson(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">当前地点</label>
                    <select
                      value={characterForm.currentLocationId ?? locations[0]?.id ?? ''}
                      onChange={(e) =>
                        setCharacterForm({
                          ...characterForm,
                          currentLocationId: e.target.value,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    >
                      {sortedLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">家乡地点（可选）</label>
                    <select
                      value={characterForm.homeLocationId ?? ''}
                      onChange={(e) =>
                        setCharacterForm({
                          ...characterForm,
                          homeLocationId: e.target.value || undefined,
                        })
                      }
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    >
                      <option value="">无</option>
                      {sortedLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">发现阶段</label>
                  <select
                    value={characterForm.discoveryStage ?? 'revealed'}
                    onChange={(e) =>
                      setCharacterForm({
                        ...characterForm,
                        discoveryStage: e.target.value as Character['discoveryStage'],
                      })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  >
                    <option value="hidden">hidden</option>
                    <option value="rumor">rumor</option>
                    <option value="revealed">revealed</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveCharacter}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded text-white font-semibold"
                  >
                    <Save size={16} />
                    保存
                  </button>
                  {selectedCharacterId && (
                    <button
                      type="button"
                      onClick={handleDeleteCharacter}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-rose-700 hover:bg-rose-600 rounded text-white font-semibold"
                    >
                      <Trash2 size={16} />
                      删除
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'chronicles' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">标题</label>
                  <input
                    value={chronicleForm.title ?? ''}
                    onChange={(e) =>
                      setChronicleForm({ ...chronicleForm, title: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">日期 / 纪元</label>
                  <input
                    value={chronicleForm.date ?? ''}
                    onChange={(e) =>
                      setChronicleForm({ ...chronicleForm, date: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">摘要</label>
                  <textarea
                    rows={5}
                    value={chronicleForm.summary ?? ''}
                    onChange={(e) =>
                      setChronicleForm({ ...chronicleForm, summary: e.target.value })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">状态</label>
                  <select
                    value={chronicleForm.status ?? 'pending'}
                    onChange={(e) =>
                      setChronicleForm({
                        ...chronicleForm,
                        status: e.target.value as ChronicleEntry['status'],
                      })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  >
                    <option value="completed">completed</option>
                    <option value="active">active</option>
                    <option value="pending">pending</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveChronicle}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 rounded text-white font-semibold"
                  >
                    <Save size={16} />
                    保存
                  </button>
                  {selectedChronicleId && (
                    <button
                      type="button"
                      onClick={handleDeleteChronicle}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-rose-700 hover:bg-rose-600 rounded text-white font-semibold"
                    >
                      <Trash2 size={16} />
                      删除
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
