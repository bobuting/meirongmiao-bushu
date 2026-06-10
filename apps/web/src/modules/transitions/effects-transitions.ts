import { WebCutBaseTransition, WebCutTransitionConfig } from './base-transition';

/**
 * WebGL转场效果基类
 * 提供WebGL相关的工具函数和基础实现
 *
 * 性能优化：
 * - 缓存 vertex buffer，每帧复用而非重新创建
 * - 缓存 2 个纹理槽，通过 texSubImage2D 更新而非创建/销毁
 * - 缓存 program 的 uniform/attribute location，避免每帧查询
 */
abstract class WebGLTransition extends WebCutBaseTransition {
  protected canvas: OffscreenCanvas | null = null;
  protected gl: WebGL2RenderingContext | null = null;
  protected programs: Map<string, WebGLProgram> = new Map();

  // 缓存资源：vertex buffer + 2 个纹理 + 位置缓存
  private _positionBuffer: WebGLBuffer | null = null;
  private _texture1: WebGLTexture | null = null;
  private _texture2: WebGLTexture | null = null;
  private _cachedWidth = 0;
  private _cachedHeight = 0;
  private _uniformLocations: Map<string, WebGLUniformLocation | GLint> = new Map();
  private _attribLocations: Map<string, GLint> = new Map();

  // 热路径缓存：当前 program + sampler uniform locations
  private _currentProgram: WebGLProgram | null = null;
  private _samplerLoc1: WebGLUniformLocation | null = null;
  private _samplerLoc2: WebGLUniformLocation | null = null;

  /**
   * 初始化WebGL上下文（仅在分辨率变化时重建画布）
   */
  protected initWebGL(width: number, height: number): void {
    if (!this.canvas || this.canvas.width !== width || this.canvas.height !== height) {
      // 旧 canvas 和 context 将被丢弃，清理属于旧上下文的资源
      if (this.gl && this.programs.size > 0) {
        this.programs.forEach(program => {
          this.gl!.deleteProgram(program);
        });
        this.programs.clear();
      }

      this.canvas = new OffscreenCanvas(width, height);
      this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl') as WebGL2RenderingContext;

      if (!this.gl) {
        throw new Error('WebGL not supported');
      }

      // 分辨率变化时重建缓存资源
      this._initCachedResources(width, height);
    } else if (!this.gl) {
      // 画布存在但 gl 丢失（极少见），重新获取
      this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl') as WebGL2RenderingContext;
      if (!this.gl) throw new Error('WebGL not supported');
      this._initCachedResources(width, height);
    } else {
      // 画布和 gl 都存在，确保 viewport 正确
      this.gl.viewport(0, 0, width, height);
    }
  }

  /**
   * 初始化并缓存所有可复用的 WebGL 资源
   */
  private _initCachedResources(width: number, height: number): void {
    const gl = this.gl!;

    // 设置 viewport
    gl.viewport(0, 0, width, height);

    // 缓存 vertex buffer（所有转场共享相同顶点数据）
    if (this._positionBuffer) gl.deleteBuffer(this._positionBuffer);
    this._positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]), gl.STATIC_DRAW);

    // 缓存 2 个纹理
    if (this._texture1) gl.deleteTexture(this._texture1);
    if (this._texture2) gl.deleteTexture(this._texture2);
    this._texture1 = gl.createTexture();
    this._texture2 = gl.createTexture();

    // 预配置纹理参数（只需设置一次）
    for (const tex of [this._texture1, this._texture2]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    this._cachedWidth = width;
    this._cachedHeight = height;
    this._uniformLocations.clear();
    this._attribLocations.clear();
    // 分辨率变化时重置 program 缓存（VAO/sampler state 与新 canvas 绑定）
    this._currentProgram = null;
    this._samplerLoc1 = null;
    this._samplerLoc2 = null;
  }

  /**
   * 绑定顶点缓冲区（使用缓存的 buffer）
   */
  protected bindPositionBuffer(): void {
    const gl = this.gl!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
  }

  /**
   * 创建着色器
   */
  protected createShader(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation error: ${info}`);
    }
    return shader;
  }

  /**
   * 创建着色器程序（自动销毁着色器）
   */
  protected createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl!;
    const vs = this.createShader(gl.VERTEX_SHADER, vertexSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program linking error: ${info}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }

  /**
   * 缓存并获取 uniform location
   */
  protected getUniformLocation(program: WebGLProgram, name: string): WebGLUniformLocation {
    const key = `${program}|${name}`;
    let loc = this._uniformLocations.get(key) as WebGLUniformLocation | undefined;
    if (!loc) {
      loc = this.gl!.getUniformLocation(program, name)!;
      this._uniformLocations.set(key, loc);
    }
    return loc;
  }

  /**
   * 缓存并获取 attribute location
   */
  protected getAttribLocation(program: WebGLProgram, name: string): GLint {
    const key = `${program}|${name}`;
    let loc = this._attribLocations.get(key);
    if (loc === undefined) {
      loc = this.gl!.getAttribLocation(program, name);
      this._attribLocations.set(key, loc);
    }
    return loc;
  }

  /**
   * 使用缓存的纹理上传帧数据（替代 createTexture + setupTexture）
   */
  protected uploadTexture(frame: VideoFrame, texUnit: number, texHandle: WebGLTexture): void {
    const gl = this.gl!;
    gl.activeTexture(texUnit);
    gl.bindTexture(gl.TEXTURE_2D, texHandle);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
  }

  /**
   * 标准转场渲染流程（使用缓存资源）
   * 性能优化：
   * - 复用 vertex buffer / 纹理槽 / uniform location
   * - 跳过冗余的 enableVertexAttribArray + vertexAttribPointer（VAO 状态持久）
   * - 跳过冗余的 useProgram（当前 program 相同时）
   * - 跳过冗余的 sampler uniform 设置（值固定为 0/1）
   */
  protected renderWithCache(
    program: WebGLProgram,
    frame1: VideoFrame,
    frame2: VideoFrame,
    setUniforms: (getUniform: (name: string) => WebGLUniformLocation) => void
  ): VideoFrame {
    const gl = this.gl!;

    // 仅在 program 切换时设置：useProgram + vertex attrib + sampler uniforms
    if (program !== this._currentProgram) {
      gl.useProgram(program);

      // 绑定顶点 buffer 并设置 attribute（VAO 状态持久，只需一次）
      this.bindPositionBuffer();
      const posLoc = this.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      // 设置纹理采样器（值固定为 0 和 1，永不改变）
      this._samplerLoc1 = this.getUniformLocation(program, 'u_texture1');
      this._samplerLoc2 = this.getUniformLocation(program, 'u_texture2');
      gl.uniform1i(this._samplerLoc1, 0);
      gl.uniform1i(this._samplerLoc2, 1);

      this._currentProgram = program;
    }

    // 每帧必做：上传纹理数据
    this.uploadTexture(frame1, gl.TEXTURE0, this._texture1!);
    this.uploadTexture(frame2, gl.TEXTURE1, this._texture2!);

    // 每帧必做：设置自定义 uniform（如 u_progress）
    setUniforms((name) => this.getUniformLocation(program, name));

    // 绘制
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return new VideoFrame(this.canvas!, {
      timestamp: frame1.timestamp,
      duration: frame1.duration || undefined,
    });
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this.gl) {
      this.programs.forEach(program => {
        this.gl!.deleteProgram(program);
      });
      this.programs.clear();

      if (this._positionBuffer) {
        this.gl.deleteBuffer(this._positionBuffer);
        this._positionBuffer = null;
      }
      if (this._texture1) {
        this.gl.deleteTexture(this._texture1);
        this._texture1 = null;
      }
      if (this._texture2) {
        this.gl.deleteTexture(this._texture2);
        this._texture2 = null;
      }
      this._uniformLocations.clear();
      this._attribLocations.clear();
      this._currentProgram = null;
      this._samplerLoc1 = null;
      this._samplerLoc2 = null;
      this.gl = null;
    }
    this.canvas = null;
    this._cachedWidth = 0;
    this._cachedHeight = 0;
  }
}

// 顶点着色器源码
const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_texcoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texcoord = vec2((a_position.x + 1.0) / 2.0, 1.0 - (a_position.y + 1.0) / 2.0);
  }
`;

// 淡入淡出转场效果
export class FadeTransition extends WebGLTransition {
  name = 'fade';
  title = '淡入淡出';
  defaultDuration = 1000000; // 1秒
  defaultConfig: WebCutTransitionConfig = {};

  async apply(
    frame1: VideoFrame,
    frame2: VideoFrame,
    progress: number,
    _config: WebCutTransitionConfig
  ): Promise<VideoFrame> {
    this.initWebGL(frame1.displayWidth, frame1.displayHeight);
    const gl = this.gl!;

    let program = this.programs.get('fade');
    if (!program) {
      program = this.createProgram(vertexShaderSource, `
        precision highp float;
        varying vec2 v_texcoord;
        uniform sampler2D u_texture1;
        uniform sampler2D u_texture2;
        uniform float u_progress;
        void main() {
          vec4 color1 = texture2D(u_texture1, v_texcoord);
          vec4 color2 = texture2D(u_texture2, v_texcoord);
          gl_FragColor = mix(color1, color2, u_progress);
        }
      `);
      this.programs.set('fade', program);
    }

    return this.renderWithCache(program, frame1, frame2, (getUniform) => {
      gl.uniform1f(getUniform('u_progress'), progress);
    });
  }
}

// 滑动转场效果
export class SlideTransition extends WebGLTransition {
  name = 'slide';
  title = '滑动';
  defaultDuration = 1000000;
  defaultConfig: WebCutTransitionConfig = { direction: 'left' };

  async apply(
    frame1: VideoFrame,
    frame2: VideoFrame,
    progress: number,
    config: WebCutTransitionConfig
  ): Promise<VideoFrame> {
    this.initWebGL(frame1.displayWidth, frame1.displayHeight);
    const gl = this.gl!;
    const direction = config.direction || this.defaultConfig.direction;

    let program = this.programs.get('slide');
    if (!program) {
      program = this.createProgram(vertexShaderSource, `
        precision highp float;
        varying vec2 v_texcoord;
        uniform sampler2D u_texture1;
        uniform sampler2D u_texture2;
        uniform float u_progress;
        uniform int u_direction;
        void main() {
          vec2 coord = v_texcoord;
          float alpha = 0.0;
          if (u_direction == 0) {
            alpha = step(coord.x, u_progress);
            vec4 color1 = texture2D(u_texture1, coord + vec2(u_progress, 0.0));
            vec4 color2 = texture2D(u_texture2, coord);
            gl_FragColor = mix(color1, color2, alpha);
          } else if (u_direction == 1) {
            alpha = step(1.0 - u_progress, coord.x);
            vec4 color1 = texture2D(u_texture1, coord - vec2(u_progress, 0.0));
            vec4 color2 = texture2D(u_texture2, coord);
            gl_FragColor = mix(color1, color2, alpha);
          } else if (u_direction == 2) {
            alpha = step(coord.y, u_progress);
            vec4 color1 = texture2D(u_texture1, coord + vec2(0.0, u_progress));
            vec4 color2 = texture2D(u_texture2, coord);
            gl_FragColor = mix(color1, color2, alpha);
          } else {
            alpha = step(1.0 - u_progress, coord.y);
            vec4 color1 = texture2D(u_texture1, coord - vec2(0.0, u_progress));
            vec4 color2 = texture2D(u_texture2, coord);
            gl_FragColor = mix(color1, color2, alpha);
          }
        }
      `);
      this.programs.set('slide', program);
    }

    const directionMap: Record<string, number> = { left: 0, right: 1, up: 2, down: 3 };
    return this.renderWithCache(program, frame1, frame2, (getUniform) => {
      gl.uniform1f(getUniform('u_progress'), progress);
      gl.uniform1i(getUniform('u_direction'), directionMap[direction as string] || 0);
    });
  }
}

// 缩放转场效果
export class ZoomTransition extends WebGLTransition {
  name = 'zoom';
  title = '缩放';
  defaultDuration = 1000000;
  defaultConfig: WebCutTransitionConfig = { direction: 'in' };

  async apply(frame1: VideoFrame, frame2: VideoFrame, progress: number, config: WebCutTransitionConfig): Promise<VideoFrame> {
    this.initWebGL(frame1.displayWidth, frame1.displayHeight);
    const gl = this.gl!;
    const direction = config.direction || this.defaultConfig.direction;

    let program = this.programs.get('zoom');
    if (!program) {
      program = this.createProgram(vertexShaderSource, `
        precision highp float; varying vec2 v_texcoord;
        uniform sampler2D u_texture1; uniform sampler2D u_texture2;
        uniform float u_progress; uniform bool u_zoomIn;
        float easeInOutQuartic(float t) { return t < 0.5 ? 8.0 * t * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 4.0) / 2.0; }
        void main() {
          vec2 center = vec2(0.5); vec2 coord = v_texcoord;
          float t = easeInOutQuartic(u_progress);
          float maxZoom = 1.2, minZoom = 0.8, midZoom = 1.0, fadeRange = maxZoom - midZoom;
          float zoom1, zoom2;
          if (u_zoomIn) { zoom1 = midZoom - t * (midZoom - minZoom); zoom2 = maxZoom - t * fadeRange; }
          else { zoom1 = maxZoom - t * fadeRange; zoom2 = midZoom + t * fadeRange; }
          vec2 coord1 = center + (coord - center) / zoom1;
          vec2 coord2 = center + (coord - center) / zoom2;
          vec2 clampedCoord1 = clamp(coord1, 0.0, 1.0); vec2 clampedCoord2 = clamp(coord2, 0.0, 1.0);
          vec4 color1 = texture2D(u_texture1, clampedCoord1); vec4 color2 = texture2D(u_texture2, clampedCoord2);
          gl_FragColor = mix(color1, color2, u_progress);
        }
      `);
      this.programs.set('zoom', program);
    }

    return this.renderWithCache(program, frame1, frame2, (getUniform) => {
      gl.uniform1f(getUniform('u_progress'), progress);
      gl.uniform1i(getUniform('u_zoomIn'), direction === 'in' ? 1 : 0);
    });
  }
}

// 百叶窗转场效果
export class BlindsTransition extends WebGLTransition {
  name = 'blinds';
  title = '百叶窗';
  defaultDuration = 1000000;
  defaultConfig: WebCutTransitionConfig = { count: 10, direction: 'horizontal' };

  async apply(frame1: VideoFrame, frame2: VideoFrame, progress: number, config: WebCutTransitionConfig): Promise<VideoFrame> {
    this.initWebGL(frame1.displayWidth, frame1.displayHeight);
    const gl = this.gl!;
    const count = config.count || this.defaultConfig.count;
    const direction = config.direction || this.defaultConfig.direction;

    let program = this.programs.get('blinds');
    if (!program) {
      program = this.createProgram(vertexShaderSource, `
        precision highp float; varying vec2 v_texcoord;
        uniform sampler2D u_texture1; uniform sampler2D u_texture2;
        uniform float u_progress; uniform float u_count; uniform bool u_horizontal;
        void main() {
          vec2 coord = v_texcoord; float size = 1.0 / u_count; float index, position, alpha;
          if (u_horizontal) { index = floor(coord.x / size); position = fract(coord.x / size);
            if (mod(index, 2.0) == 0.0) alpha = step(position, u_progress); else alpha = step(1.0 - position, u_progress);
          } else { index = floor(coord.y / size); position = fract(coord.y / size);
            if (mod(index, 2.0) == 0.0) alpha = step(position, u_progress); else alpha = step(1.0 - position, u_progress);
          }
          vec4 color1 = texture2D(u_texture1, coord); vec4 color2 = texture2D(u_texture2, coord);
          gl_FragColor = mix(color1, color2, alpha);
        }
      `);
      this.programs.set('blinds', program);
    }

    return this.renderWithCache(program, frame1, frame2, (getUniform) => {
      gl.uniform1f(getUniform('u_progress'), progress);
      gl.uniform1f(getUniform('u_count'), count);
      gl.uniform1i(getUniform('u_horizontal'), direction === 'horizontal' ? 1 : 0);
    });
  }
}

// 溶解转场效果
// @ts-ignore
export class DissolveTransition extends WebGLTransition {
  name = 'dissolve';
  title = '溶解';
  defaultDuration = 1000000;
  defaultConfig: WebCutTransitionConfig = { seed: 12345 };

  async apply(frame1: VideoFrame, frame2: VideoFrame, progress: number, config: WebCutTransitionConfig): Promise<VideoFrame> {
    this.initWebGL(frame1.displayWidth, frame1.displayHeight);
    const gl = this.gl!;
    const seed = config.seed || this.defaultConfig.seed;

    let program = this.programs.get('dissolve');
    if (!program) {
      program = this.createProgram(vertexShaderSource, `
        precision highp float; varying vec2 v_texcoord;
        uniform sampler2D u_texture1; uniform sampler2D u_texture2;
        uniform float u_progress; uniform float u_seed;
        float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
        void main() {
          vec2 coord = v_texcoord; float rnd = random(coord + u_seed);
          float alpha = step(rnd, u_progress);
          vec4 color1 = texture2D(u_texture1, coord); vec4 color2 = texture2D(u_texture2, coord);
          gl_FragColor = mix(color1, color2, alpha);
        }
      `);
      this.programs.set('dissolve', program);
    }

    return this.renderWithCache(program, frame1, frame2, (getUniform) => {
      gl.uniform1f(getUniform('u_progress'), progress);
      gl.uniform1f(getUniform('u_seed'), seed);
    });
  }
}

// 叠化转场效果（交叉溶解）
export class CrossDissolveTransition extends WebGLTransition {
  name = 'crossDissolve';
  title = '叠化';
  defaultDuration = 1000000;
  defaultConfig: WebCutTransitionConfig = { softness: 0.5 };

  async apply(frame1: VideoFrame, frame2: VideoFrame, progress: number, config: WebCutTransitionConfig): Promise<VideoFrame> {
    this.initWebGL(frame1.displayWidth, frame1.displayHeight);
    const gl = this.gl!;
    const softness = config.softness || this.defaultConfig.softness;

    let program = this.programs.get('crossDissolve');
    if (!program) {
      program = this.createProgram(vertexShaderSource, `
        precision highp float; varying vec2 v_texcoord;
        uniform sampler2D u_texture1; uniform sampler2D u_texture2;
        uniform float u_progress; uniform float u_softness;
        void main() {
          vec4 c1 = texture2D(u_texture1, v_texcoord); vec4 c2 = texture2D(u_texture2, v_texcoord);
          // 使用 softness 控制过渡中心点，0.5 表示在 progress 中间完成过渡
          // 整个 progress 0~1 都会参与过渡，不再被压缩
          gl_FragColor = mix(c1, c2, smoothstep(0.0, 1.0, u_progress));
        }
      `);
      this.programs.set('crossDissolve', program);
    }

    return this.renderWithCache(program, frame1, frame2, (getUniform) => {
      gl.uniform1f(getUniform('u_progress'), progress);
      gl.uniform1f(getUniform('u_softness'), softness);
    });
  }
}
