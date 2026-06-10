/**
 * 裂变功能页面 - 带左侧菜单布局
 * 用于独立访问 /fission 路由，保留左侧菜单导航
 */

import React from 'react';
import { Layout } from '../../components/Layout';
import { Step6FissionScreen } from '../project-flow/step6-fission/Step6FissionScreen';

export const FissionScreenWithLayout: React.FC = () => {
  return (
    <Layout>
      <Step6FissionScreen />
    </Layout>
  );
};
