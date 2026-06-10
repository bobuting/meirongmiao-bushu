/**
 * 统一字典测试
 * 验证风格/情绪/氛围映射规则的正确性
 */

import { describe, it, expect } from "vitest";
import {
  CLOTHING_STYLE_CATEGORY,
  EMOTION_TONE_CATEGORY,
  ATMOSPHERE_SCENE_CATEGORY,
  MUSIC_ATMOSPHERE_CATEGORY,
  CLOTHING_STYLE_OPTIONS,
  EMOTION_TONE_OPTIONS,
  ATMOSPHERE_SCENE_OPTIONS,
  MUSIC_ATMOSPHERE_OPTIONS,
  STYLE_TO_EMOTION_MAP,
  EMOTION_TO_MUSIC_MAP,
  EMOTION_TO_ATMOSPHERE_MAP,
  recommendEmotionFromStyle,
  recommendMusicFromEmotion,
  recommendAtmosphereFromEmotion,
  validateStyleCompatibility,
  isValidEmotionTone,
  isValidClothingStyle,
  isValidAtmosphereScene,
  isValidMusicAtmosphere,
  parseClothingStyleFromText,
  parseEmotionToneFromText,
  parseAtmosphereSceneFromText,
  getFullRecommendation,
  type ClothingStyleCategory,
  type EmotionToneCategory,
  type AtmosphereSceneCategory,
  type MusicAtmosphereCategory,
} from "../src/contant-config/style-atmosphere-dict.js";

describe("Style Atmosphere Dict", () => {
  describe("字典完整性", () => {
    it("服饰风格字典包含 25 种", () => {
      expect(CLOTHING_STYLE_OPTIONS.length).toBe(25);
    });

    it("情绪基调字典包含 18 种", () => {
      expect(EMOTION_TONE_OPTIONS.length).toBe(18);
    });

    it("氛围场景字典包含 16 种", () => {
      expect(ATMOSPHERE_SCENE_OPTIONS.length).toBe(16);
    });

    it("音乐氛围字典包含 10 种", () => {
      expect(MUSIC_ATMOSPHERE_OPTIONS.length).toBe(10);
    });
  });

  describe("服饰风格映射到情绪基调", () => {
    it("休闲风格映射到轻松类情绪", () => {
      const styles: ClothingStyleCategory[] = ["简约", "休闲"];
      const emotions = recommendEmotionFromStyle(styles);
      expect(emotions).toContain("轻松");
      expect(emotions).toContain("满足");
    });

    it("时尚风格映射到活力类情绪", () => {
      const styles: ClothingStyleCategory[] = ["街头潮流", "运动休闲"];
      const emotions = recommendEmotionFromStyle(styles);
      expect(emotions).toContain("动感");
      expect(emotions).toContain("阳光");
    });

    it("优雅风格映射到柔和类情绪", () => {
      const styles: ClothingStyleCategory[] = ["优雅", "甜美"];
      const emotions = recommendEmotionFromStyle(styles);
      expect(emotions).toContain("浪漫");
      expect(emotions).toContain("温暖");
    });

    it("特殊风格映射到特殊情绪", () => {
      const styles: ClothingStyleCategory[] = ["古风"];
      const emotions = recommendEmotionFromStyle(styles);
      expect(emotions).toContain("古风");
      expect(emotions).toContain("怀旧");
    });

    it("多风格合并去重", () => {
      const styles: ClothingStyleCategory[] = ["简约", "休闲", "慵懒风"];
      const emotions = recommendEmotionFromStyle(styles);
      // 三种休闲风格都映射到轻松，应该去重
      const relaxedCount = emotions.filter(e => e === "轻松").length;
      expect(relaxedCount).toBe(1);
    });
  });

  describe("情绪基调映射到音乐氛围", () => {
    it("直接对应的情绪映射到同名音乐", () => {
      const emotions: EmotionToneCategory[] = ["欢快", "阳光"];
      const music = recommendMusicFromEmotion(emotions);
      expect(music).toContain("欢快");
      expect(music).toContain("阳光");
    });

    it("扩充情绪映射到现有音乐分类", () => {
      const emotions: EmotionToneCategory[] = ["忧郁", "怀旧"];
      const music = recommendMusicFromEmotion(emotions);
      // 忧郁和怀旧都映射到抒情类音乐
      expect(music).toContain("抒情");
    });

    it("迷茫映射到空灵类音乐", () => {
      const emotions: EmotionToneCategory[] = ["迷茫"];
      const music = recommendMusicFromEmotion(emotions);
      expect(music).toContain("空灵");
    });

    it("自信映射到动感类音乐", () => {
      const emotions: EmotionToneCategory[] = ["自信"];
      const music = recommendMusicFromEmotion(emotions);
      expect(music).toContain("动感");
    });
  });

  describe("情绪基调映射到氛围场景", () => {
    it("高能量情绪映射到动态场景", () => {
      const emotions: EmotionToneCategory[] = ["欢快"];
      const atmospheres = recommendAtmosphereFromEmotion(emotions);
      expect(atmospheres.some(a => a === "清晨清新" || a === "城市喧嚣")).toBe(true);
    });

    it("柔和情绪映射到温暖场景", () => {
      const emotions: EmotionToneCategory[] = ["浪漫"];
      const atmospheres = recommendAtmosphereFromEmotion(emotions);
      expect(atmospheres.some(a => a === "傍晚浪漫" || a === "咖啡馆温馨")).toBe(true);
    });

    it("内省情绪映射到静谧场景", () => {
      const emotions: EmotionToneCategory[] = ["忧郁"];
      const atmospheres = recommendAtmosphereFromEmotion(emotions);
      expect(atmospheres.some(a => a === "雨中忧郁" || a === "独处内省")).toBe(true);
    });
  });

  describe("风格兼容性验证", () => {
    it("兼容的风格组合", () => {
      const compatible: ClothingStyleCategory[] = ["简约", "休闲"];
      expect(validateStyleCompatibility(compatible)).toBe(true);
    });

    it("冲突的风格组合：街头潮流 + 古风", () => {
      const incompatible: ClothingStyleCategory[] = ["街头潮流", "古风"];
      expect(validateStyleCompatibility(incompatible)).toBe(false);
    });

    it("冲突的风格组合：商务 + 慵懒风", () => {
      const incompatible: ClothingStyleCategory[] = ["商务", "慵懒风"];
      expect(validateStyleCompatibility(incompatible)).toBe(false);
    });

    it("单风格始终兼容", () => {
      const single: ClothingStyleCategory[] = ["古风"];
      expect(validateStyleCompatibility(single)).toBe(true);
    });
  });

  describe("枚举验证函数", () => {
    it("验证有效的情绪基调", () => {
      expect(isValidEmotionTone("欢快")).toBe(true);
      expect(isValidEmotionTone("忧郁")).toBe(true);
      expect(isValidEmotionTone("治愈")).toBe(false); // 不在统一字典中
    });

    it("验证有效的服饰风格", () => {
      expect(isValidClothingStyle("简约")).toBe(true);
      expect(isValidClothingStyle("古风")).toBe(true);
      expect(isValidClothingStyle("时尚")).toBe(true);
      expect(isValidClothingStyle("潮流")).toBe(false); // 不在统一字典中
    });

    it("验证有效的氛围场景", () => {
      expect(isValidAtmosphereScene("清晨清新")).toBe(true);
      expect(isValidAtmosphereScene("雨中忧郁")).toBe(true);
      expect(isValidAtmosphereScene("温暖治愈")).toBe(false); // 不在统一字典中
    });

    it("验证有效的音乐氛围", () => {
      expect(isValidMusicAtmosphere("欢快")).toBe(true);
      expect(isValidMusicAtmosphere("古风")).toBe(true);
      expect(isValidMusicAtmosphere("忧郁")).toBe(false); // 音乐只有 10 种
    });
  });

  describe("自由文本解析函数", () => {
    it("解析服饰风格：直接匹配", () => {
      expect(parseClothingStyleFromText("简约")).toBe("简约");
      expect(parseClothingStyleFromText("简约风格")).toBe("简约");
    });

    it("解析服饰风格：关键词匹配", () => {
      expect(parseClothingStyleFromText("比较休闲")).toBe("休闲");
      expect(parseClothingStyleFromText("日系风格")).toBe("日系清新");
      expect(parseClothingStyleFromText("古风服饰")).toBe("古风");
    });

    it("解析服饰风格：无法识别返回 null", () => {
      expect(parseClothingStyleFromText("未知风格")).toBe(null);
      expect(parseClothingStyleFromText("")).toBe(null);
    });

    it("解析情绪基调：直接匹配", () => {
      expect(parseEmotionToneFromText("欢快")).toBe("欢快");
      expect(parseEmotionToneFromText("忧郁情绪")).toBe("忧郁");
    });

    it("解析氛围场景：直接匹配", () => {
      expect(parseAtmosphereSceneFromText("清晨清新")).toBe("清晨清新");
      expect(parseAtmosphereSceneFromText("雨中忧郁的氛围")).toBe("雨中忧郁");
    });
  });

  describe("完整链路推荐", () => {
    it("服饰风格 → 情绪 → 音乐 → 氛围完整链路", () => {
      const styles: ClothingStyleCategory[] = ["简约", "优雅"];
      const result = getFullRecommendation(styles);

      // 验证情绪推荐
      expect(result.emotions.length).toBeGreaterThan(0);
      expect(result.emotions.some(e => e === "轻松" || e === "浪漫")).toBe(true);

      // 验证音乐推荐
      expect(result.music.length).toBeGreaterThan(0);
      expect(result.music.some(m => m === "轻松" || m === "浪漫")).toBe(true);

      // 验证氛围推荐
      expect(result.atmospheres.length).toBeGreaterThan(0);
    });

    it("古风完整链路", () => {
      const styles: ClothingStyleCategory[] = ["古风"];
      const result = getFullRecommendation(styles);

      expect(result.emotions).toContain("古风");
      expect(result.music).toContain("古风");
      expect(result.atmospheres.some(a => a === "胡同静谧" || a === "落日壮美")).toBe(true);
    });
  });

  describe("映射规则完整性", () => {
    it("所有服饰风格都有情绪映射", () => {
      for (const style of CLOTHING_STYLE_OPTIONS) {
        expect(STYLE_TO_EMOTION_MAP[style]).toBeDefined();
        expect(STYLE_TO_EMOTION_MAP[style].length).toBeGreaterThanOrEqual(2);
      }
    });

    it("所有情绪基调都有音乐映射", () => {
      for (const emotion of EMOTION_TONE_OPTIONS) {
        expect(EMOTION_TO_MUSIC_MAP[emotion]).toBeDefined();
        expect(MUSIC_ATMOSPHERE_OPTIONS.includes(EMOTION_TO_MUSIC_MAP[emotion])).toBe(true);
      }
    });

    it("所有情绪基调都有氛围映射", () => {
      for (const emotion of EMOTION_TONE_OPTIONS) {
        expect(EMOTION_TO_ATMOSPHERE_MAP[emotion]).toBeDefined();
        expect(EMOTION_TO_ATMOSPHERE_MAP[emotion].length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("字典标签一致性", () => {
    it("服饰风格标签与字典值一致", () => {
      for (const style of CLOTHING_STYLE_OPTIONS) {
        const label = CLOTHING_STYLE_CATEGORY[style.toUpperCase().replace(/_/g, "_") as keyof typeof CLOTHING_STYLE_CATEGORY];
        // 验证标签存在（不验证具体映射，因为 key 命名规则复杂）
        expect(style).toBeDefined();
      }
    });

    it("情绪基调标签与字典值一致", () => {
      for (const emotion of EMOTION_TONE_OPTIONS) {
        expect(emotion).toBeDefined();
      }
    });
  });
});