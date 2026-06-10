import React from "react";

interface AttachmentIconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  variant?: "floating" | "embedded";
}

export const AttachmentIconButton: React.FC<AttachmentIconButtonProps> = ({
  onClick,
  disabled = false,
  title = "上传附件",
  className,
  variant = "floating",
}) => {
  const baseClassName =
    variant === "embedded"
      ? "flex h-full min-h-[50px] w-12 shrink-0 items-center justify-center border-l border-gray-200 bg-transparent text-gray-500 transition-all hover:bg-gray-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
      : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:border-primary/40 hover:text-primary hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={[
        baseClassName,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="material-icons-round text-[22px]">attach_file</span>
    </button>
  );
};
