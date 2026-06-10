import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

/**
 * 前端组件测试示例
 * 验证 Vitest + React Testing Library 配置正确
 */
describe('前端测试配置验证', () => {
  it('Vitest 和 Testing Library 正常工作', () => {
    // 简单的渲染测试验证配置
    const TestComponent = () => <div data-testid="test-element">Hello Test</div>;
    render(<TestComponent />);
    expect(screen.getByTestId('test-element')).toHaveTextContent('Hello Test');
  });

  it('jest-dom 扩展匹配器可用', () => {
    const TestComponent = () => <button disabled>Disabled Button</button>;
    render(<TestComponent />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});