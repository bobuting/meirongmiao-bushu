import { useNavigate } from 'react-router';
import { useAppStore } from '../../store/useAppStore';
import { clearProjectQueries } from '../../hooks/useProjectState';

/**
 * 项目不存在错误页面
 * 当项目被删除或用户无权限时显示
 */
export function ProjectNotFoundError() {
  const navigate = useNavigate();
  const activeProjectId = useAppStore((state) => state.activeProjectId);

  const handleReturnToList = () => {
    if (activeProjectId) {
      clearProjectQueries(activeProjectId);
      useAppStore.getState().clearProjectState(activeProjectId);
    }
    navigate('/projects');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50">
      <div className="max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
          <span className="material-icons-round text-3xl text-orange-500">warning</span>
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">项目不存在</h2>
        <p className="mb-6 text-gray-600">
          该项目已被删除或您没有访问权限
        </p>
        <button
          onClick={handleReturnToList}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-white font-medium hover:bg-primary/90 transition-colors"
        >
          返回项目列表
        </button>
      </div>
    </div>
  );
}
