import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { realBackendApi } from "../../services/realApi";
import type { Announcement, AnnouncementStatus } from "../../../../src/contracts/announcement-contract";

type DraftMode = "create" | "edit";

interface AnnouncementDraft {
  title: string;
  content: string;
  status: AnnouncementStatus;
  sortOrder: number;
}

const STATUS_OPTIONS: Array<{ value: AnnouncementStatus; label: string; color: string }> = [
  { value: "draft", label: "草稿", color: "bg-gray-100 text-gray-700" },
  { value: "published", label: "已发布", color: "bg-green-100 text-green-700" },
  { value: "archived", label: "已归档", color: "bg-yellow-100 text-yellow-700" },
];

const DEFAULT_DRAFT: AnnouncementDraft = {
  title: "",
  content: "",
  status: "draft",
  sortOrder: 0,
};

export const AnnouncementManagement: React.FC = () => {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const canAccess = currentUser?.role === "admin" && Boolean(token);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<AnnouncementDraft>({ ...DEFAULT_DRAFT });
  const [draftMode, setDraftMode] = useState<DraftMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showEditor, setShowEditor] = useState(false);

  // 加载公告列表
  const announcementsQuery = useQuery({
    queryKey: ["admin-announcements", token],
    enabled: canAccess,
    queryFn: async () => realBackendApi.listAdminAnnouncements(token as string),
    retry: false,
  });

  // 同步列表数据到本地 state
  useEffect(() => {
    if (announcementsQuery.data) {
      // refetch is handled by queryClient
    }
  }, [announcementsQuery.data]);

  const openCreateEditor = () => {
    setDraft({ ...DEFAULT_DRAFT });
    setEditingId(null);
    setDraftMode("create");
    setFeedback("");
    setShowEditor(true);
  };

  const openEditEditor = (item: Announcement) => {
    setDraft({
      title: item.title,
      content: item.content,
      status: item.status,
      sortOrder: item.sortOrder,
    });
    setEditingId(item.id);
    setDraftMode("edit");
    setFeedback("");
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!token || !draft.title.trim() || !draft.content.trim()) {
      setFeedback("标题和内容为必填项");
      return;
    }
    setFeedback("");

    try {
      if (draftMode === "create" || !editingId) {
        await realBackendApi.createAnnouncement(token, draft);
        setFeedback("公告已创建");
      } else {
        await realBackendApi.updateAnnouncement(token, editingId, draft);
        setFeedback("公告已更新");
      }
      closeEditor();
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "操作失败";
      setFeedback(message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    if (!confirm("确认删除此公告？此操作不可恢复。")) return;
    setFeedback("");

    try {
      await realBackendApi.deleteAnnouncement(token, id);
      setFeedback("公告已删除");
      await queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "删除失败";
      setFeedback(message);
    }
  };

  if (!canAccess) {
    return (
      <>
        <div className="flex h-full items-center justify-center bg-[#f8fafc] p-6 md:p-8">
          <div className="mx-auto max-w-3xl border border-red-100 bg-white p-6 text-red-700">
            此页面仅管理员可访问。
          </div>
        </div>
      </>
    );
  }

  const items = announcementsQuery.data?.items ?? [];

  return (
    <>
      <div className="flex h-full flex-col bg-[#f8fafc]" data-testid="announcement-management-page">
        {/* Header */}
        <section className="border-b border-[#e2e8f0] bg-white px-8 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#0f172a] font-display">公告管理</h1>
              <p className="mt-1 text-sm text-[#64748b]">管理系统公告的创建、编辑与发布状态</p>
            </div>
            <Button data-testid="announcement-create-button" onClick={openCreateEditor}>
              <span className="material-icons-round text-sm mr-1">add</span>
              新建公告
            </Button>
          </div>
        </section>

        {/* Feedback */}
        {feedback && (
          <div className="mx-8 mt-4 border border-[#f3d3a8] bg-[#fff7ed] px-4 py-3 text-sm text-[#9a3412]">
            {feedback}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {announcementsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">加载中...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="material-icons-round text-4xl mb-2">campaign</span>
              <span className="text-sm">暂无公告，点击上方「新建公告」创建</span>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const statusOption = STATUS_OPTIONS.find((o) => o.value === item.status);
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusOption?.color ?? ""}`}>
                            {statusOption?.label ?? item.status}
                          </span>
                          <h3 className="text-base font-bold text-gray-900 truncate">{item.title}</h3>
                        </div>
                        <p className="text-sm text-gray-500 whitespace-pre-wrap line-clamp-2 mb-2">{item.content}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <span>排序：{item.sortOrder}</span>
                          {item.publishedAt && (
                            <span>发布：{new Date(item.publishedAt).toLocaleString("zh-CN")}</span>
                          )}
                          <span>更新：{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => openEditEditor(item)}
                          className="h-8 w-8 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-500"
                          title="编辑"
                        >
                          <span className="material-icons-round text-lg">edit</span>
                        </button>
                        <button
                          onClick={() => void handleDelete(item.id)}
                          className="h-8 w-8 rounded-md border border-red-200 bg-white hover:bg-red-50 flex items-center justify-center text-red-500"
                          title="删除"
                        >
                          <span className="material-icons-round text-lg">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor Modal */}
        {showEditor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-xl mx-4 bg-white rounded-xl shadow-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  {draftMode === "create" ? "新建公告" : "编辑公告"}
                </h2>
                <button onClick={closeEditor} className="text-gray-400 hover:text-gray-600">
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="公告标题"
                  />
                </div>

                {/* Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                  <textarea
                    value={draft.content}
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                    rows={5}
                    className="w-full px-3 py-2 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    placeholder="公告内容"
                  />
                </div>

                {/* Status & Sort Order */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                    <select
                      value={draft.status}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value as AnnouncementStatus })}
                      className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="block text-sm font-medium text-gray-700 mb-1">排序</label>
                    <input
                      type="number"
                      value={draft.sortOrder}
                      onChange={(e) => setDraft({ ...draft, sortOrder: parseInt(e.target.value, 10) || 0 })}
                      className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
                <Button variant="secondary" onClick={closeEditor}>取消</Button>
                <Button onClick={() => void handleSave()}>保存</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
