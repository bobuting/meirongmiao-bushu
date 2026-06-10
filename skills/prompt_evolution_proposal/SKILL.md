---
code: prompt_evolution_proposal
name: 提示词进化提案
description: 接收质量进化信号，调用 LLM 生成改进版 Prompt 提案
category: evolution
tags: [prompt, evolution, proposal]
version: 1.0.0
author: system
defaultVariant: default
includes:
  rules: []
---

# 提示词进化提案

根据质量信号数据和当前提示词内容，生成改进版提示词提案。
输出严格 JSON 格式，包含 rationale（改进理由）和 proposed_content（改进后内容）。
