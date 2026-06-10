import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from 'react-router';
import { Layout } from "../../components/Layout";
import { Button } from "../../components/ui/Button";
import { ApiError, backendApi } from "../../services/backendApi";
import type { VideoMusicDto } from "../../services/backendApi.videoMusic";
import { useAppStore } from "../../store/useAppStore";

/**
 * 将选中的音乐 ID 添加到返回路径中
 */
function appendSelectedMusicToReturnPath(returnTo: string, musicId: string | null): string {
  if (!returnTo) {
    return "/create/step5";
  }
  const [path, rawSearch = ""] = returnTo.split("?");
  const params = new URLSearchParams(rawSearch);
  if (musicId) {
    params.set("musicId", musicId);
  } else {
    params.delete("musicId");
  }
  const nextSearch = params.toString();
  return `${path}${nextSearch ? `?${nextSearch}` : ""}`;
}

interface VideoMusicDraft {
  title: string;
  artist: string;
  album: string;
  sourceUrl: string;
  musicUrl: string;
  atmospheres: string;
}

function buildDraft(item: VideoMusicDto): VideoMusicDraft {
  return {
    title: item.title,
    artist: item.artist ?? "",
    album: item.album ?? "",
    sourceUrl: item.sourceUrl ?? "",
    musicUrl: item.musicUrl ?? "",
    atmospheres: (item.atmospheres ?? []).join(","),
  };
}

export const MusicLibrary: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAppStore((state) => state.token);
  const currentUser = useAppStore((state) => state.currentUser);
  const [items, setItems] = useState<VideoMusicDto[]>([]);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingMusicId, setEditingMusicId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, VideoMusicDraft>>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadAlbum, setUploadAlbum] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualMusicUrl, setManualMusicUrl] = useState("");
  const [manualArtist, setManualArtist] = useState("");
  const [manualAlbum, setManualAlbum] = useState("");
  const [manualAtmospheres, setManualAtmospheres] = useState("");
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  // 单例播放：同一时刻只允许一首音乐播放
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnTo = String(params.get("returnTo") ?? "").trim();
  const selectedMusicId = String(params.get("selectedMusicId") ?? "").trim() || null;
  const openedFromStep5 = params.get("from") === "step5";

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter((item) =>
      `${item.title} ${item.artist ?? ""} ${item.album ?? ""} ${(item.atmospheres ?? []).join(" ")}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [items, search]);

  // 分页计算
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // 搜索变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const refreshLibrary = useCallback(async () => {
    if (!token) {
      return;
    }
    const response = await backendApi.listVideoMusic(token, {});
    setEnabled(response.enabled);
    setItems(response.items);
    setDrafts(Object.fromEntries(response.items.map((item) => [item.id, buildDraft(item)])));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void (async () => {
      try {
        setIsLoading(true);
        setFeedback(null);
        await refreshLibrary();
      } catch (error) {
        setFeedback(error instanceof ApiError ? error.message : "音乐列表加载失败");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshLibrary, token]);

  const handleSync = async () => {
    if (!token) {
      return;
    }
    try {
      setIsSyncing(true);
      setFeedback(null);
      const result = await backendApi.syncVideoMusic(token);
      setItems(result.items);
      setDrafts(Object.fromEntries(result.items.map((item) => [item.id, buildDraft(item)])));
      setFeedback(
        result.failed.length > 0
          ? `同步完成，新增 ${result.added} 首，跳过 ${result.skipped} 首，失败 ${result.failed.length} 首。`
          : `同步完成，新增 ${result.added} 首，跳过 ${result.skipped} 首。`,
      );
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "远端音乐同步失败");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAnalyze = async (musicIds?: string[]) => {
    if (!token) {
      return;
    }
    try {
      setIsAnalyzing(true);
      setFeedback(null);
      await backendApi.analyzeVideoMusicAtmosphere(token, musicIds ? { musicIds } : {});
      await refreshLibrary();
      setFeedback(musicIds?.length ? "已重新识别所选音乐的氛围标签。" : "已重新识别全部音乐的氛围标签。");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "音乐氛围识别失败");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpload = async () => {
    if (!token || !uploadFile) {
      return;
    }
    try {
      setIsUploading(true);
      setFeedback(null);
      await backendApi.uploadVideoMusic(token, {
        file: uploadFile,
        title: uploadTitle || null,
        artist: uploadArtist || null,
        album: uploadAlbum || null,
      });
      setUploadFile(null);
      setUploadTitle("");
      setUploadArtist("");
      setUploadAlbum("");
      await refreshLibrary();
      setFeedback("音乐上传完成，已经加入当前音乐库。");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "音乐上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateManual = async () => {
    if (!token) {
      return;
    }
    try {
      setIsCreatingManual(true);
      setFeedback(null);
      await backendApi.createVideoMusic(token, {
        title: manualTitle.trim(),
        musicUrl: manualMusicUrl.trim(),
        artist: manualArtist.trim() || null,
        album: manualAlbum.trim() || null,
        atmospheres: manualAtmospheres
          .split(/[,，]/u)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      });
      setManualTitle("");
      setManualMusicUrl("");
      setManualArtist("");
      setManualAlbum("");
      setManualAtmospheres("");
      await refreshLibrary();
      setFeedback("外部音乐链接已加入当前音乐库。");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "新增外部音乐失败");
    } finally {
      setIsCreatingManual(false);
    }
  };

  const handleSaveDraft = async (musicId: string) => {
    if (!token) {
      return;
    }
    const draft = drafts[musicId];
    if (!draft) {
      return;
    }
    try {
      setFeedback(null);
      const updated = await backendApi.updateVideoMusic(token, musicId, {
        title: draft.title.trim(),
        artist: draft.artist.trim() || null,
        album: draft.album.trim() || null,
        sourceUrl: draft.sourceUrl.trim() || null,
        musicUrl: draft.musicUrl.trim(),
        atmospheres: draft.atmospheres
          .split(/[,，]/u)
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
      });
      setItems((current) => current.map((item) => (item.id === musicId ? updated : item)));
      setDrafts((current) => ({ ...current, [musicId]: buildDraft(updated) }));
      setEditingMusicId(null);
      setFeedback(`已保存《${updated.title}》的音乐信息。`);
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "保存音乐信息失败");
    }
  };

  const handleReturn = (musicId?: string | null) => {
    const target = appendSelectedMusicToReturnPath(returnTo || "/create/step5", musicId ?? null);
    navigate(target);
  };

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
            <div className="rounded-[28px] border border-[#e5d3bd] bg-white px-6 py-6 shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ee8f12]">Music Hub</p>
                  <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">音乐库维护</h1>
                  <p className="mt-2 max-w-3xl text-sm text-[#64748b]">
                    支持远端同步、本地上传、外链入库、氛围标签识别和曲目编辑，最后可以直接把选中的歌带回
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {openedFromStep5 ? (
                    <Button
                      variant="secondary"
                      className="rounded-full border border-[#e5d3bd] bg-white px-5 py-3 text-[#0f172a]"
                      onClick={() => handleReturn(selectedMusicId)}
                    >
                      返回 Step5
                    </Button>
                  ) : null}
                  {currentUser?.role === "admin" ? (
                    <Button onClick={() => void handleSync()} className="rounded-full px-5 py-3" disabled={isSyncing || !token}>
                      {isSyncing ? "同步中…" : "同步远端曲库"}
                    </Button>
                  ) : null}
                  {/* <Button
                    variant="secondary"
                    className="rounded-full border border-[#e5d3bd] bg-white px-5 py-3 text-[#0f172a]"
                    onClick={() => void handleAnalyze()}
                    disabled={isAnalyzing || !token}
                  >
                    {isAnalyzing ? "识别中…" : "重算全部标签"}
                  </Button> */}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#9a5a13]">
                <span className="rounded-full bg-[#fff8ef] px-4 py-2">当前状态：{enabled === false ? "已关闭" : enabled === true ? "已启用" : "加载中"}</span>
                {selectedMusicId ? <span className="rounded-full bg-[#fff8ef] px-4 py-2">当前从 Step5 带入曲目：{selectedMusicId}</span> : null}
              </div>
              {feedback ? <p className="mt-4 rounded-xl border border-[#f3d3a8] bg-[#fff7ed] px-4 py-3 text-sm text-[#9a3412]">{feedback}</p> : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr] items-stretch">
              {/* 左侧：音乐列表 */}
              <div className="rounded-[28px] border border-[#e5d3bd] bg-white px-6 py-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)] flex flex-col">
                <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-[#0f172a]">音乐库列表</h2>
                      <p className="mt-1 text-sm text-[#64748b]">这里维护的曲库会直接成为 合并 的手动选歌和自动推荐来源。</p>
                    </div>
                    <input
                      type="text"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索标题、艺术家、标签"
                      className="w-full max-w-[240px] rounded-full border border-[#e5d3bd] bg-[#fffdf9] px-4 py-2 text-sm outline-none transition focus:border-[#ee8f12] focus:ring-2 focus:ring-[#ffe7c2]"
                    />
                  </div>
                  {/* 列表容器：flex-1 匹配右侧高度 */}
                  <div className="mt-5 flex-1 overflow-y-auto rounded-[20px] border border-[#efe6d8] bg-[#fffdf9] p-4">
                {isLoading ? (
                  <p className="py-8 text-center text-sm text-[#64748b]">正在加载音乐库…</p>
                ) : paginatedItems.length > 0 ? (
                  <div className="space-y-4">
                  {paginatedItems.map((item) => {
                    const draft = drafts[item.id] ?? buildDraft(item);
                    const isEditing = editingMusicId === item.id;
                    const atmospheres = isEditing
                      ? draft.atmospheres.split(/[,，]/u).map((entry) => entry.trim()).filter((entry) => entry.length > 0)
                      : item.atmospheres ?? [];
                    return (
                      <div key={item.id} className="rounded-[16px] border border-[#efe6d8] bg-white px-5 py-4">
                        {isEditing ? (
                          /* 编辑模式：展开表单 */
                          <div className="grid gap-3 md:grid-cols-2">
                            <input
                              value={draft.title}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.id]: { ...draft, title: event.target.value },
                                }))
                              }
                              className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none"
                              placeholder="标题"
                            />
                            <input
                              value={draft.artist}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.id]: { ...draft, artist: event.target.value },
                                }))
                              }
                              className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none"
                              placeholder="艺术家"
                            />
                            <input
                              value={draft.album}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.id]: { ...draft, album: event.target.value },
                                }))
                              }
                              className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none"
                              placeholder="专辑"
                            />
                            <input
                              value={draft.atmospheres}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.id]: { ...draft, atmospheres: event.target.value },
                                }))
                              }
                              className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none"
                              placeholder="标签，逗号分隔"
                            />
                            <input
                              value={draft.musicUrl}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [item.id]: { ...draft, musicUrl: event.target.value },
                                }))
                              }
                              className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none md:col-span-2"
                              placeholder="音乐地址"
                            />
                            <div className="flex gap-2 md:col-span-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="rounded-full border border-[#e5d3bd] bg-white px-4 py-2 text-xs text-[#0f172a]"
                                onClick={() => {
                                  setDrafts((current) => ({ ...current, [item.id]: buildDraft(item) }));
                                  setEditingMusicId(null);
                                }}
                              >
                                取消
                              </Button>
                              <Button
                                size="sm"
                                className="rounded-full px-4 py-2 text-xs"
                                onClick={() => void handleSaveDraft(item.id)}
                              >
                                保存
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* 正常模式：上下布局，播放器独占一行 */
                          <div className="space-y-3">
                            {/* 第一行：标题/标签 + 操作按钮 */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-semibold text-[#0f172a] truncate">{item.title}</p>
                                <p className="mt-0.5 text-xs text-[#64748b] truncate">
                                  {[item.artist, item.album].filter(Boolean).join(" · ") || "未填写艺人信息"}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {atmospheres.slice(0, 5).map((atmosphere) => (
                                    <span key={`${item.id}-${atmosphere}`} className="rounded-full bg-[#fff1dd] px-2.5 py-0.5 text-[11px] font-semibold text-[#b46315]">
                                      #{atmosphere}
                                    </span>
                                  ))}
                                  {atmospheres.length > 5 && (
                                    <span className="text-[11px] text-[#94a3b8]">+{atmospheres.length - 5}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {openedFromStep5 && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleReturn(item.id)}
                                    className="rounded-full px-3 py-1.5 text-xs"
                                  >
                                    选用
                                  </Button>
                                )}
                              </div>
                            </div>
                            {/* 第二行：播放器独占整行，单例播放 */}
                            <audio
                              controls
                              src={item.musicUrl}
                              className="w-full h-[40px]"
                              onPlay={(event) => {
                                // 单例播放：暂停上一首，记录当前
                                if (activeAudioRef.current && activeAudioRef.current !== event.currentTarget) {
                                  activeAudioRef.current.pause();
                                }
                                activeAudioRef.current = event.currentTarget;
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-[#64748b]">当前没有可展示的音乐。</p>
                )}
                  </div>
                  {/* 分页组件 */}
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full border border-[#e5d3bd] bg-white px-3 py-1.5 text-xs text-[#0f172a]"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        上一页
                      </Button>
                      <div className="flex gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                                currentPage === pageNum
                                  ? "bg-[#ee8f12] text-white"
                                  : "border border-[#e5d3bd] bg-white text-[#0f172a] hover:bg-[#fff1dd]"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-full border border-[#e5d3bd] bg-white px-3 py-1.5 text-xs text-[#0f172a]"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                      >
                        下一页
                      </Button>
                      <span className="text-xs text-[#64748b] ml-2">
                        共 {filteredItems.length} 首
                      </span>
                    </div>
                  )}
                </div>

              {/* 右侧：上传与外链 */}
              <div className="space-y-6">
                <div className="rounded-[28px] border border-[#e5d3bd] bg-white px-6 py-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
                  <h2 className="text-xl font-bold text-[#0f172a]">上传本地音乐</h2>
              <p className="mt-1 text-sm text-[#64748b]">把你自己的音频直接上传进当前曲库，Step5 会立刻可见。</p>
              <input
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.flac,audio/*"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                className="mt-4 block w-full text-sm text-[#475569]"
              />
              <div className="mt-4 grid gap-3">
                <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="标题（可选）" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
                <input value={uploadArtist} onChange={(event) => setUploadArtist(event.target.value)} placeholder="艺术家（可选）" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
                <input value={uploadAlbum} onChange={(event) => setUploadAlbum(event.target.value)} placeholder="专辑（可选）" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
              </div>
                <Button onClick={() => void handleUpload()} className="mt-4 w-full rounded-full py-3" disabled={isUploading || !uploadFile || !token}>
                  {isUploading ? "上传中…" : "上传到音乐库"}
                </Button>
                </div>

                <div className="rounded-[28px] border border-[#e5d3bd] bg-white px-6 py-6 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
                  <h2 className="text-xl font-bold text-[#0f172a]">外部链接入库</h2>
                  <p className="mt-1 text-sm text-[#64748b]">如果你已经有可访问的音频链接，也可以直接录入，不必重新上传。</p>
                  <div className="mt-4 grid gap-3">
                    <input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="标题" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
                    <input value={manualMusicUrl} onChange={(event) => setManualMusicUrl(event.target.value)} placeholder="音乐地址" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
                    <input value={manualArtist} onChange={(event) => setManualArtist(event.target.value)} placeholder="艺术家（可选）" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
                    <input value={manualAlbum} onChange={(event) => setManualAlbum(event.target.value)} placeholder="专辑（可选）" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
                    <input value={manualAtmospheres} onChange={(event) => setManualAtmospheres(event.target.value)} placeholder="标签（可选，逗号分隔）" className="rounded-xl border border-[#e5d3bd] bg-[#fffdf9] px-4 py-3 text-sm outline-none" />
                  </div>
                  <Button onClick={() => void handleCreateManual()} className="mt-4 w-full rounded-full py-3" disabled={isCreatingManual || !manualTitle.trim() || !manualMusicUrl.trim() || !token}>
                    {isCreatingManual ? "保存中…" : "加入音乐库"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
</Layout>
  );
};
