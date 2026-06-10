---
name: simple-question-fast-answer
description: 简单问题快速回答，不要过度搜索
type: feedback
originSessionId: 1e11ab3a-19df-484f-a598-236999f79714
---
简单问题（如确认某个配置值、某个函数的默认参数等）只需要 1-2 次 grep 定位关键行，直接给出答案，不要层层展开搜索。

**Why:** 用户问"现在是 720p 还是 1080"这种问题，期望秒回，不需要把整个调用链翻一遍。
**How to apply:** 判断问题复杂度——如果能用一次 grep 解决，搜到关键行就回，不要继续追上下文。
