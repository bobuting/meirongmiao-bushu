export interface BackendApiStoryboardGenerateFramePayload extends Record<string, unknown> {
  index?: number;
  title?: string;
  narration?: string;
  visualPrompt?: string;
  visualCue?: string;
}

export interface BackendApiStoryboardGeneratePayload extends Record<string, unknown> {
  frameCount: number;
  frames?: BackendApiStoryboardGenerateFramePayload[];
  generationOptions?: {
    ratio?: "1:1" | "3:4" | "9:16" | "16:9";
    resolution?: "1k" | "2k" | "4k";
  };
}


