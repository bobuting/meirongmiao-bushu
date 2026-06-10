---
code: hot_trend_filter
name: 热点内容审核
description: 判断热点话题是否适合用于电商短视频创作，过滤政治敏感、负面八卦等不适合的内容
category: hot_trend
tags: [hot-trend, filter, moderation]
version: 1.0.0
author: system
defaultVariant: default
includes:
  rules: []
---

# 热点内容审核

审核热点话题是否适合电商短视频创作。适合的保留，不适合的（政治敏感、负面八卦等）过滤掉。
返回 JSON 格式的审核结果列表。
