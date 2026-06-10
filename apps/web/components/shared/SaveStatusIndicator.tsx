// apps/web/components/shared/SaveStatusIndicator.tsx
import { useAppStore } from '../../store/useAppStore';

/**
 * 保存状态指示器
 * 显示在页面右上角，展示保存状态
 */
export function SaveStatusIndicator() {
  const saveStatus = useAppStore((state) => state.saveStatus);

  if (saveStatus === 'idle') return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-md border border-gray-200">
      {saveStatus === 'saving' && (
        <>
          <span className="material-icons-round animate-spin text-gray-500">refresh</span>
          <span className="text-sm text-gray-600">保存中...</span>
        </>
      )}
      {saveStatus === 'saved' && (
        <>
          <span className="material-icons-round text-green-500">check_circle</span>
          <span className="text-sm text-green-600">已保存</span>
        </>
      )}
      {saveStatus === 'error' && (
        <>
          <span className="material-icons-round text-red-500">error</span>
          <span className="text-sm text-red-600">保存失败</span>
        </>
      )}
    </div>
  );
}