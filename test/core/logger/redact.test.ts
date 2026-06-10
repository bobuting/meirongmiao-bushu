/**
 * 敏感信息脱敏测试
 */

import { describe, it, expect } from "vitest";
import { maskSensitiveValue, redactObject } from "../../../src/core/logger/redact.js";

describe("maskSensitiveValue", () => {
  it("短字符串完全脱敏", () => {
    expect(maskSensitiveValue("password", "abc")).toBe("****");
    expect(maskSensitiveValue("apiKey", "12345")).toBe("****");
  });

  it("长字符串保留前后4位", () => {
    expect(maskSensitiveValue("secret", "abcdefghijklmnop")).toBe("abcd...mnop");
    expect(maskSensitiveValue("token", "1234567890123456")).toBe("1234...3456");
  });

  it("空值返回 ****", () => {
    expect(maskSensitiveValue("password", "")).toBe("****");
    expect(maskSensitiveValue("apiKey", null)).toBe("****");
    expect(maskSensitiveValue("secret", undefined)).toBe("****");
  });
});

describe("redactObject", () => {
  it("非敏感字段不脱敏", () => {
    const obj = { name: "test", count: 123, enabled: true };
    const result = redactObject(obj);
    expect(result).toEqual({ name: "test", count: 123, enabled: true });
  });

  it("password 字段脱敏", () => {
    const obj = { username: "admin", password: "secret" };
    const result = redactObject(obj);
    expect(result).toEqual({ username: "admin", password: "****" });
  });

  it("apiKey 字段脱敏", () => {
    const obj = { apiKey: "sk-1234567890abcdef", userId: "user1" };
    const result = redactObject(obj);
    expect(result).toEqual({ apiKey: "sk-1...cdef", userId: "user1" });
  });

  it("token 字段脱敏", () => {
    const obj = { token: "Bearer abcdefghijklmnop" };
    const result = redactObject(obj);
    expect(result).toEqual({ token: "Bear...mnop" });
  });

  it("嵌套对象递归脱敏", () => {
    const obj = {
      user: {
        name: "admin",
        password: "secret",
        credentials: {
          apiKey: "key123456789",
        },
      },
    };
    const result = redactObject(obj);
    expect(result).toEqual({
      user: {
        name: "admin",
        password: "****",
        credentials: {
          apiKey: "key1...6789",
        },
      },
    });
  });

  it("数组中的敏感字段脱敏", () => {
    const obj = {
      users: [
        { name: "user1", password: "pass1" },
        { name: "user2", apiKey: "key123456789" },
      ],
    };
    const result = redactObject(obj);
    expect(result).toEqual({
      users: [
        { name: "user1", password: "****" },
        { name: "user2", apiKey: "key1...6789" },
      ],
    });
  });

  it("超过最大深度时停止递归", () => {
    const deepObj: Record<string, unknown> = { name: "level0" };
    let current = deepObj;
    for (let i = 0; i < 15; i++) {
      current.nested = { name: `level${i + 1}` };
      current = current.nested as Record<string, unknown>;
    }

    const result = redactObject(deepObj);
    // 第一层应该正常
    expect(result.name).toBe("level0");
    // 深层应该被截断，显示 [MAX_DEPTH_EXCEEDED]
    expect(JSON.stringify(result)).toContain("[MAX_DEPTH_EXCEEDED]");
  });

  it("null 和 undefined 值保持原样", () => {
    const obj = { password: null, apiKey: undefined, name: "test" };
    const result = redactObject(obj);
    expect(result).toEqual({ password: null, apiKey: undefined, name: "test" });
  });

  it("原始类型直接返回", () => {
    expect(redactObject("string")).toBe("string");
    expect(redactObject(123)).toBe(123);
    expect(redactObject(true)).toBe(true);
    expect(redactObject(null)).toBeNull();
    expect(redactObject(undefined)).toBeUndefined();
  });

  it("所有敏感字段模式", () => {
    const obj = {
      secret: "s1",
      apiKey: "k1",
      auth: "a1",
      token: "t1",
      password: "p1",
      passwd: "pw1",
      credential: "c1",
      privateKey: "pk1",
      accessKey: "ak1",
      accessToken: "at1",
      refreshToken: "rt1",
    };
    const result = redactObject(obj);

    // 所有敏感字段应该被脱敏
    expect(result.secret).toBe("****");
    expect(result.apiKey).toBe("****");
    expect(result.auth).toBe("****");
    expect(result.token).toBe("****");
    expect(result.password).toBe("****");
    expect(result.passwd).toBe("****");
    expect(result.credential).toBe("****");
    expect(result.privateKey).toBe("****");
    expect(result.accessKey).toBe("****");
    expect(result.accessToken).toBe("****");
    expect(result.refreshToken).toBe("****");
  });
});
