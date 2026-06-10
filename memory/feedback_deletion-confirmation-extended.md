---
name: deletion-confirmation-extended
description: 区分用户的删除指令和问题描述，问题描述不等于删除授权
type: feedback
originSessionId: 33a307c7-18d5-4768-88eb-88d5066b698c
---
用户之前的删除指令完成后，后续操作不再自动授权删除。用户描述问题现象（如"还是秒生成"）≠ 要求删除，只是报告问题。发现根因后，必须先说明发现和修复方案，等用户确认后再执行数据库修改。

**Why:** 用户要求回退（明确删除指令），我执行了。但回退后用户说"还是秒生成"只是在描述问题现象，我却在定位根因后自作主张直接清除了 script_data.shot_prompts 字段，没有等用户确认。

**How to apply:** 
1. 用户的删除指令只覆盖当时那次操作，不延伸到后续修复
2. 用户描述问题 ≠ 授权修复，定位根因后先汇报方案再等确认
3. 涉及数据库 DELETE/UPDATE 操作时，用 AskUserQuestion 让用户确认
