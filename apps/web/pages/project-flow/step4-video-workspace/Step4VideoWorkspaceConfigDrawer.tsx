import React from "react";

interface Step4VideoWorkspaceConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Step4VideoWorkspaceConfigDrawer: React.FC<Step4VideoWorkspaceConfigDrawerProps> = ({
  isOpen,
  onClose,
  children,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl animate-slide-up">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-4">
          <h3 className="font-display font-bold text-gray-900">任务状态 & 队列</h3>
          <button onClick={onClose} className="rounded-full bg-gray-100 p-2">
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
        <div className="p-6 pb-24">{children}</div>
      </div>
    </div>
  );
};
