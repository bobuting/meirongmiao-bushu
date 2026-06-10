---
name: database-comparison-key
description: 数据库比较时 nrm_provider_policies 使用 route_key 作为唯一标识
type: reference
originSessionId: eaf8ec6a-fcb5-4f0e-999e-0ae758549abc
---
# 数据库比较唯一标识

**nrm_provider_policies 表比较时使用 `route_key` 作为唯一标识，而不是 `id`。**

## 原因

- `id` 是 UUID，不同数据库的同一业务记录会有不同的 UUID
- `route_key` 是业务唯一标识，如 `step2_five_view_generation_child`、`outfit_change_image_generation`
- 同一 `route_key` 在不同库中可能对应不同的 `id`，但代表同一业务路由策略

## 其他表

| 表 | 唯一标识 |
|---|---------|
| nrm_provider_policies | route_key |
| nrm_providers | id (UUID) 或 name |
| nrm_provider_secrets | provider_id |
