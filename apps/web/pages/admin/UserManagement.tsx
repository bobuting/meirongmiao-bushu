/**
 * 用户管理页面
 *
 * 独立于审核管理的用户管理面板，包含：
 * 1. 用户列表（CRUD、锁定/解锁、积分调整）
 * 2. 批量导入/导出
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { ApiError, backendApi } from "../../services/backendApi";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { UserFormModal, type UserFormData } from "./UserFormModal";
import { CreditAdjustModal } from "./CreditAdjustModal";
import { displayName, downloadJson, parseImportJson } from "../review-admin/review-dashboard-utils";

export const UserManagement: React.FC = () => {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const { confirm } = useConfirm();
  const canAccess = currentUser?.role === "admin" && Boolean(token);

  const [feedback, setFeedback] = useState<string | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUserData, setEditingUserData] = useState<{
    id: string;
    email: string;
    role: "admin" | "user";
    companyName?: string;
  } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("[");
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAdjustUser, setCreditAdjustUser] = useState<{
    id: string;
    email: string;
    balance: number;
  } | null>(null);

  const usersQuery = useQuery({
    queryKey: ["admin-users", token],
    enabled: canAccess,
    queryFn: async () => backendApi.adminUsers(token as string),
  });

  const users = usersQuery.data?.users ?? [];

  // 新增用户
  const openCreateModal = () => {
    setEditingUserId(null);
    setEditingUserData(null);
    setUserModalOpen(true);
  };

  // 编辑用户
  const openEditModal = (user: { id: string; email: string; role: "admin" | "user"; companyName?: string }) => {
    setEditingUserId(user.id);
    setEditingUserData(user);
    setUserModalOpen(true);
  };

  // 关闭弹窗
  const closeModal = () => {
    setUserModalOpen(false);
    setEditingUserId(null);
    setEditingUserData(null);
  };

  // 打开积分调整弹窗
  const openCreditModal = (user: { id: string; email: string; creditBalance: number }) => {
    setCreditAdjustUser({ id: user.id, email: user.email, balance: user.creditBalance });
    setCreditModalOpen(true);
  };

  // 关闭积分调整弹窗
  const closeCreditModal = () => {
    setCreditModalOpen(false);
    setCreditAdjustUser(null);
  };

  // 提交积分调整
  const handleCreditAdjust = async (delta: number, reason: string) => {
    if (!token) return;
    await backendApi.adminAdjustUserCredits(token, creditAdjustUser!.id, { delta, reason });
    await usersQuery.refetch();
    setFeedback(`积分已调整：${delta > 0 ? "+" : ""}${delta}`);
  };

  // 提交用户表单
  const handleFormSubmit = async (data: UserFormData) => {
    if (!token) return;
    try {
      if (editingUserId) {
        const payload: Partial<UserFormData> = {
          email: data.email.trim(),
          role: data.role,
          companyName: data.companyName?.trim() || undefined,
        };
        if (data.password && data.password.trim().length > 0) {
          payload.password = data.password.trim();
        }
        await backendApi.adminUpdateUser(token, editingUserId, payload);
        setFeedback("用户信息已更新");
      } else {
        await backendApi.adminCreateUser(token, {
          email: data.email,
          password: data.password,
          role: data.role,
          companyName: data.companyName?.trim() || undefined,
          initialCredits: data.initialCredits ? parseInt(String(data.initialCredits), 10) : undefined,
        });
        setFeedback("用户已新增");
      }
      await usersQuery.refetch();
      closeModal();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : editingUserId ? "修改用户失败" : "新增用户失败";
      setFeedback(message);
      throw error;
    }
  };

  // 删除用户
  const handleDelete = async (userId: string) => {
    if (!token) return;
    const confirmed = await confirm("确认删除该用户？", "删除确认");
    if (!confirmed) return;
    try {
      await backendApi.adminDeleteUser(token, userId);
      await usersQuery.refetch();
      setFeedback("用户已删除");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "删除用户失败");
    }
  };

  // 导入用户
  const handleImport = async () => {
    if (!token) return;
    try {
      const items = parseImportJson<Array<{ email: string; password: string; role?: "admin" | "user" }>[number]>(
        importText,
        "items",
      );
      const normalized: Array<{ email: string; password: string; role: "admin" | "user" }> = [];
      for (const item of items) {
        const email = String(item.email ?? "").trim();
        const password = String(item.password ?? "").trim();
        if (!email || !password) continue;
        const role: "admin" | "user" = item.role === "admin" ? "admin" : "user";
        normalized.push({ email, password, role });
      }
      const result = await backendApi.adminImportUsers(token, { items: normalized });
      await usersQuery.refetch();
      setFeedback(`导入完成：成功 ${result.created.length}，失败 ${result.failed.length}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "导入用户失败");
    }
  };

  // 导出用户
  const handleExport = async () => {
    if (!token) return;
    try {
      const result = await backendApi.adminExportUsers(token);
      downloadJson(`users-export-${Date.now()}.json`, result);
      setFeedback("用户数据已导出");
    } catch (error) {
      setFeedback(error instanceof ApiError ? error.message : "导出用户失败");
    }
  };

  if (!canAccess) {
    return <div className="flex h-full items-center justify-center text-gray-600">只有管理员可以访问此页面。</div>;
  }

  return (
    <div className="flex h-full flex-col bg-[#f8f9fc]">
      {/* 页头 */}
      <div className="border-b border-gray-200 bg-white px-8 py-6">
        <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
        <p className="mt-1 text-sm text-gray-500">用户账户的增删改查、积分调整与批量操作</p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl space-y-4">
          {/* 反馈 */}
          {feedback ? (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800">{feedback}</div>
          ) : null}

          {/* 操作栏 */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openCreateModal}>+ 新增用户</Button>
            <Button variant="secondary" onClick={() => setShowImport((v) => !v)}>
              批量导入(JSON)
            </Button>
            <Button variant="secondary" onClick={() => void handleExport()}>
              导出用户
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => void usersQuery.refetch()} isLoading={usersQuery.isFetching}>
              刷新
            </Button>
          </div>

          {/* 批量导入区 */}
          {showImport ? (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-2 text-sm font-bold text-gray-900">批量导入用户</h2>
              <p className="mb-3 text-xs text-gray-500">
                支持 JSON 数组或 {`{items:[...]}`}，字段：email / password / role
              </p>
              <textarea
                className="h-40 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-primary"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <div className="mt-3 flex justify-end">
                <Button onClick={() => void handleImport()}>执行导入</Button>
              </div>
            </section>
          ) : null}

          {/* 用户表格 */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">用户名</th>
                  <th className="px-4 py-3">邮箱</th>
                  <th className="px-4 py-3 min-w-[200px]">公司</th>
                  <th className="px-4 py-3">角色</th>
                  <th className="px-4 py-3">积分</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const locked = Boolean(user.lockUntil && user.lockUntil > Date.now());
                  return (
                    <tr key={user.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">{displayName(user.email)}</td>
                      <td className="px-4 py-3 text-gray-700">{user.email}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[300px] truncate" title={user.companyName || "-"}>{user.companyName || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-900">{user.creditBalance}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-2 ${locked ? "text-red-600" : "text-green-600"}`}>
                          <span className={`h-2 w-2 rounded-full ${locked ? "bg-red-500" : "bg-green-500"}`} />
                          {locked ? "Locked" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right min-w-[240px]">
                        <div className="inline-flex gap-1 flex-wrap justify-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="!px-2 !py-1 !text-xs whitespace-nowrap"
                            onClick={() => openCreditModal(user)}
                          >
                            积分
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="!px-2 !py-1 !text-xs whitespace-nowrap"
                            onClick={() =>
                              void backendApi
                                .adminSetUserLock(token as string, user.id, !locked)
                                .then(() => usersQuery.refetch())
                            }
                          >
                            {locked ? "解锁" : "锁定"}
                          </Button>
                          <Button variant="secondary" size="sm" className="!px-2 !py-1 !text-xs whitespace-nowrap" onClick={() => openEditModal(user)}>编辑</Button>
                          <Button variant="secondary" size="sm" className="!px-2 !py-1 !text-xs whitespace-nowrap" onClick={() => void handleDelete(user.id)}>删除</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {users.length < 1 ? (
              <div className="border-t border-gray-100 px-4 py-8 text-sm text-gray-500 text-center">暂无用户数据</div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 用户表单弹窗 */}
      <UserFormModal
        open={userModalOpen}
        user={editingUserData}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
        isLoading={false}
      />

      {/* 积分调整弹窗 */}
      {creditAdjustUser && (
        <CreditAdjustModal
          open={creditModalOpen}
          userId={creditAdjustUser.id}
          userEmail={creditAdjustUser.email}
          currentBalance={creditAdjustUser.balance}
          onClose={closeCreditModal}
          onSubmit={handleCreditAdjust}
        />
      )}
    </div>
  );
};
