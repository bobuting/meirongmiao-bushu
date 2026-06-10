---
name: deletion-confirmation
description: 删除操作必须逐表确认，不能自动判断范围
type: feedback
originSessionId: a15ac65d-4a84-4824-8f6b-5aa3473ecb0d
---
删除操作必须逐表向用户确认范围，不能自行推断"相关数据都该清"。即使指令笼统（如"清任务"），也要明确问清楚：删哪个表、删哪些记录、保留哪些。特别是有疑问的地方（如多张相关表），必须先问再动手。

**Why:** 误删 video_scenes 数据，用户只想清 job 表，但我没问清楚就两表一起删了。

**How to apply:** 任何 DELETE 操作前，列出涉及的所有表和记录数，逐一确认是否删除，不做自动判断。