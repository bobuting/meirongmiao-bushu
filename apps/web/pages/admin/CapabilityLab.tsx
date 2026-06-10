import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ApiError, backendApi } from "../../services/backendApi";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';

interface CallState<T> {
  running: boolean;
  error: string | null;
  result: T | null;
}

function createIdleState<T>(): CallState<T> {
  return {
    running: false,
    error: null,
    result: null,
  };
}

const cardClass = "bg-white border border-gray-100 rounded-2xl p-5 shadow-sm";
const inputClass =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary";
const textareaClass = `${inputClass} resize-y min-h-[96px]`;

export const CapabilityLab: React.FC = () => {
  const { token, currentUser } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser })));
  const isAdmin = currentUser?.role === "admin";

  const [textInput, setTextInput] = useState("请把下面这段口播改写得更抓人：\n春季穿搭别只看颜色，还要看版型和面料。");
  const [textInstruction, setTextInstruction] = useState("输出 1 版优化口播 + 3 条可执行建议。");
  const [textState, setTextState] = useState<
    CallState<{
      providerId: string;
      output: string;
      groundingSources?: Array<{ title: string; url: string }>;
    }>
  >(createIdleState());

  const [insightImageUrl, setInsightImageUrl] = useState("");
  const [insightImageLabel, setInsightImageLabel] = useState("");
  const [insightPrompt, setInsightPrompt] = useState(
    "根据这张服装图进行趋势搜索，给出2026春夏搭配建议（下装/鞋履/配饰）。",
  );
  const [insightTimeoutMs, setInsightTimeoutMs] = useState(120000);
  const [insightTransportMode, setInsightTransportMode] = useState<"gemini" | "openai_vision">("gemini");
  const [insightDebug, setInsightDebug] = useState<{
    request: Record<string, unknown>;
    response?: Record<string, unknown>;
    error?: string;
  } | null>(null);
  const [insightState, setInsightState] = useState<
    CallState<{
      providerId: string;
      output: string;
      groundingSources?: Array<{ title: string; url: string }>;
      debug?: {
        mode: "gemini" | "openai_vision";
        timeoutMs: number;
        imageSource: "upload_data_url" | "remote_url";
        trace: {
          endpoint: string;
          model: string;
          requestHeaders: Record<string, string>;
          requestBody: string;
          response: string;
        } | null;
      };
    }>
  >(createIdleState());
  const insightFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoReverseFileInputRef = useRef<HTMLInputElement | null>(null);

  const [videoPrompt, setVideoPrompt] = useState("城市街拍风格，人物走动，镜头平滑推进，5秒");
  const [videoState, setVideoState] = useState<
    CallState<{
      providerId: string;
      routeKey: string;
      url: string;
    }>
  >(createIdleState());

  const [reverseUrl, setReverseUrl] = useState("");
  const [reverseState, setReverseState] = useState<
    CallState<{
      traceId: string;
      finalStage: string;
      resolvedVideoUrl: string | null;
      llmScriptPreview?: string;
      attempts: Array<{ stage: string; status: string; detail?: string | null }>;
    }>
  >(createIdleState());
  const [reverseDebug, setReverseDebug] = useState<{
    request: Record<string, unknown>;
    response?: Record<string, unknown>;
    error?: string;
  } | null>(null);
  const [videoReverseGoal, setVideoReverseGoal] = useState("分析这个视频的内容主题、镜头节奏和可复刻脚本。");
  const [videoReverseUrl, setVideoReverseUrl] = useState("https://cdn.example.com/reverse/demo.mp4");
  const [videoReverseUploadFile, setVideoReverseUploadFile] = useState<File | null>(null);
  const [videoReverseUploadLabel, setVideoReverseUploadLabel] = useState("未选择视频/音频文件");
  const [videoReverseState, setVideoReverseState] = useState<
    CallState<{
      result: string;
      model: string;
      diagnostics: {
        requestId: string | null;
        attempts: Array<{
          capability: "video_reverse";
          apiId: string;
          model: string;
          stage: "model_chain" | "api_chain";
          status: "success" | "error" | "timeout";
          latencyMs: number;
          errorCode: string | null;
          errorMessage: string | null;
        }>;
      };
      videoMeta: {
        sourceType: "video_url" | "upload_file";
        videoUrl?: string;
        filename?: string;
        mimeType: string;
        bytes: number | null;
      };
    }>
  >(createIdleState());

  const [auditState, setAuditState] = useState<
    CallState<
      Array<{
        id: string;
        providerId: string;
        routeKey: string;
        status: "pending" | "success" | "error" | "timeout";
        latencyMs: number;
        errorCode: string | null;
        errorMessage: string | null;
        requestSummary?: string | null;
        responseSummary?: string | null;
        createdAt: number;
      }>
    >
  >(createIdleState());

  const parseError = (error: unknown): string => {
    if (error instanceof ApiError) {
      return `${error.code}: ${error.message}`;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  };

  const refreshAuditLogs = useCallback(async () => {
    if (!token) {
      setAuditState({
        running: false,
        error: "token missing",
        result: [],
      });
      return;
    }
    setAuditState((prev) => ({
      running: true,
      error: null,
      result: prev.result ?? [],
    }));
    try {
      const response = await backendApi.adminProviderAudits(token, 40);
      const items = (response.audits ?? [])
        .filter((item) =>
          item.routeKey === "step3_script_generation" ||
          item.routeKey === "script_generation" ||
          item.routeKey === "square_video_reverse"
        )
        .map((item) => ({
          ...item,
          status: item.status as "pending" | "success" | "error" | "timeout",
        }))
        .slice(0, 30);
      setAuditState({
        running: false,
        error: null,
        result: items,
      });
    } catch (error) {
      setAuditState({
        running: false,
        error: parseError(error),
        result: [],
      });
    }
  }, [token]);

  useEffect(() => {
    if (!isAdmin || !token) {
      return;
    }
    void refreshAuditLogs();
  }, [isAdmin, refreshAuditLogs, token]);

  const readFileAsDataUrl = async (file: File): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (!result.startsWith("data:image/")) {
          reject(new Error("请选择图片文件"));
          return;
        }
        resolve(result);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleInsightFileChange = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setInsightImageUrl(dataUrl);
      setInsightImageLabel(file.name);
    } catch (error) {
      const message = parseError(error);
      setInsightState({
        running: false,
        result: null,
        error: message,
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleVideoReverseUploadChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    setVideoReverseUploadFile(file);
    setVideoReverseUploadLabel(
      file ? `${file.name} · ${Math.max(1, Math.ceil(file.size / 1024))} KB` : "未选择视频/音频文件",
    );
    event.target.value = "";
  };

  const withCall = async <T,>(
    setter: React.Dispatch<React.SetStateAction<CallState<T>>>,
    runner: () => Promise<T>,
  ): Promise<void> => {
    setter((prev) => ({ ...prev, running: true, error: null }));
    try {
      const result = await runner();
      setter({
        running: false,
        error: null,
        result,
      });
    } catch (error) {
      setter({
        running: false,
        error: parseError(error),
        result: null,
      });
    } finally {
      void refreshAuditLogs();
    }
  };

  if (!isAdmin) {
    return (
      <>
        <div className="h-full overflow-auto p-6 md:p-8">
          <div className="max-w-3xl mx-auto bg-white border border-red-100 text-red-700 rounded-2xl p-6">
            此页面仅管理员可访问。
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="h-full overflow-auto p-6 md:p-8">
        <div className="max-w-[1400px] mx-auto space-y-5">
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <h1 className="text-2xl font-black text-gray-900">Capability Lab</h1>
            <p className="text-sm text-gray-500 mt-1">
              单管道独立验通页面。每个能力直接调用后端对应路由，不依赖主业务流程。
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)] gap-5">
            <div className="space-y-5">
          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">1. 文生文能力（LLM）</h2>
              <Button
                isLoading={textState.running}
                onClick={() =>
                  withCall(setTextState, async () => {
                    if (!token) throw new Error("token missing");
                    const response = await backendApi.adminCapabilityLabText(token, {
                      prompt: textInput,
                    }) as unknown as { providerId: string; output: string; groundingSources?: Array<{ title: string; url: string }> };
                    const result: { providerId: string; output: string; groundingSources?: Array<{ title: string; url: string }> } = {
                      providerId: response.providerId,
                      output: response.output,
                    };
                    if (response.groundingSources) {
                      result.groundingSources = response.groundingSources;
                    }
                    return result;
                  })
                }
              >
                运行测试
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <textarea
                className={textareaClass}
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                placeholder="输入待分析文本"
              />
              <textarea
                className={textareaClass}
                value={textInstruction}
                onChange={(event) => setTextInstruction(event.target.value)}
                placeholder="输入任务指令"
              />
            </div>
            {textState.error && <p className="text-sm text-red-600 mt-3">{textState.error}</p>}
            {textState.result && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-xs text-gray-500">provider: {textState.result.providerId}</p>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap">{textState.result.output}</pre>
              </div>
            )}
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">2. 图片多模态分析 + 搜索（Gemini Grounding）</h2>
              <Button
                isLoading={insightState.running}
                onClick={async () => {
                  const payload = {
                    imageUrl: insightImageUrl,
                    prompt: insightPrompt,
                    temperature: 0.25,
                    timeoutMs: insightTimeoutMs,
                    transportMode: insightTransportMode,
                  } as const;
                  setInsightState((prev) => ({ ...prev, running: true, error: null }));
                  setInsightDebug({
                    request: {
                      ...payload,
                      imageUrl: insightImageUrl.startsWith("data:image/")
                        ? `[data-url:${insightImageUrl.length}]`
                        : insightImageUrl,
                    },
                  });
                  try {
                    if (!token) throw new Error("token missing");
                    const response = await backendApi.adminCapabilityLabImageInsight(token, payload) as unknown as {
                      providerId: string;
                      output: string;
                      groundingSources?: Array<{ title: string; url: string }>;
                      debug?: {
                        mode: "gemini" | "openai_vision";
                        timeoutMs: number;
                        imageSource: "upload_data_url" | "remote_url";
                        trace: { endpoint: string; model: string; requestHeaders: Record<string, string>; requestBody: string; response: string } | null;
                      };
                      routeKey?: string;
                    };
                    setInsightState({
                      running: false,
                      error: null,
                      result: {
                        providerId: response.providerId,
                        output: response.output,
                        groundingSources: response.groundingSources,
                        debug: response.debug,
                      },
                    });
                    setInsightDebug((prev) => ({
                      ...(prev ?? { request: {} }),
                      response: response.debug
                        ? {
                            providerId: response.providerId,
                            routeKey: response.routeKey,
                            debug: response.debug,
                          }
                        : {
                            providerId: response.providerId,
                            routeKey: response.routeKey,
                            outputPreview: response.output.slice(0, 240),
                          },
                    }));
                  } catch (error) {
                    const message = parseError(error);
                    setInsightState({
                      running: false,
                      error: message,
                      result: null,
                    });
                    setInsightDebug((prev) => ({
                      ...(prev ?? { request: {} }),
                      error: message,
                    }));
                  } finally {
                    void refreshAuditLogs();
                  }
                }}
              >
                运行测试
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
              <Button
                variant="secondary"
                onClick={() => insightFileInputRef.current?.click()}
                className="justify-start"
              >
                上传图片文件
              </Button>
              <select
                className={inputClass}
                value={insightTransportMode}
                onChange={(event) =>
                  setInsightTransportMode(event.target.value === "openai_vision" ? "openai_vision" : "gemini")
                }
              >
                <option value="gemini">gemini (generateContent + grounding)</option>
                <option value="openai_vision">openai_vision (chat/completions)</option>
              </select>
              <input
                className={inputClass}
                type="number"
                min={6000}
                max={240000}
                value={insightTimeoutMs}
                onChange={(event) =>
                  setInsightTimeoutMs(Math.max(6000, Math.min(240000, Number(event.target.value) || 120000)))
                }
              />
              <input
                className={inputClass}
                value={insightImageUrl}
                onChange={(event) => setInsightImageUrl(event.target.value)}
                placeholder="图片 URL 或上传后自动填充 data URL"
              />
            </div>
            <input
              ref={insightFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleInsightFileChange}
            />
            {insightImageLabel && (
              <p className="text-xs text-gray-500 mt-2">已上传文件：{insightImageLabel}</p>
            )}
            {insightImageUrl.startsWith("data:image/") && (
              <img
                src={insightImageUrl}
                alt="insight-upload"
                className="mt-3 w-40 h-40 object-cover rounded-xl border border-gray-200 bg-gray-100"
              />
            )}
            <div className="grid grid-cols-1 gap-3 mt-3">
              <input
                className={inputClass}
                value={insightPrompt}
                onChange={(event) => setInsightPrompt(event.target.value)}
                placeholder="分析提示词"
              />
            </div>
            {insightState.error && <p className="text-sm text-red-600 mt-3">{insightState.error}</p>}
            {insightState.result && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-xs text-gray-500">provider: {insightState.result.providerId}</p>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap">{insightState.result.output}</pre>
                {(insightState.result.groundingSources?.length ?? 0) > 0 && (
                  <div className="text-xs text-gray-600">
                    sources:
                    {insightState.result.groundingSources?.map((item) => (
                      <div key={item.url}>
                        <a className="text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer">
                          {item.title || item.url}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">3. 图生视频</h2>
              <Button
                isLoading={videoState.running}
                onClick={() =>
                  withCall(setVideoState, async () => {
                    if (!token) throw new Error("token missing");
                    return backendApi.adminCapabilityLabVideoGenerate(token, { prompt: videoPrompt }) as unknown as { providerId: string; routeKey: string; url: string };
                  })
                }
              >
                运行测试
              </Button>
            </div>
            <input
              className={`${inputClass} mt-4`}
              value={videoPrompt}
              onChange={(event) => setVideoPrompt(event.target.value)}
              placeholder="视频生成 prompt"
            />
            {videoState.error && <p className="text-sm text-red-600 mt-3">{videoState.error}</p>}
            {videoState.result && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <p className="text-xs text-gray-500 mb-2">
                  provider: {videoState.result.providerId} · route: {videoState.result.routeKey}
                </p>
                <a href={videoState.result.url} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
                  {videoState.result.url}
                </a>
              </div>
            )}
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">4. 反推视频文案（外部 API）</h2>
              <Button
                isLoading={reverseState.running}
                onClick={async () => {
                  const payload = { url: reverseUrl.trim() };
                  setReverseState((prev) => ({ ...prev, running: true, error: null }));
                  setReverseDebug({
                    request: payload,
                  });
                  try {
                    if (!token) throw new Error("token missing");
                    const response = await backendApi.adminCapabilityLabReverseFetch(token, payload) as unknown as {
                      traceId: string;
                      finalStage: string;
                      resolvedVideoUrl: string | null;
                      llmScriptPreview?: string;
                      attempts: Array<{ stage: string; status: string; detail?: string | null }>;
                    };
                    setReverseState({
                      running: false,
                      error: null,
                      result: response,
                    });
                    setReverseDebug((prev) => ({
                      ...(prev ?? { request: payload }),
                      response: response as unknown as Record<string, unknown>,
                    }));
                  } catch (error) {
                    const message = parseError(error);
                    setReverseState({
                      running: false,
                      error: message,
                      result: null,
                    });
                    setReverseDebug((prev) => ({
                      ...(prev ?? { request: payload }),
                      error: message,
                    }));
                  } finally {
                    void refreshAuditLogs();
                  }
                }}
              >
                运行测试
              </Button>
            </div>
            <input
              className={`${inputClass} mt-4`}
              value={reverseUrl}
              onChange={(event) => setReverseUrl(event.target.value)}
              placeholder="抖音视频链接"
            />
            {reverseState.error && <p className="text-sm text-red-600 mt-3">{reverseState.error}</p>}
            {reverseState.result && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-sm text-gray-700">
                  trace: {reverseState.result.traceId} · finalStage: {reverseState.result.finalStage}
                </p>
                <p className="text-xs text-gray-600 break-all">{reverseState.result.resolvedVideoUrl ?? "resolvedVideoUrl: null"}</p>
                {reverseState.result.llmScriptPreview && (
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap">{reverseState.result.llmScriptPreview}</pre>
                )}
                <div className="text-xs text-gray-600 space-y-1">
                  {reverseState.result.attempts.map((attempt, index) => (
                    <p key={`${attempt.stage}-${index}`}>
                      {attempt.stage} · {attempt.status}
                      {attempt.detail ? ` · ${attempt.detail}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className={cardClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">5. 视频多模态反推（共享 Service）</h2>
              <div className="flex items-center gap-2">
                <Button
                  isLoading={videoReverseState.running}
                  onClick={() =>
                    withCall(setVideoReverseState, async () => {
                      if (!token) throw new Error("token missing");
                      return await backendApi.adminCapabilityLabVideoReverse(token, {
                        userGoal: videoReverseGoal,
                        videoUrl: videoReverseUrl,
                      } as { videoUrl: string }) as unknown as {
                        result: string;
                        model: string;
                        diagnostics: {
                          requestId: string | null;
                          attempts: Array<{
                            capability: "video_reverse";
                            apiId: string;
                            model: string;
                            stage: "model_chain" | "api_chain";
                            status: "success" | "error" | "timeout";
                            latencyMs: number;
                            errorCode: string | null;
                            errorMessage: string | null;
                          }>;
                        };
                        videoMeta: {
                          sourceType: "video_url" | "upload_file";
                          videoUrl?: string;
                          filename?: string;
                          mimeType: string;
                          bytes: number | null;
                        };
                      };
                    })
                  }
                >
                  URL 测试
                </Button>
                <Button
                  variant="secondary"
                  isLoading={videoReverseState.running}
                  disabled={!videoReverseUploadFile}
                  onClick={() =>
                    withCall(setVideoReverseState, async () => {
                      if (!token) throw new Error("token missing");
                      if (!videoReverseUploadFile) throw new Error("请先选择视频或音频文件");
                      return await backendApi.adminCapabilityLabVideoReverseUpload(token, {
                        userGoal: videoReverseGoal,
                        file: videoReverseUploadFile,
                      } as { file: File }) as unknown as {
                        result: string;
                        model: string;
                        diagnostics: {
                          requestId: string | null;
                          attempts: Array<{
                            capability: "video_reverse";
                            apiId: string;
                            model: string;
                            stage: "model_chain" | "api_chain";
                            status: "success" | "error" | "timeout";
                            latencyMs: number;
                            errorCode: string | null;
                            errorMessage: string | null;
                          }>;
                        };
                        videoMeta: {
                          sourceType: "video_url" | "upload_file";
                          videoUrl?: string;
                          filename?: string;
                          mimeType: string;
                          bytes: number | null;
                        };
                      };
                    })
                  }
                >
                  上传测试
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <input
                className={inputClass}
                value={videoReverseUrl}
                onChange={(event) => setVideoReverseUrl(event.target.value)}
                placeholder="真实可下载视频链接"
              />
              <input
                className={inputClass}
                value={videoReverseGoal}
                onChange={(event) => setVideoReverseGoal(event.target.value)}
                placeholder="分析目标"
              />
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3">
              <input
                ref={videoReverseFileInputRef}
                type="file"
                className="hidden"
                accept="video/*,audio/*,.mp4,.mov,.mkv,.avi,.webm,.mp3,.wav,.m4a,.aac,.flac,.ogg"
                onChange={handleVideoReverseUploadChange}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{videoReverseUploadLabel}</p>
                  <p className="text-xs text-gray-500 mt-1">multipart 上传后端入口，上传后在服务层统一转 base64。</p>
                </div>
                <Button variant="secondary" onClick={() => videoReverseFileInputRef.current?.click()}>
                  选择文件
                </Button>
              </div>
            </div>
            {videoReverseState.error && <p className="text-sm text-red-600 mt-3">{videoReverseState.error}</p>}
            {videoReverseState.result && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-xs text-gray-500">
                  model: {videoReverseState.result.model} · sourceType: {videoReverseState.result.videoMeta.sourceType}
                </p>
                <p className="text-xs text-gray-600 break-all">
                  {videoReverseState.result.videoMeta.videoUrl ?? videoReverseState.result.videoMeta.filename ?? "no source"}
                </p>
                <p className="text-xs text-gray-600">
                  mimeType: {videoReverseState.result.videoMeta.mimeType} · bytes: {videoReverseState.result.videoMeta.bytes ?? "n/a"}
                </p>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap">{videoReverseState.result.result}</pre>
                <div className="text-xs text-gray-600 space-y-1">
                  {videoReverseState.result.diagnostics.attempts.map((attempt, index) => (
                    <p key={`${attempt.apiId}-${attempt.model}-${index}`}>
                      {attempt.stage} · {attempt.apiId} · {attempt.model} · {attempt.status}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>
            </div>

            <aside className="space-y-5 xl:sticky xl:top-6 self-start">
              <section className={cardClass}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">能力分析日志</h2>
                    <p className="text-xs text-gray-500 mt-1">展示 step3_script_generation / square_video_reverse 的最近后端调用。</p>
                  </div>
                  <Button variant="secondary" isLoading={auditState.running} onClick={() => void refreshAuditLogs()}>
                    刷新日志
                  </Button>
                </div>
                {auditState.error && <p className="text-sm text-red-600 mt-3">{auditState.error}</p>}
                <div className="mt-3 max-h-[480px] overflow-auto space-y-3 pr-1">
                  {(auditState.result ?? []).length < 1 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                      暂无可展示日志，请先运行能力测试。
                    </div>
                  ) : (
                    (auditState.result ?? []).map((audit) => (
                      <div key={audit.id} className="rounded-xl border border-gray-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-gray-900">
                            {audit.providerId} · {audit.routeKey}
                          </div>
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-bold ${
                              audit.status === "success"
                                ? "bg-green-100 text-green-700"
                                : audit.status === "pending"
                                  ? "bg-slate-100 text-slate-600"
                                : audit.status === "timeout"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {audit.status === "pending" ? "等待中" : audit.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {new Date(audit.createdAt).toLocaleString("zh-CN")} · {audit.status === "pending" ? "等待中" : `${audit.latencyMs}ms`}
                        </p>
                        {(audit.errorCode || audit.errorMessage) && (
                          <p className="mt-2 text-xs text-red-600">
                            {audit.errorCode ? `${audit.errorCode}: ` : ""}
                            {audit.errorMessage ?? ""}
                          </p>
                        )}
                        {(audit.requestSummary || audit.responseSummary) && (
                          <details className="mt-2 rounded border border-gray-100 bg-gray-50 p-2">
                            <summary className="cursor-pointer text-xs font-semibold text-gray-600">查看请求/返回摘要</summary>
                            {audit.requestSummary ? (
                              <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-gray-600">
                                request: {audit.requestSummary}
                              </pre>
                            ) : null}
                            {audit.responseSummary ? (
                              <pre className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-gray-600">
                                response: {audit.responseSummary}
                              </pre>
                            ) : null}
                          </details>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>

              {insightDebug && (
                <section className={cardClass}>
                  <h3 className="text-sm font-bold text-gray-900">图片分析调试详情</h3>
                  <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap text-xs text-gray-700">
                    {JSON.stringify(insightDebug, null, 2)}
                  </pre>
                </section>
              )}

              {reverseDebug && (
                <section className={cardClass}>
                  <h3 className="text-sm font-bold text-gray-900">反推调试详情</h3>
                  <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap text-xs text-gray-700">
                    {JSON.stringify(reverseDebug, null, 2)}
                  </pre>
                </section>
              )}
            </aside>
          </div>
        </div>
      </div>
    </>
  );
};
