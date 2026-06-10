/** 随机整数 [min, max] */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 随机延时 [minMs, maxMs] */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = randomInt(minMs, maxMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 模拟人类点击：mousedown → delay → mouseup → click */
export function simulateClick(element: Element): void {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width * (0.3 + Math.random() * 0.4);
  const y = rect.top + rect.height * (0.3 + Math.random() * 0.4);

  const events = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  for (const eventType of events) {
    element.dispatchEvent(
      new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window,
      })
    );
  }
}

/** 模拟鼠标移动到目标元素（贝塞尔曲线轨迹） */
export async function simulateMouseMove(
  element: Element,
  steps: number = randomInt(5, 15)
): Promise<void> {
  const rect = element.getBoundingClientRect();
  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + rect.height / 2;

  const startX = randomInt(0, window.innerWidth);
  const startY = randomInt(0, window.innerHeight);

  // 控制点（贝塞尔曲线）
  const cp1x = startX + (targetX - startX) * 0.3 + randomInt(-50, 50);
  const cp1y = startY + (targetY - startY) * 0.1 + randomInt(-30, 30);
  const cp2x = startX + (targetX - startX) * 0.7 + randomInt(-50, 50);
  const cp2y = startY + (targetY - startY) * 0.9 + randomInt(-30, 30);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    const x = mt3 * startX + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * targetX;
    const y = mt3 * startY + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * targetY;

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: x,
        clientY: y,
        view: window,
      })
    );

    await randomDelay(8, 25);
  }
}

/** 随机滚动页面 */
export async function randomScroll(): Promise<void> {
  const direction = Math.random() > 0.2 ? 1 : -1; // 80% 向下，20% 向上
  const distance = randomInt(100, 400) * direction;
  const duration = randomInt(300, 800);
  const steps = randomInt(5, 12);

  for (let i = 0; i <= steps; i++) {
    const scrollY = (distance * i) / steps;
    window.scrollBy(0, scrollY - (distance * (i - 1)) / steps);
    await randomDelay(duration / steps, (duration / steps) * 1.5);
  }
}

/** 生成逐字输入的延时数组 */
export function typingDelays(textLength: number): number[] {
  const delays: number[] = [];
  for (let i = 0; i < textLength; i++) {
    // 偶尔加一个稍长的停顿（模拟思考）
    const base = randomInt(50, 150);
    const pause = Math.random() < 0.1 ? randomInt(200, 500) : 0;
    delays.push(base + pause);
  }
  return delays;
}
