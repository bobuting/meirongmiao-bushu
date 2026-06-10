import React from "react";
import { Step6FissionScreen } from "./Step6FissionScreen";

/**
 * Step 6 路由组件
 * 在项目流程布局内渲染裂变页面
 * ProjectLayout 和 ProjectFlowKindRouteGuard 已负责项目校验，此处无需重复检查
 */
export const Step6FissionRoute: React.FC = () => {
  return <Step6FissionScreen />;
};