/**
 * MigrateProjectModal.tsx - 项目迁移弹窗组件
 *
 * 功能：
 * 1. 显示迁移预览（表结构检查、数据量统计）
 * 2. 执行迁移并显示结果
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { backendApi } from '../../services/backendApi';
import type { MigratePreviewResponse, MigrateExecuteResponse } from '../../services/backendApi.types';

interface MigrateProjectModalProps {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  projectKind: string;
  onClose: () => void;
}

export const MigrateProjectModal: React.FC<MigrateProjectModalProps> = ({
  isOpen,
  projectId,
  projectName,
  projectKind,
  onClose,
}) => {
  const { token } = useAppStore(useShallow((state) => ({ token: state.token })));
  const [preview, setPreview] = useState<MigratePreviewResponse | null>(null);
  const [result, setResult] = useState<MigrateExecuteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载预览数据
  useEffect(() => {
    if (!isOpen || !token) return;

    const loadPreview = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await backendApi.migrateProjectPreview(token, projectId);
        setPreview(response.data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreview();
  }, [isOpen, token, projectId]);

  // 执行迁移
  const handleMigrate = async () => {
    if (!token) return;
    setIsMigrating(true);
    setError(null);
    try {
      const response = await backendApi.migrateProjectExecute(token, projectId);
      setResult(response.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsMigrating(false);
    }
  };

  if (!isOpen) return null;

  const getProjectKindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      video: '视频项目',
      image: '图片项目',
      reverse: '反推项目',
      outfit_change: '换装项目',
    };
    return labels[kind] || kind;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">迁移项目到正式库</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <span className="material-icons-round text-gray-500">close</span>
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* 项目信息 */}
          <div className="mb-4 text-sm text-gray-600">
            项目：<span className="font-medium text-gray-900">{projectName}</span>
            <span className="mx-2">|</span>
            类型：<span className="font-medium text-gray-900">{getProjectKindLabel(projectKind)}</span>
          </div>

          {/* 加载状态 */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <span className="material-icons-round text-4xl animate-spin text-primary">refresh</span>
              <p className="mt-3 text-gray-500">加载预览数据...</p>
            </div>
          )}

          {/* 错误状态 */}
          {error && !isLoading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-600">
                <span className="material-icons-round">error</span>
                <span className="font-medium">加载失败</span>
              </div>
              <p className="mt-2 text-sm text-red-500">{error}</p>
            </div>
          )}

          {/* 预览内容 */}
          {preview && !isLoading && !result && (
            <div className="space-y-4">
              {/* 表结构检查 */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  {preview.structureCheck.status === 'ok' ? (
                    <>
                      <span className="material-icons-round text-green-500">check_circle</span>
                      <span className="font-medium text-gray-900">表结构检查：全部一致</span>
                      <span className="text-sm text-gray-500">({preview.tables.length} 张表)</span>
                    </>
                  ) : (
                    <>
                      <span className="material-icons-round text-amber-500">warning</span>
                      <span className="font-medium text-gray-900">表结构检查：存在差异</span>
                    </>
                  )}
                </div>
                {preview.structureCheck.status === 'warning' && (
                  <div className="bg-white rounded-lg border border-amber-200 p-3 space-y-1">
                    {preview.structureCheck.details.map((item, idx) => (
                      <div key={idx} className="text-sm text-amber-700">
                        {item.table}: {item.issue}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 数据量统计 */}
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="font-medium text-gray-900 mb-3">数据量统计</div>
                <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto">
                  {preview.tables.map((table, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-mono text-gray-600">{table.tableName}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-900">{table.sourceCount} 条</span>
                        {table.existsCount > 0 && (
                          <span className="text-amber-600">(已存在 {table.existsCount} 条)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-sm font-medium">
                  <span className="text-gray-600">总计</span>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-900">{preview.totalSource} 条</span>
                    <span className="text-primary">
                      新增 {preview.totalToInsert} 条
                      {preview.totalExists > 0 && `，跳过 ${preview.totalExists} 条`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 迁移结果 */}
          {result && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-green-600">
                  <span className="material-icons-round">check_circle</span>
                  <span className="font-medium">迁移完成</span>
                </div>
                <div className="mt-3 text-sm text-green-700">
                  新增 {result.inserted} 条，跳过 {result.skipped} 条
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="font-medium text-gray-900 mb-3">详细结果</div>
                <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {result.details.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-mono text-gray-600">{item.tableName}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-green-600">+{item.inserted}</span>
                        {item.skipped > 0 && (
                          <span className="text-amber-600">跳过 {item.skipped}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium"
            disabled={isMigrating}
          >
            {result ? '关闭' : '取消'}
          </button>
          {!result && preview && (
            <button
              onClick={handleMigrate}
              disabled={isMigrating || preview.totalToInsert === 0}
              className="px-4 py-2 bg-primary text-white rounded-xl hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
            >
              {isMigrating ? (
                <>
                  <span className="material-icons-round text-sm animate-spin">refresh</span>
                  迁移中...
                </>
              ) : (
                <>确认迁移</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MigrateProjectModal;
