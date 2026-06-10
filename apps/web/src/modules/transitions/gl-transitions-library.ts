/**
 * GL Transitions 集成模块
 * 将 gl-transitions 的 GLSL shader 集成到现有转场系统
 *
 * gl-transitions 格式：
 * - 提供 transition(vec2 uv) 函数
 * - 使用 from, to 纹理表示前后帧
 * - 使用 progress 表示转场进度
 *
 * @see https://gl-transitions.com/
 */

import { WebCutBaseTransition, WebCutTransitionConfig } from './base-transition';

/**
 * gl-transitions shader 定义
 */
export interface GLTransitionDefinition {
  name: string;
  title: string;
  /** GLSL fragment shader 代码（transition 函数体） */
  glsl: string;
  /** 默认参数 */
  defaultParams?: Record<string, number | number[]>;
  /** 默认时长（微秒） */
  defaultDuration?: number;
}

/**
 * 顶点着色器（所有转场共用）
 */
const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texcoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texcoord = vec2((a_position.x + 1.0) / 2.0, 1.0 - (a_position.y + 1.0) / 2.0);
}
`;

/**
 * 包装 gl-transitions shader 为完整 fragment shader
 */
function wrapGLTransition(glsl: string, params: Record<string, number | number[]> = {}): string {
  // 检测 shader 中已定义的变量（uniform 或局部变量），避免重复声明
  const existingVars = new Set<string>();

  // 匹配 uniform 声明
  const uniformRegex = /uniform\s+(?:float|vec[234]|int|bool|sampler2D)\s+(\w+)/g;
  let match;
  while ((match = uniformRegex.exec(glsl)) !== null) {
    existingVars.add(match[1]);
  }

  // 匹配局部变量声明 (float/vec/int/bool 变量名 =)
  const localVarRegex = /(?:float|vec[234]|int|bool)\s+(\w+)\s*=/g;
  while ((match = localVarRegex.exec(glsl)) !== null) {
    existingVars.add(match[1]);
  }

  // 只为 shader 中未定义的参数生成 uniform 声明
  const paramUniforms = Object.entries(params)
    .filter(([name]) => !existingVars.has(name))
    .map(([name, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 2) return `uniform vec2 ${name};`;
        if (value.length === 3) return `uniform vec3 ${name};`;
        if (value.length === 4) return `uniform vec4 ${name};`;
      }
      return `uniform float ${name};`;
    })
    .join('\n  ');

  return `
precision highp float;
varying vec2 v_texcoord;

uniform sampler2D from;
uniform sampler2D to;
uniform float progress;
uniform vec2 resolution;

${paramUniforms}

${glsl}

void main() {
  gl_FragColor = transition(v_texcoord);
}
`;
}

/**
 * 共享 WebGL 上下文管理器
 * 解决浏览器 WebGL 上下文数量限制问题（通常 8-16 个）
 *
 * 使用多个上下文池来避免尺寸冲突：
 * - previewContext: 用于预览卡片（小尺寸）
 * - composeContext: 用于实际视频合成（大尺寸）
 */
class SharedWebGLContext {
  private canvas: OffscreenCanvas | null = null;
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private textureFrom: WebGLTexture | null = null;
  private textureTo: WebGLTexture | null = null;
  private cachedWidth = 0;
  private cachedHeight = 0;
  private programs: Map<string, WebGLProgram> = new Map();

  /**
   * 获取或初始化 WebGL 上下文
   */
  getContext(width: number, height: number): WebGL2RenderingContext | WebGLRenderingContext {
    if (!this.canvas || this.canvas.width !== width || this.canvas.height !== height || !this.gl) {
      // 清理旧资源
      this.cleanup();

      this.canvas = new OffscreenCanvas(width, height);
      this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');

      if (!this.gl) {
        throw new Error('WebGL not supported');
      }

      this.gl.viewport(0, 0, width, height);

      // 创建共享的顶点缓冲
      this.positionBuffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        this.gl.STATIC_DRAW
      );

      // 创建共享的纹理
      this.textureFrom = this.gl.createTexture();
      this.textureTo = this.gl.createTexture();

      for (const tex of [this.textureFrom, this.textureTo]) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      }

      this.cachedWidth = width;
      this.cachedHeight = height;

      // 清空 program 缓存（新上下文需要重新编译）
      this.programs.clear();
    } else {
      this.gl.viewport(0, 0, width, height);
    }

    return this.gl;
  }

  /**
   * 获取 canvas
   */
  getCanvas(): OffscreenCanvas | null {
    return this.canvas;
  }

  /**
   * 获取顶点缓冲
   */
  getPositionBuffer(): WebGLBuffer | null {
    return this.positionBuffer;
  }

  /**
   * 获取纹理
   */
  getTextures(): { from: WebGLTexture | null; to: WebGLTexture | null } {
    return { from: this.textureFrom, to: this.textureTo };
  }

  /**
   * 获取或创建 program
   */
  getProgram(name: string): WebGLProgram | null {
    return this.programs.get(name) || null;
  }

  /**
   * 缓存 program
   */
  setProgram(name: string, program: WebGLProgram): void {
    this.programs.set(name, program);
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.gl) {
      this.programs.forEach((program) => {
        this.gl!.deleteProgram(program);
      });
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.textureFrom) this.gl.deleteTexture(this.textureFrom);
      if (this.textureTo) this.gl.deleteTexture(this.textureTo);
    }
    this.programs.clear();
    this.canvas = null;
    this.gl = null;
    this.positionBuffer = null;
    this.textureFrom = null;
    this.textureTo = null;
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.cleanup();
  }
}

// 预览用的上下文（小尺寸，如 100x56）
const previewContext = new SharedWebGLContext();

// 实际视频合成用的上下文（大尺寸，如 1080x1920）
const composeContext = new SharedWebGLContext();

/**
 * 根据尺寸选择合适的上下文
 * 小于 500px 的认为是预览，大于等于 500px 的认为是合成
 */
function getContextBySize(width: number, height: number): SharedWebGLContext {
  const isPreview = width < 500 && height < 500;
  return isPreview ? previewContext : composeContext;
}

/**
 * 通用 GL Transition 实现
 * 支持任意 gl-transitions shader
 * 使用共享 WebGL 上下文，避免上下文数量限制
 */
export class GLTransition extends WebCutBaseTransition {
  name: string;
  title: string;
  defaultDuration: number;
  defaultConfig: WebCutTransitionConfig;

  private definition: GLTransitionDefinition;

  constructor(definition: GLTransitionDefinition) {
    super();
    this.definition = definition;
    this.name = definition.name;
    this.title = definition.title;
    this.defaultDuration = definition.defaultDuration ?? 1000000;
    this.defaultConfig = definition.defaultParams ?? {};
  }

  async apply(
    frame1: VideoFrame,
    frame2: VideoFrame,
    progress: number,
    config: WebCutTransitionConfig = {}
  ): Promise<VideoFrame> {
    const width = frame1.displayWidth;
    const height = frame1.displayHeight;

    const ctx = getContextBySize(width, height);

    const gl = ctx.getContext(width, height);
    const canvas = ctx.getCanvas()!;

    // 编译 shader（仅首次）
    let program = ctx.getProgram(this.name);
    if (!program) {
      const mergedConfig = { ...this.defaultConfig, ...config };
      const fragmentSource = wrapGLTransition(this.definition.glsl, mergedConfig);
      program = this.createProgram(gl, fragmentSource);
      ctx.setProgram(this.name, program);
    }

    // 使用程序
    gl.useProgram(program);

    // 绑定顶点缓冲
    gl.bindBuffer(gl.ARRAY_BUFFER, ctx.getPositionBuffer());
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // 上传纹理
    const textures = ctx.getTextures();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.from);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame1);
    gl.uniform1i(gl.getUniformLocation(program, 'from'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.to);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame2);
    gl.uniform1i(gl.getUniformLocation(program, 'to'), 1);

    // 设置 uniforms
    gl.uniform1f(gl.getUniformLocation(program, 'progress'), progress);
    gl.uniform2f(gl.getUniformLocation(program, 'resolution'), width, height);

    // 设置自定义参数
    const mergedConfig = { ...this.defaultConfig, ...config };
    for (const [key, value] of Object.entries(mergedConfig)) {
      const loc = gl.getUniformLocation(program, key);
      if (loc) {
        if (Array.isArray(value)) {
          if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
          else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
          else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
        } else {
          gl.uniform1f(loc, value);
        }
      }
    }

    // 绘制
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return new VideoFrame(canvas, {
      timestamp: frame1.timestamp,
      duration: frame1.duration || undefined,
    });
  }

  private createProgram(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram {
    // 编译顶点着色器
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(vs);
      console.error(`[${this.name}] Vertex shader compilation failed:`, error);
      throw new Error(`Vertex shader error: ${error}`);
    }

    // 编译片段着色器
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragmentSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(fs);
      console.error(`[${this.name}] Fragment shader compilation failed:`, error);
      console.error(`[${this.name}] Fragment source:`, fragmentSource);
      throw new Error(`Fragment shader error (${this.name}): ${error}`);
    }

    // 链接程序
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      console.error(`[${this.name}] Program link failed:`, error);
      throw new Error(`Program link error (${this.name}): ${error}`);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  dispose(): void {
    // 共享上下文由全局管理，这里不做清理
  }
}

// ============================================================
// 内置 gl-transitions shader 库
// 来源: https://gl-transitions.com/
// ============================================================

export const GL_TRANSITIONS_LIBRARY: GLTransitionDefinition[] = [
  // 淡入淡出
  {
    name: 'fade',
    title: '淡入淡出',
    defaultDuration: 1000000,
    glsl: `
vec4 transition(vec2 p) {
  return mix(texture2D(from, p), texture2D(to, p), progress);
}
`,
  },
  // 叠化（交叉溶解，使用 smoothstep 实现更平滑的过渡）
  {
    name: 'crossDissolve',
    title: '叠化',
    defaultDuration: 1000000,
    glsl: `
vec4 transition(vec2 p) {
  vec4 c1 = texture2D(from, p);
  vec4 c2 = texture2D(to, p);
  return mix(c1, c2, smoothstep(0.0, 1.0, progress));
}
`,
  },
  // 推近（新画面从中心快速推近放大）
  {
    name: 'zoomIn',
    title: '推近',
    defaultDuration: 1000000,
    defaultParams: { strength: 0.5 },
    glsl: `
vec4 transition(vec2 p) {
  // 新画面从中心推近放大
  vec2 center = vec2(0.5);
  float scale = 1.0 + progress * strength;
  vec2 newCoord = center + (p - center) / scale;

  // 确保坐标在有效范围内
  newCoord = clamp(newCoord, 0.0, 1.0);

  vec4 fromColor = texture2D(from, p);
  vec4 toColor = texture2D(to, newCoord);

  // 混合：progress 越大，新画面占比越高
  return mix(fromColor, toColor, progress);
}
`,
  },
];

/**
 * 创建所有 GL Transition 实例
 */
export function createGLTransitions(): GLTransition[] {
  return GL_TRANSITIONS_LIBRARY.map((def) => new GLTransition(def));
}

/**
 * 获取转场定义
 */
export function getTransitionDefinition(name: string): GLTransitionDefinition | undefined {
  return GL_TRANSITIONS_LIBRARY.find((t) => t.name === name);
}
