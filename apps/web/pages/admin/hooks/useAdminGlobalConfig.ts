/**
 * 管理后台全局配置共享 Hook
 * 基础配置（ReviewDashboard）和积分管理（CreditManagement）共用
 */

import { useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { backendApi } from "../../../services/backendApi";
import {
  buildAdminGlobalSystemSettingsDraft,
  type AdminGlobalSystemSettingsDraft,
} from "../adminGlobalSystemSettingsPanel";
import { resolveAdminSystemSettingsErrorMessage } from "../adminSystemSettingsSurface";
import { buildResetGlobalSectionDraft } from "../../review-admin/review-dashboard-utils";

export function useAdminGlobalConfig() {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const canAccess = currentUser?.role === "admin" && Boolean(token);

  const [globalDraft, setGlobalDraft] = useState<AdminGlobalSystemSettingsDraft>(
    buildAdminGlobalSystemSettingsDraft(),
  );
  const [savingSectionId, setSavingSectionId] = useState<string | null>(null);
  const [savingGlobalAll, setSavingGlobalAll] = useState(false);
  const [refreshingGlobalAll, setRefreshingGlobalAll] = useState(false);
  const [feedback, setFeedback] = useState<string | undefined>();

  const configQuery = useQuery({
    queryKey: ["admin-config", token],
    enabled: canAccess,
    queryFn: async () => backendApi.adminConfigGet(token as string),
  });

  // 同步 configQuery 数据到 globalDraft
  useEffect(() => {
    if (!configQuery.data) return;
    setGlobalDraft(buildAdminGlobalSystemSettingsDraft(configQuery.data));
  }, [configQuery.data]);

  const persistGlobalDraft = useCallback(
    async (
      sectionId: string,
      nextDraft: AdminGlobalSystemSettingsDraft,
      successMessage = "系统参数已保存",
    ): Promise<void> => {
      if (!token || !canAccess) return;
      setSavingSectionId(sectionId);
      try {
        const response = await backendApi.adminConfigPatch(token, nextDraft);
        setGlobalDraft(buildAdminGlobalSystemSettingsDraft(response));
        setFeedback(successMessage);
        await configQuery.refetch();
      } catch (error) {
        setFeedback(resolveAdminSystemSettingsErrorMessage(error));
      } finally {
        setSavingSectionId(null);
      }
    },
    [token, canAccess, configQuery],
  );

  const saveGlobalSection = useCallback(
    async (sectionId: string): Promise<void> => {
      await persistGlobalDraft(sectionId, globalDraft, "系统参数已保存");
    },
    [persistGlobalDraft, globalDraft],
  );

  const resetGlobalSection = useCallback(
    async (sectionId: string): Promise<void> => {
      const nextDraft = buildResetGlobalSectionDraft(globalDraft, sectionId);
      setGlobalDraft(nextDraft);
      await persistGlobalDraft(sectionId, nextDraft, "系统参数已恢复默认");
    },
    [persistGlobalDraft, globalDraft],
  );

  const handleRefreshGlobalAll = useCallback(async (): Promise<void> => {
    if (!canAccess) return;
    setRefreshingGlobalAll(true);
    try {
      await configQuery.refetch();
      setFeedback("系统参数已刷新");
    } catch (error) {
      setFeedback(resolveAdminSystemSettingsErrorMessage(error));
    } finally {
      setRefreshingGlobalAll(false);
    }
  }, [canAccess, configQuery]);

  const handleSaveGlobalAll = useCallback(async (): Promise<void> => {
    if (!token || !canAccess) return;
    setSavingGlobalAll(true);
    try {
      const response = await backendApi.adminConfigPatch(token, globalDraft);
      setGlobalDraft(buildAdminGlobalSystemSettingsDraft(response));
      setFeedback("系统参数已保存");
      await configQuery.refetch();
    } catch (error) {
      setFeedback(resolveAdminSystemSettingsErrorMessage(error));
    } finally {
      setSavingGlobalAll(false);
    }
  }, [token, canAccess, configQuery, globalDraft]);

  return {
    canAccess,
    token: token as string,
    globalDraft,
    setGlobalDraft,
    configQuery,
    savingSectionId,
    savingGlobalAll,
    refreshingGlobalAll,
    feedback,
    setFeedback,
    saveGlobalSection,
    resetGlobalSection,
    handleRefreshGlobalAll,
    handleSaveGlobalAll,
  };
}
