import { Component, type ErrorInfo, type ReactNode } from "react";

interface ProjectFlowRouteBoundaryProps {
  screenLabel: string;
  recoveryPath: string;
  previousPath?: string;
  children: ReactNode;
}

interface ProjectFlowRouteBoundaryState {
  error: Error | null;
}

export class ProjectFlowRouteBoundary extends Component<ProjectFlowRouteBoundaryProps, ProjectFlowRouteBoundaryState> {
  public readonly state: ProjectFlowRouteBoundaryState = {
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ProjectFlowRouteBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[project-flow-boundary] ${this.props.screenLabel}`, error, info);
  }

  public componentDidUpdate(prevProps: ProjectFlowRouteBoundaryProps): void {
    if (prevProps.screenLabel !== this.props.screenLabel && this.state.error) {
      this.setState({ error: null });
    }
  }

  private navigateTo(path: string): void {
    if (!path.trim()) {
      return;
    }
    window.location.assign(path);
  }

  public render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const errorMessage = this.state.error.message?.trim() || "页面渲染失败";

    return (
      <div className="flex h-full items-center justify-center p-6 md:p-8">
        <div className="w-full max-w-2xl rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-red-500">Project Flow Guardrail</div>
          <h2 className="mt-2 text-xl font-bold text-gray-900">{this.props.screenLabel} 渲染失败</h2>
          <p className="mt-2 text-sm text-gray-600">
            这一步已被页面级护栏拦截，避免整页白屏。可以直接刷新当前页，或先回退到稳定步骤继续。
          </p>
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-hover"
            >
              刷新当前页
            </button>
            {this.props.previousPath ? (
              <button
                type="button"
                onClick={() => this.navigateTo(this.props.previousPath!)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-primary/30 hover:text-primary"
              >
                回退一步
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => this.navigateTo(this.props.recoveryPath)}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-primary/30 hover:text-primary"
            >
              返回项目列表
            </button>
          </div>
        </div>
      </div>
    );
  }
}
