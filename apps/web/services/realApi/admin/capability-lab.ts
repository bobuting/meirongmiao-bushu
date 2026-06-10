/**
 * 能力实验室 API
 */

import { request } from "../../backendApi.request";

export const capabilityLabApi = {
  adminCapabilityLabText(token: string, payload: { prompt: string; provider?: string }) {
    return request<{ result: string }>("POST", "/admin/capability-lab/text", {
      token,
      body: payload,
    });
  },

  adminCapabilityLabImageInsight(token: string, payload: { imageUrl: string; prompt?: string }) {
    return request<{ insight: string }>("POST", "/admin/capability-lab/image-insight", {
      token,
      body: payload,
    });
  },

  adminCapabilityLabImageGenerate(token: string, payload: { prompt: string; provider?: string }) {
    return request<{ imageUrl: string }>("POST", "/admin/capability-lab/image-generate", {
      token,
      body: payload,
    });
  },

  adminCapabilityLabVideoGenerate(token: string, payload: { prompt: string }) {
    return request<{ videoUrl: string }>("POST", "/admin/capability-lab/video-generate", {
      token,
      body: payload,
    });
  },

  adminCapabilityLabReverseFetch(token: string, payload: { url: string }) {
    return request<{
      videoUrl: string | null;
      transcript: string | null;
      error: string | null;
    }>("POST", "/admin/capability-lab/reverse-fetch", {
      token,
      body: payload,
    });
  },

  adminCapabilityLabVideoReverse(token: string, payload: { videoUrl: string }) {
    return request<{
      script: string | null;
      storyboard: unknown | null;
      error: string | null;
    }>("POST", "/video-reverse/analyze", {
      token,
      body: payload,
    });
  },

  adminCapabilityLabVideoReverseUpload(token: string, payload: { file: File }) {
    const formData = new FormData();
    formData.append("file", payload.file);
    return request<{
      script: string | null;
      storyboard: unknown | null;
      error: string | null;
    }>("POST", "/admin/capability-lab/video-reverse-upload", {
      token,
      body: formData,
    });
  },
};