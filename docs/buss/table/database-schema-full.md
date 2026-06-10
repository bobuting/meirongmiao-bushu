# 数据库完整参考文档

> 本文档由脚本自动生成，包含所有 nrm_ 表的完整列定义、注释和外键关系。
> 生成时间: 2026-04-28T16:07:32.060Z

---

## 目录

1. [nrm_aesthetic_feature_library](#nrm_aesthetic_feature_library)
2. [nrm_aesthetic_update_logs](#nrm_aesthetic_update_logs)
3. [nrm_announcements](#nrm_announcements)
4. [nrm_async_jobs](#nrm_async_jobs)
5. [nrm_audit_logs](#nrm_audit_logs)
6. [nrm_business_configs](#nrm_business_configs)
7. [nrm_character_five_views](#nrm_character_five_views)
8. [nrm_config](#nrm_config)
9. [nrm_credits](#nrm_credits)
10. [nrm_dead_letters](#nrm_dead_letters)
11. [nrm_emotion_archetype_library](#nrm_emotion_archetype_library)
12. [nrm_emotion_archetype_library_run_logs](#nrm_emotion_archetype_library_run_logs)
13. [nrm_error_logs](#nrm_error_logs)
14. [nrm_file_registry](#nrm_file_registry)
15. [nrm_final_videos](#nrm_final_videos)
16. [nrm_fission_task_items](#nrm_fission_task_items)
17. [nrm_fission_video_status](#nrm_fission_video_status)
18. [nrm_fission_videos](#nrm_fission_videos)
19. [nrm_functional_routes](#nrm_functional_routes)
20. [nrm_garment_assets](#nrm_garment_assets)
21. [nrm_golden_script_examples](#nrm_golden_script_examples)
22. [nrm_hot_trend_assets](#nrm_hot_trend_assets)
23. [nrm_hot_trend_daily_report](#nrm_hot_trend_daily_report)
24. [nrm_hot_trend_effect_tracking](#nrm_hot_trend_effect_tracking)
25. [nrm_hot_trend_sync_logs](#nrm_hot_trend_sync_logs)
26. [nrm_library_assets](#nrm_library_assets)
27. [nrm_library_characters](#nrm_library_characters)
28. [nrm_library_script_versions](#nrm_library_script_versions)
29. [nrm_library_scripts](#nrm_library_scripts)
30. [nrm_migrations](#nrm_migrations)
31. [nrm_model_photos](#nrm_model_photos)
32. [nrm_outfit_change_projects](#nrm_outfit_change_projects)
33. [nrm_outfit_plans](#nrm_outfit_plans)
34. [nrm_page_sections](#nrm_page_sections)
35. [nrm_project_characters](#nrm_project_characters)
36. [nrm_project_garment_assoc](#nrm_project_garment_assoc)
37. [nrm_project_outfit_plans](#nrm_project_outfit_plans)
38. [nrm_project_script_assoc](#nrm_project_script_assoc)
39. [nrm_project_video_musics](#nrm_project_video_musics)
40. [nrm_projects](#nrm_projects)
41. [nrm_prompt_call_logs](#nrm_prompt_call_logs)
42. [nrm_prompt_evolution_proposals](#nrm_prompt_evolution_proposals)
43. [nrm_prompt_version_metrics](#nrm_prompt_version_metrics)
44. [nrm_provider_call_audits](#nrm_provider_call_audits)
45. [nrm_provider_policies](#nrm_provider_policies)
46. [nrm_provider_secrets](#nrm_provider_secrets)
47. [nrm_providers](#nrm_providers)
48. [nrm_public_resources](#nrm_public_resources)
49. [nrm_reverse_attempts](#nrm_reverse_attempts)
50. [nrm_reverse_storyboard_library](#nrm_reverse_storyboard_library)
51. [nrm_reverse_storyboard_library_versions](#nrm_reverse_storyboard_library_versions)
52. [nrm_reverse_tasks](#nrm_reverse_tasks)
53. [nrm_reverse_traces](#nrm_reverse_traces)
54. [nrm_review_requests](#nrm_review_requests)
55. [nrm_role_direction_cards](#nrm_role_direction_cards)
56. [nrm_script_data](#nrm_script_data)
57. [nrm_script_quality_scores](#nrm_script_quality_scores)
58. [nrm_section_versions](#nrm_section_versions)
59. [nrm_sessions](#nrm_sessions)
60. [nrm_shot_breakdown](#nrm_shot_breakdown)
61. [nrm_shot_prompts](#nrm_shot_prompts)
62. [nrm_smart_storyboard_library](#nrm_smart_storyboard_library)
63. [nrm_smart_storyboard_library_versions](#nrm_smart_storyboard_library_versions)
64. [nrm_source_credentials](#nrm_source_credentials)
65. [nrm_square_behavior_logs](#nrm_square_behavior_logs)
66. [nrm_square_publish_requests](#nrm_square_publish_requests)
67. [nrm_square_templates](#nrm_square_templates)
68. [nrm_square_user_works](#nrm_square_user_works)
69. [nrm_step3_frame_images](#nrm_step3_frame_images)
70. [nrm_step4_video_scenes](#nrm_step4_video_scenes)
71. [nrm_step_prompt](#nrm_step_prompt)
72. [nrm_themes](#nrm_themes)
73. [nrm_trend_entries](#nrm_trend_entries)
74. [nrm_trend_sync_jobs](#nrm_trend_sync_jobs)
75. [nrm_user_script_assoc](#nrm_user_script_assoc)
76. [nrm_user_square_preferences](#nrm_user_square_preferences)
77. [nrm_user_theme_preferences](#nrm_user_theme_preferences)
78. [nrm_users](#nrm_users)
79. [nrm_video_musics](#nrm_video_musics)
80. [nrm_video_script_assoc](#nrm_video_script_assoc)

---

## 外键关系汇总

| 表 | 列 | 引用 |
|------|------|------|
| nrm_character_five_views | character_id | nrm_library_characters(id) |
| nrm_library_characters | active_five_view_id | nrm_character_five_views(id) |
| nrm_project_garment_assoc | garment_asset_id | nrm_garment_assets(id) |
| nrm_project_garment_assoc | project_id | nrm_projects(id) |
| nrm_project_video_musics | music_id | nrm_video_musics(id) |
| nrm_project_video_musics | project_id | nrm_projects(id) |
| nrm_square_publish_requests | user_id | nrm_users(id) |
| nrm_square_publish_requests | reviewer_id | nrm_users(id) |
| nrm_square_publish_requests | project_id | nrm_projects(id) |
| nrm_user_square_preferences | user_id | nrm_users(id) |

---

## nrm_aesthetic_feature_library

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() |  |
| feature_category | character varying(80) | NO |  | 细化特征类别 |
| feature_name | character varying(100) | NO |  | 特征名称 |
| feature_description | text | YES |  | 详细描述（用于注入提示词） |
| ethnicity_applicable | ARRAY | YES |  | 适用种族数组 |
| age_range | character varying(20) | YES |  | 年龄段 |
| popularity_score | numeric(3) | YES | 0.5 | 流行度评分（0.0-1.0） |
| trend_period | character varying(50) | YES |  | 趋势周期 |
| source | character varying(50) | YES |  | 数据来源 |
| source_metadata | jsonb | YES |  | 来源元数据 |
| created_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint |  |
| updated_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint |  |
| is_active | boolean | YES | true | 是否活跃 |
| feature_category_cn | character varying(100) | YES |  | 特征分类中文名 |
| feature_name_cn | character varying(200) | YES |  | 特征名称中文名 |
| feature_description_cn | text | YES |  | 特征描述中文 |
| source_image_url | text | YES |  |  |
| oss_image_url | text | YES |  |  |

## nrm_aesthetic_update_logs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() | 主键 |
| trigger_type | character varying(20) | NO | 'scheduled'::character varying | 触发方式：scheduled=定时任务, manual=手动触发 |
| status | character varying(20) | NO | 'running'::character varying | 执行状态：running=运行中, success=成功, failed=失败, skipped=跳过 |
| age_range | character varying(20) | YES |  | 年龄范围：0-1/2-3/4-6/7-12/13-17/18-25/26-30，NULL=全部 |
| xiaohongshu_count | integer(32) | NO | 0 | 小红书爬取数量 |
| instagram_count | integer(32) | NO | 0 | Instagram 爬取数量 |
| features_updated | integer(32) | NO | 0 | 新增/更新特征数量 |
| duration_ms | integer(32) | NO | 0 | 执行耗时（毫秒） |
| error_message | text | YES |  | 错误信息 |
| started_at | timestamp with time zone | NO | now() | 开始时间 |
| finished_at | timestamp with time zone | YES |  | 结束时间 |
| created_at | timestamp with time zone | NO | now() | 记录创建时间 |
| weibo_count | integer(32) | YES | 0 |  |
| douyin_count | integer(32) | YES | 0 |  |

## nrm_announcements

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  |  |
| title | text | NO |  |  |
| content | text | NO |  |  |
| status | text | NO | 'draft'::text |  |
| published_at | bigint(64) | YES |  |  |
| sort_order | integer(32) | NO | 0 |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |

## nrm_async_jobs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  |  |
| user_id | character varying(256) | NO |  |  |
| input | text | NO |  |  |
| status | character varying(20) | NO | 'pending'::character varying |  |
| stage | character varying(20) | YES |  |  |
| result | jsonb | YES |  |  |
| error | jsonb | YES |  |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| job_type | character varying(40) | NO | 'llm_reverse'::character varying |  |
| project_id | character varying(256) | YES |  |  |
| visible_to_user | boolean | NO | true | 是否对用户可见，后台系统任务设为 false |
| parent_job_id | character varying(256) | YES |  | 父任务ID，NULL表示顶层任务 |
| depends_on | ARRAY | YES |  | 依赖的job id数组，全部completed后才可promote |

## nrm_audit_logs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 日志唯一标识 |
| payload_hash | text | YES |  | 数据哈希值 |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| actor_user_id | text | YES |  | 操作者用户ID |
| action | text | YES |  | 操作类型 |
| target_id | text | YES |  | 目标资源ID |
| created_at | bigint(64) | YES |  | 创建时间戳 |
| meta_json | text | YES |  |  |

## nrm_business_configs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 module | character varying(64) | NO |  | 配置模块标识 |
| config_json | jsonb | NO | '{}'::jsonb | 配置内容(JSONB) |
| description | text | YES |  | 配置说明 |
| created_at | bigint(64) | NO |  | 创建时间(毫秒时间戳) |
| updated_at | bigint(64) | NO |  | 更新时间(毫秒时间戳) |
| updated_by | character varying(256) | YES |  | 最后修改人 |

## nrm_character_five_views

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 主键UUID |
| character_id → nrm_library_characters(id) | text | NO |  | 关联角色ID |
| image_url | text | YES |  | 五视图图片OSS地址 |
| status | text | NO | 'pending'::text | 状态：pending/processing/ready/failed |
| is_active | boolean | NO | false | 是否为激活版本 |
| prompt | text | YES |  | 生成提示词 |
| model | text | YES |  | 生成模型 |
| generation_params | jsonb | YES |  | 其他生成参数JSON |
| error_message | text | YES |  | 错误信息 |
| retry_count | integer(32) | YES | 0 | 重试次数 |
| created_at | bigint(64) | NO |  | 创建时间戳 |
| updated_at | bigint(64) | NO |  | 更新时间戳 |

## nrm_config

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 配置项唯一标识 |
| payload_json | jsonb | NO |  | 配置内容（JSONB） |
| payload_hash | text | YES |  | 配置内容哈希值 |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_credits

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 user_id | text | NO |  | 用户ID |
| balance | double precision(53) | NO | 0 | 积分余额 |
| expires_at | bigint(64) | NO |  | 积分过期时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |

## nrm_dead_letters

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 消息唯一标识 |
| type | text | NO |  | 消息类型 |
| resource_id | text | NO |  | 关联资源ID |
| reason | text | NO |  | 失败原因 |
| attempts | integer(32) | NO | 0 | 重试次数 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| meta | jsonb | YES |  | 元数据（JSONB） |

## nrm_emotion_archetype_library

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(50) | NO |  |  |
| name | character varying(100) | NO |  |  |
| category | character varying(50) | NO |  |  |
| emotion_core | character varying(100) | NO |  |  |
| moment | text | YES |  |  |
| conflict | text | YES |  |  |
| clothing_role | text | YES |  |  |
| visual_cues | jsonb | YES | '[]'::jsonb |  |
| duration | character varying(20) | YES |  |  |
| shot_count | integer(32) | YES |  |  |
| sync_mode | character varying(50) | YES |  |  |
| suitable_styles | jsonb | YES | '[]'::jsonb |  |
| suitable_age | jsonb | YES | '[]'::jsonb |  |
| suitable_gender | jsonb | YES | '[]'::jsonb |  |
| popularity_score | numeric(3) | YES | 0.7 |  |
| use_count | integer(32) | YES | 0 |  |
| avg_user_rating | numeric(3) | YES |  |  |
| last_used_at | bigint(64) | YES |  |  |
| is_active | boolean | YES | true |  |
| source | character varying(50) | YES | 'manual'::character varying |  |
| source_metadata | jsonb | YES | '{}'::jsonb |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| description | text | YES | ''::text |  |

## nrm_emotion_archetype_library_run_logs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | integer(32) | NO | nextval('nrm_emotion_archetype_library_run_logs_id_seq'::regclass) |  |
| run_type | character varying(30) | NO |  | 运行类型：scheduled_update=调度任务, archetype_usage=原型使用 |
| trigger_type | character varying(20) | NO | 'scheduled'::character varying | 触发类型：scheduled=定时触发, manual=手动触发 |
| status | character varying(20) | NO | 'running'::character varying | 执行状态：running=运行中, completed=已完成, failed=失败 |
| task_results | jsonb | YES |  | 各子任务结果详情(JSONB) |
| archetype_id | character varying(100) | YES |  | 原型使用记录关联的原型ID |
| project_id | character varying(100) | YES |  | 原型使用记录关联的项目ID |
| error_message | text | YES |  | 失败时的错误信息 |
| duration_ms | integer(32) | YES |  | 执行耗时(毫秒) |
| started_at | bigint(64) | NO |  | 开始时间戳(ms) |
| completed_at | bigint(64) | YES |  | 完成时间戳(ms) |
| created_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint | 创建时间戳(ms) |

## nrm_error_logs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() | 主键ID（UUID） |
| error_code | character varying(100) | NO |  | 错误码，用于分类统计 |
| error_message | text | NO |  | 错误消息 |
| error_stack | text | YES |  | 错误堆栈信息 |
| severity | character varying(20) | NO |  | 错误级别：error/warn/critical |
| created_at | bigint(64) | NO |  | 发生时间戳（毫秒） |
| user_id | uuid | YES |  | 用户ID |
| request_id | character varying(256) | YES |  | 请求ID，用于追踪 |
| api_path | character varying(200) | YES |  | API 路径 |
| source_module | character varying(100) | YES |  | 来源模块：hot-trend/square/square-replica |
| llm_model | character varying(100) | YES |  | LLM 模型名称 |
| llm_input | text | YES |  | LLM 输入内容 |
| llm_output | text | YES |  | LLM 输出内容 |
| project_id | uuid | YES |  | 项目ID |
| input_params | jsonb | YES |  | 输入参数（JSONB） |
| service_version | character varying(50) | YES |  | 服务版本号 |

## nrm_file_registry

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  | 记录 ID |
| uploader_id | character varying(256) | NO |  | 上传用户 ID |
| uploader_type | character varying(16) | NO | 'user'::character varying | 上传者类型：user/system/scheduler |
| storage_key | character varying(512) | NO |  | 存储路径（OSS Key 或本地路径） |
| storage_driver | character varying(16) | NO |  | 存储驱动：alioss/local |
| public_url | character varying(1024) | YES |  | 公开访问 URL |
| content_sha256 | character(64) | NO |  | 内容 SHA256 哈希，用于去重判断 |
| file_type | character varying(16) | NO |  | 文件类型：image/video/audio/document |
| content_type | character varying(128) | YES |  | MIME 类型 |
| file_size_bytes | bigint(64) | YES |  | 文件大小（字节） |
| file_name | character varying(256) | YES |  | 原始文件名 |
| business_domain | character varying(32) | YES |  | 业务域：project/library/square/hot_trend/fission |
| business_subdomain | character varying(32) | YES |  | 业务子域：step1_clothing/step2_character 等 |
| business_tags | jsonb | YES | '{}'::jsonb | 扩展业务标签 JSONB，存储关联实体 ID |
| ref_count | integer(32) | NO | 1 | 引用计数，零引用文件可安全删除 |
| first_ref_entity | character varying(256) | YES |  | 首次引用实体类型 |
| first_ref_entity_id | character varying(256) | YES |  | 首次引用实体 ID |
| environment | character varying(16) | NO | 'production' | 环境标识：test 或 production |
| created_at | bigint(64) | NO |  | 创建时间戳 |
| updated_at | bigint(64) | NO |  | 更新时间戳 |

## nrm_final_videos

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(36) | NO |  | 主键UUID |
| project_id | character varying(36) | NO |  | 项目ID |
| video_type | character varying(20) | NO |  | 成片类型: step4 | fission |
| video_url | text | NO |  | 视频URL |
| duration_sec | numeric(10) | YES |  | 视频时长(秒) |
| file_size | bigint(64) | YES |  | 文件大小(字节) |
| cover_image_url | text | YES |  | 封面图URL |
| background_music_url | text | YES |  | 背景音乐URL |
| background_music_title | character varying(255) | YES |  | 背景音乐标题 |
| transition_type | character varying(50) | YES |  | 转场类型 |
| transition_duration_ms | integer(32) | YES |  | 转场时长(毫秒) |
| storyboard_ids | text | YES |  | 分镜ID列表(JSON) |
| storyboard_urls | jsonb | YES |  | 分镜URL列表 |
| creator_id | character varying(36) | YES |  | 创建者ID |
| created_at | bigint(64) | NO |  | 创建时间戳 |
| updated_at | bigint(64) | NO |  | 更新时间戳 |
| is_deleted | boolean | NO | false | 是否已删除 |

## nrm_fission_task_items

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() |  |
| fission_video_status_id | uuid | NO |  |  |
| task_type | character varying(20) | NO |  |  |
| item_index | integer(32) | NO |  |  |
| image_url | text | YES |  |  |
| image_path | text | YES |  |  |
| image_status | character varying(20) | YES | 'pending'::character varying |  |
| image_error_message | text | YES |  |  |
| video_url | text | YES |  |  |
| video_path | text | YES |  |  |
| video_status | character varying(20) | YES | 'pending'::character varying |  |
| video_error_message | text | YES |  |  |
| retry_count | integer(32) | YES | 0 |  |
| created_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint |  |
| updated_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint |  |
| video_task_id | text | YES |  | LLM 视频生成任务ID，用于重试时查询已有结果 |

## nrm_fission_video_status

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 状态唯一标识 |
| project_id | text | NO |  | 关联项目ID |
| fission_count | integer(32) | YES | 0 | 裂变视频总数 |
| completed_count | integer(32) | YES | 0 | 已完成数量 |
| status | text | NO | '整理镜像'::text | 当前状态：整理镜像/生成视频/已完成 |
| consumed_credits | real(24) | YES | 0 | 消耗积分 |
| atmospheres | text | YES |  | 氛围标签 |
| new_story_json | jsonb | YES |  | 新故事配置（JSONB） |
| creator_id | text | NO |  | 创建者用户ID |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| error_msg | text | YES |  | 错误信息（追加模式，不替换） |
| image_video_total | integer(32) | YES | 0 |  |
| image_video_completed | integer(32) | YES | 0 |  |
| image_video_failed | integer(32) | YES | 0 |  |
| new_story_total | integer(32) | YES | 0 |  |
| new_story_completed | integer(32) | YES | 0 |  |
| new_story_failed | integer(32) | YES | 0 |  |
| new_story_async_status | character varying(20) | YES | 'pending'::character varying | 新故事异步状态: pending/processing/completed/failed |
| shot_prompts_async_status | character varying(20) | YES | 'pending'::character varying | 专业提示词异步状态: pending/processing/completed/failed |
| async_failed_stage | character varying(20) | YES |  | 失败的阶段: new_story/shot_prompts |
| async_error_message | text | YES |  | 异步任务错误信息 |
| new_story_script_id | text | YES |  | 新故事脚本ID（关联 nrm_script_data 表） |

## nrm_fission_videos

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 视频唯一标识 |
| project_id | text | NO |  | 关联项目ID |
| fission_type | text | NO |  | 裂变类型：ai_new_story/manual |
| thumbnail_url | text | YES |  | 缩略图URL |
| video_path | text | YES |  | 视频存储路径 |
| storyboard_ids | text | NO |  | 分镜ID列表（逗号分隔） |
| storyboard_urls | jsonb | YES |  | 分镜URLs（JSONB） |
| transition_info | jsonb | YES |  | 转场信息（JSONB） |
| audio_url | text | YES |  | 背景音乐URL |
| duration_sec | integer(32) | YES |  | 视频时长（秒） |
| speed | real(24) | YES | 1.0 | 播放速度 |
| status | text | NO | 'pending'::text | 状态：pending/processing/completed/failed |
| error_message | text | YES |  | 错误信息 |
| creator_id | text | NO |  | 创建者用户ID |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| is_deprecated | boolean | NO | false | 是否弃用 |
| deprecated_at | bigint(64) | YES |  | 弃用时间戳（毫秒） |
| deprecated_by | text | YES |  | 弃用操作者ID |

## nrm_functional_routes

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 路由配置 ID |
| functional_key | text | NO |  | 功能类型：text_to_text, image_to_text, video_to_text, text_to_image, image_to_image, text_to_video, image_to_video, video_to_video |
| provider_id | text | NO |  | 主 Provider ID |
| fallback_provider_ids | jsonb | YES | '[]'::jsonb | 备用 Provider ID 列表 |
| enabled | boolean | NO | true | 是否启用 |
| created_at | bigint(64) | NO |  | 创建时间戳 |
| updated_at | bigint(64) | NO |  | 更新时间戳 |

## nrm_garment_assets

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 主键ID |
| user_id | text | NO |  | 用户ID，公共资产使用 "system" |
| name | text | NO |  | 服饰名称 |
| type | text | NO |  | 类型：image / video |
| category | text | NO |  | 服装类别：top / bottom / shoes / accessory |
| main_image_url | text | NO |  | 主图URL |
| sub_image_url_1 | text | YES |  | 副图1 URL |
| sub_image_url_2 | text | YES |  | 副图2 URL |
| sub_image_url_3 | text | YES |  | 副图3 URL |
| size_mb | numeric(8) | YES |  | 文件大小（MB） |
| ai_category | text | YES |  |  |
| ai_view_label | text | YES |  |  |
| ai_confidence | numeric(4) | YES |  |  |
| ai_reason | text | YES |  |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| deleted_at | bigint(64) | YES |  |  |
| deleted_by | text | YES |  |  |
| source | text | YES |  | 来源：manual / step1-upload / step1-module |
| description | text | YES |  | 服饰描述 |
| main_color | text | YES |  | 主色 |
| material | text | YES |  | 材质 |
| pattern | text | YES |  | 图案 |
| fit | text | YES |  | 版型 |
| length | text | YES |  | 长度 |
| neckline | text | YES |  | 领型 |
| sleeve | text | YES |  | 袖型 |
| style | text | YES |  | 风格 |
| occasion | text | YES |  | 场合 |
| flat_lay_image_url | text | YES |  | AI 生成的服饰正反面平铺图 URL |
| masked_image_url | text | YES |  | 遄罩预处理后的图片URL（webp格式，用于排查logo误遮盖问题） |
| selling_points | jsonb | YES |  |  |
| garment_regions | jsonb | YES |  | 检测到的服饰区域（用于平铺图遮罩预处理）|

## nrm_golden_script_examples

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() |  |
| title | text | NO |  |  |
| story_concept | text | NO |  |  |
| full_script | jsonb | NO | '{}'::jsonb |  |
| narrative_technique | text | NO |  |  |
| character_dynamic | text | NO |  |  |
| core_emotion | text | NO |  |  |
| scene_type | text | YES |  |  |
| tags | ARRAY | YES | '{}'::text[] |  |
| quality_score | smallint(16) | YES | 5 |  |
| is_active | boolean | YES | true |  |
| created_at | timestamp with time zone | YES | now() |  |

## nrm_hot_trend_assets

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 主键，格式：hottrend-{type}-{timestamp}-{rank} |
| topic | text | NO |  | 话题标题 |
| url | text | YES |  | 原始链接（抖音视频链接或话题链接） |
| rank | integer(32) | YES |  | 热榜排名 |
| hot_value | text | YES |  | 热度值 |
| section | text | YES |  | 榜单分类 |
| source | text | NO |  | 数据来源：tikhub/douhot/douyin-hot-hub |
| type | integer(32) | NO | 1 | 热榜类型：1=video, 2=realtime |
| script_id | text | YES |  | 关联 nrm_script_data.id（视频热榜 LLM 反推成功后填充） |
| source_oss_url | text | YES |  | OSS 视频链接（视频热榜异步上传后填充） |
| created_at | bigint(64) | NO |  | 创建时间戳（毫秒） |
| updated_at | bigint(64) | NO |  | 更新时间戳（毫秒） |
| trend_type | text | YES | 'realtime'::text | 热榜类型：realtime/video |
| date_window | text | YES | '24h'::text | 时间窗口 |
| normalized_key | text | YES |  | 标准化键 |
| item_id | text | YES |  | 平台条目ID |
| hash | text | YES |  | 内容哈希 |
| raw_payload | jsonb | YES |  | 原始数据（JSONB） |
| status | text | YES | 'raw'::text | 处理状态：pending/processed |
| video_title | text | YES |  |  |
| video_url | text | YES |  |  |
| audio_url | text | YES |  |  |
| create_time | bigint(64) | YES |  |  |
| play_count | bigint(64) | YES |  |  |
| comment_count | bigint(64) | YES |  |  |
| digg_count | bigint(64) | YES |  |  |
| share_count | bigint(64) | YES |  |  |
| collect_count | bigint(64) | YES |  |  |
| recommend_count | bigint(64) | YES |  |  |
| nickname | text | YES |  |  |
| duration | integer(32) | YES |  |  |
| script_text | text | YES |  |  |
| cover_url | text | YES |  | 封面图URL |

## nrm_hot_trend_daily_report

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | integer(32) | NO | nextval('nrm_hot_trend_daily_report_id_seq'::regclass) |  |
| report_date | date | NO |  | 报告日期 |
| platform_sources | ARRAY | YES |  | 数据来源平台列表 |
| hotspot_count | integer(32) | NO |  | 热点总数 |
| original_hotspots | jsonb | NO |  | Top N热点原始数据 |
| platform_distribution | jsonb | YES |  | 各平台热点数量分布 |
| raw_report_text | text | NO |  | LLM五段分析原文 |
| core_trends | jsonb | YES |  | 核心趋势提取 |
| outfit_angles | jsonb | YES |  | 穿搭切入点 |
| emotion_atmosphere | jsonb | YES |  | 情绪氛围 |
| avoid_topics | jsonb | YES |  | 规避话题 |
| creative_suggestions | jsonb | YES |  | 创意建议 |
| created_at | timestamp with time zone | YES | now() |  |
| updated_at | timestamp with time zone | YES | now() |  |

## nrm_hot_trend_effect_tracking

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | integer(32) | NO | nextval('nrm_hot_trend_effect_tracking_id_seq'::regclass) |  |
| hotspot_title | text | NO |  | 热点标题 |
| report_date | date | NO |  | 报告日期 |
| platform | text | NO |  | 来源平台 |
| was_selected_by_step3 | boolean | YES | false | 是否被Step3采用 |
| generated_video_count | integer(32) | YES | 0 | 生成的视频数量 |
| user_rating_avg | double precision(53) | YES |  | 用户评分均值 |
| script_quality_score | double precision(53) | YES |  | 脚本质量评分 |
| video_completion_rate | double precision(53) | YES |  | 视频完成率 |
| created_at | timestamp with time zone | YES | now() |  |

## nrm_hot_trend_sync_logs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() |  |
| trigger_type | character varying(20) | NO |  | 触发方式：scheduled=定时任务, manual=手动触发 |
| trend_type | character varying(20) | NO |  | 热榜类型：realtime=实时热榜, video=视频热榜 |
| status | character varying(20) | NO | 'running'::character varying | 运行状态：running=运行中, success=成功, failed=失败 |
| source | character varying(50) | YES |  | 数据来源 |
| topic_count | integer(32) | YES | 0 | 本次同步的话题数量 |
| duration_ms | integer(32) | YES | 0 | 运行耗时（毫秒） |
| error_message | text | YES |  | 错误信息 |
| started_at | timestamp with time zone | YES | now() |  |
| finished_at | timestamp with time zone | YES |  |  |
| created_at | timestamp with time zone | YES | now() |  |

## nrm_library_assets

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 资产唯一标识 |
| user_id | text | NO |  | 所有者用户ID |
| name | text | NO |  | 资产名称 |
| type | text | NO |  | 资产类型：clothing/accessory/shoes |
| category | text | NO |  | 服装分类：男装/女装/男童装/女童装 |
| url | text | NO |  | 资产图片URL |
| related_image_urls | jsonb | YES |  | 关联图片URLs（JSONB） |
| size_mb | double precision(53) | NO | 0 | 文件大小（MB） |
| tags | jsonb | NO | '[]'::jsonb | 标签（JSONB数组） |
| classification | jsonb | YES |  | AI分类结果（JSONB） |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_library_characters

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 角色唯一标识 |
| user_id | text | NO |  | 所有者用户ID |
| name | text | NO |  | 角色名称 |
| kind | text | NO |  | 角色类型：human/cartoon |
| status | text | NO | 'processing'::text | 状态：pending/ready/error |
| thumbnail_url | text | NO |  | 角色缩略图URL |
| tags | jsonb | NO | '[]'::jsonb | 标签（JSONB数组） |
| views | jsonb | YES |  | 五视图URLs（JSONB） |
| view_session | jsonb | YES |  | 视图生成会话信息（JSONB） |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| video_preview | text | YES |  | 视频预览URL |
| overall_impression | text | YES |  | 整体印象 |
| ethnicity | text | YES |  | 种族特征 |
| age | text | YES |  | 年龄段 |
| gender | text | YES |  | 性别 |
| style | text | YES |  | 风格 |
| body_type | text | YES |  | 体型 |
| face_shape | text | YES |  | 脸型 |
| facial_features | text | YES |  | 面部特征 |
| eyebrows | text | YES |  | 眉毛特征 |
| eyes | text | YES |  | 眼睛特征 |
| eye_expression | text | YES |  | 眼神表情 |
| nose | text | YES |  | 鼻子特征 |
| lips | text | YES |  | 嘴唇特征 |
| chin | text | YES |  | 下巴特征 |
| skin_tone | text | YES |  | 肤色 |
| hair_style | text | YES |  | 发型 |
| unique_features | text | YES |  | 独特特征 |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| five_view_oss_image_url | text | YES |  | 角色五视图图板 OSS 图片地址 |
| active_five_view_id → nrm_character_five_views(id) | text | YES |  | 当前激活的五视图记录ID，关联nrm_character_five_views |

## nrm_library_script_versions

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 版本唯一标识 |
| script_id | text | NO |  | 关联脚本ID |
| user_id | text | NO |  | 用户ID |
| version | integer(32) | NO |  | 版本号 |
| title | text | NO |  | 版本标题 |
| tags | jsonb | NO | '[]'::jsonb | 标签（JSONB数组） |
| content | text | NO |  | 版本内容 |
| type | integer(32) | YES |  | 脚本类型 |
| reverse_context | jsonb | YES |  | 反推上下文（JSONB） |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |

## nrm_library_scripts

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 脚本唯一标识 |
| user_id | text | NO |  | 所有者用户ID |
| title | text | NO |  | 脚本标题 |
| tags | jsonb | NO | '[]'::jsonb | 标签（JSONB数组） |
| content | text | NO |  | 脚本内容 |
| type | integer(32) | YES |  | 脚本类型：1-短视频/2-长视频 |
| reverse_context | jsonb | YES |  | 反推上下文（JSONB） |
| current_version | integer(32) | NO | 1 | 当前版本号 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |

## nrm_migrations

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 filename | text | NO |  | 迁移脚本文件名 |
| applied_at | bigint(64) | NO |  | 执行时间（毫秒时间戳） |

## nrm_model_photos

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  |  |
| project_id | text | NO |  |  |
| image_url | text | YES |  |  |
| pose_label | text | YES |  |  |
| bg_label | text | YES |  |  |
| is_selected | boolean | YES | false |  |
| status | text | YES | 'pending'::text |  |
| error_message | text | YES |  |  |
| sort_order | integer(32) | YES | 0 |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |

## nrm_outfit_change_projects

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 task_id | character varying(64) | NO |  | 项目唯一标识 |
| input_json | jsonb | NO |  | 输入参数 JSON |
| status | character varying(32) | NO | 'pending'::character varying | 项目状态 |
| stage0_result_json | jsonb | YES |  | Stage 0 参考图采集结果 |
| stage1_result_json | jsonb | YES |  | Stage 1 视频理解结果 |
| stage2_result_json | jsonb | YES |  | Stage 2 角色服装适配结果 |
| stage3_result_json | jsonb | YES |  | Stage 3 视频生成结果 |
| error_message | text | YES |  | 错误信息 |
| created_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint | 创建时间戳（毫秒） |
| updated_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint | 更新时间戳（毫秒） |
| project_id | text | YES |  | 关联项目ID，用于查询draft记录 |
| user_id | text | YES |  | 用户ID |
| source_video_url | text | YES |  | 源视频URL，Step1选择后即持久化（与 builtin_template_id 二选一） |
| builtin_template_id | text | YES |  | 内置动作模板ID，关联 nrm_action_tables，Step1选择后即持久化（与 source_video_url 二选一） |
| target_outfit_id | text | YES |  | 目标服装ID，Step2选择后即持久化 |
| character_id | text | YES |  | 目标角色ID，Step3选择后即持久化 |

## nrm_outfit_plans

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 方案唯一标识 |
| project_id | text | NO |  | 关联项目ID |
| user_id | text | NO |  | 用户ID |
| asset_ids | jsonb | NO | '[]'::jsonb | 搭配资产ID列表（JSONB数组） |
| index | integer(32) | NO | 0 | 方案序号 |
| title | text | YES |  | 方案标题 |
| reason | text | YES |  | 推荐理由 |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| garment_asset_id | character varying(256) | YES |  |  |
| style_name | character varying(50) | YES |  |  |
| analysis | text | YES |  |  |
| optimized_prompt | text | YES |  |  |
| analysis_prompt | text | YES |  |  |
| slot_descriptions | jsonb | YES | '{}'::jsonb |  |
| trend_summary | text | YES |  |  |
| grounding_sources | jsonb | YES | '[]'::jsonb |  |
| items | jsonb | YES |  | 服饰单品数组，包含类型、名称、风格、描述 |
| suitable_scene | text | YES |  |  |
| tags | jsonb | YES | '[]'::jsonb |  |

## nrm_page_sections

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  |  |
| project_id | text | NO |  |  |
| section_key | text | NO |  |  |
| section_type | text | NO |  |  |
| title | text | YES |  |  |
| goal | text | YES |  |  |
| copy | text | YES |  |  |
| visual_prompt | text | YES |  |  |
| sort_order | integer(32) | YES | 0 |  |
| status | text | YES | 'idle'::text |  |
| current_image_asset_id | text | YES |  |  |
| editable_data | jsonb | YES |  |  |
| display_config | jsonb | YES | NULL | 文字显示配置（旧机制） |
| layout_config | jsonb | YES | NULL | 排版配置（图形元素 + 文字位置） |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| deleted_at | bigint(64) | YES |  |  |
| deleted_by | text | YES |  |  |

## nrm_project_characters

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  |  |
| project_id | character varying(256) | NO |  | 项目ID |
| library_character_id | character varying(256) | NO |  | 角色库角色ID |
| role | character varying(32) | NO | 'main'::character varying | 角色用途：main（主角色）/ secondary（配角） |
| is_selected | boolean | YES | false | 是否为项目当前选中的角色 |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| deleted_at | bigint(64) | YES |  | 软删除时间戳 |
| source_type | character varying | YES | 'library'::character varying |  |
| deleted_by | character varying | YES |  |  |
| generation_slot | integer(32) | YES |  |  |

## nrm_project_garment_assoc

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  |  |
| project_id → nrm_projects(id) | text | NO |  |  |
| garment_asset_id → nrm_garment_assets(id) | text | NO |  |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| user_id | text | YES |  | 用户ID |
| file_name | text | YES |  | 文件名 |
| size_mb | numeric | YES |  | 文件大小（MB） |
| image_url | text | YES |  | 图片URL |
| category | text | YES |  |  |

## nrm_project_outfit_plans

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  |  |
| project_id | character varying(256) | NO |  |  |
| outfit_plan_id | character varying(256) | NO |  |  |
| selected | boolean | YES | false |  |
| created_at | bigint(64) | NO |  |  |

## nrm_project_script_assoc

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 主键 |
| project_id | text | NO |  | 项目ID |
| script_data_id | text | NO |  | 脚本数据ID（nrm_script_data） |
| version | integer(32) | NO | 1 | 脚本版本号 |
| is_active | boolean | NO | true | 是否为当前活跃版本 |
| created_at | bigint(64) | NO |  | 创建时间戳（毫秒） |
| updated_at | bigint(64) | NO |  | 更新时间戳（毫秒） |

## nrm_project_video_musics

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  |  |
| project_id → nrm_projects(id) | character varying(256) | NO |  |  |
| music_id → nrm_video_musics(id) | character varying(256) | NO |  |  |
| music_url | text | NO |  |  |
| volume | numeric(3) | YES | 0.5 |  |
| fade_in_sec | numeric(5) | YES | 0 |  |
| fade_out_sec | numeric(5) | YES | 0 |  |
| is_selected | boolean | NO | false |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| title | text | YES |  |  |
| atmospheres | jsonb | YES | '[]'::jsonb |  |
| artist | text | YES |  |  |
| duration_sec | integer(32) | YES |  |  |
| cover_url | text | YES |  |  |

## nrm_projects

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 项目唯一标识（UUID） |
| user_id | text | NO |  | 项目所有者用户ID |
| name | text | NO |  | 项目名称 |
| status | text | NO | 'DRAFT'::text | 项目状态：draft/step1/step2/step3/step4/step5/published |
| selected_outfit_plan_id | text | YES |  | 选中的服装搭配方案ID |
| selected_character_preview_id | text | YES |  | 选中的角色预览ID |
| thumbnail_url | text | NO | ''::text | 项目封面图URL |
| format_label | text | NO | '9:16'::text | 视频格式标签 |
| duration_sec | integer(32) | NO | 30 | 视频时长（秒） |
| views | integer(32) | NO | 0 | 浏览次数 |
| last_visited_step | integer(32) | NO | 1 | 最后访问的步骤（1-5） |
| last_reverse_task_id | text | YES |  | 最后一次反推任务ID |
| last_reverse_script_version_id | text | YES |  | 最后一次反推脚本版本ID |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| project_kind | character varying(20) | NO | 'video'::character varying | 项目类型：image 或 video，创建时默认 video |
| export_url | text | YES |  | Step5 视频导出 URL |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| active_script_id | character varying(256) | YES |  | 当前确认/锁定的脚本ID，关联 nrm_script_data.id（反推改写和脚本确认时写入） |
| selected_character_id | character varying(256) | YES |  | 当前选中的角色库角色ID |
| selected_role_direction | jsonb | YES |  |  |
| reverse_script_id | character varying(256) | YES |  | 反推脚本ID（仅反推类型项目），关联 nrm_script_data.id |
| cover_image_url | text | YES |  | 项目封面图片URL，用于Step4封面展示 |
| publish_title | text | YES |  | Step5 发布标题（用户选择或编辑后的标题） |
| video_cover_image_url | text | YES |  | 视频项目封面URL（Step4视频封面） |

## nrm_prompt_call_logs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  | 日志唯一标识 |
| template_id | character varying(256) | YES |  | 模板ID |
| template_code | character varying(100) | YES |  | 模板编码 |
| version | integer(32) | YES |  | 版本号 |
| input_variables | jsonb | YES |  | 输入变量，敏感信息需脱敏 |
| rendered_content | text | YES |  | 渲染后内容 |
| llm_vendor | character varying(50) | YES |  | LLM供应商 |
| llm_model | character varying(100) | YES |  | LLM模型 |
| success | boolean | NO |  | 是否成功 |
| response_time_ms | integer(32) | YES |  | 响应时间（毫秒） |
| token_input | integer(32) | YES |  | 输入Token数 |
| token_output | integer(32) | YES |  | 输出Token数 |
| error_message | text | YES |  | 错误信息 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| project_id | character varying(256) | YES |  | 项目ID |
| user_id | character varying(256) | YES |  | 用户ID |

## nrm_prompt_evolution_proposals

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  | 提案 ID |
| prompt_code | character varying(80) | NO |  | 关联的 prompt 模板 code |
| source_version | character varying(20) | NO |  | 源版本号 |
| proposed_content | text | NO |  | LLM 生成的新版 prompt 内容 |
| rationale | text | YES |  | LLM 给出的改进理由 |
| signal_type | character varying(40) | NO |  | 触发信号类型：low_avg_score | declining_trend | high_weakness_frequency |
| signal_details | jsonb | YES |  | 信号详情 JSON |
| status | character varying(20) | NO | 'draft'::character varying | 状态：draft | ab_testing | published | rejected |
| ab_test_version | character varying(20) | YES |  | A/B 测试版本号 |
| ab_test_metrics | jsonb | YES |  | A/B 测试指标 |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |
| reviewed_by | text | YES |  | 审批人 |
| reviewed_at | bigint(64) | YES |  | 审批时间戳 ms |
| review_notes | text | YES |  | 审批备注 |

## nrm_prompt_version_metrics

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  |  |
| prompt_code | character varying(80) | NO |  | Prompt 模板 code |
| prompt_version | character varying(20) | NO |  | 版本号 |
| sample_count | integer(32) | NO | 0 | 样本数量 |
| avg_score | numeric(5) | NO | 0 | 平均综合评分 |
| min_score | integer(32) | NO | 0 |  |
| max_score | integer(32) | NO | 0 |  |
| avg_viewer_score | numeric(5) | YES |  |  |
| avg_director_score | numeric(5) | YES |  |  |
| avg_strategist_score | numeric(5) | YES |  |  |
| pass_rate | numeric(5) | YES | 0 | 通过率（score >= 70） |
| common_weaknesses | jsonb | YES |  | 高频弱项 JSON 数组 |
| common_suggestions | jsonb | YES |  |  |
| computed_at | bigint(64) | NO |  |  |

## nrm_provider_call_audits

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 审计记录唯一标识 |
| payload_hash | text | YES |  | 数据哈希值 |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| provider_id | text | YES |  | Provider ID |
| route_key | text | YES |  | 路由键 |
| request_id | text | YES |  | 请求ID |
| status | text | YES |  | 状态 (pending/success/error/timeout) |
| latency_ms | integer(32) | YES |  | 延迟毫秒 |
| timeout_ms | integer(32) | YES |  | 超时设置 |
| slow_request | boolean | YES |  | 是否慢请求 |
| cost | double precision(53) | YES |  | 成本 |
| error_code | text | YES |  | 错误码 |
| error_message | text | YES |  | 错误信息 |
| request_summary | text | YES |  | 请求摘要 |
| response_summary | text | YES |  | 响应摘要 |
| created_at | bigint(64) | YES |  | 创建时间戳 |
| call_context | text | YES |  | 调用上下文 |
| messages_json | text | YES |  | 消息 JSON |
| query_params_json | text | YES |  | 查询参数 JSON |
| actual_model | text | YES |  | 实际模型 |
| provider_vendor | text | YES |  | 提供商厂商 |
| provider_base_url | text | YES |  | 提供商基础 URL |
| input_tokens | integer(32) | YES |  | 输入 token 数 |
| output_tokens | integer(32) | YES |  | 输出 token 数 |
| ttft_ms | integer(32) | YES |  | 首 token 时间 (毫秒) |
| project_id | text | YES |  | 项目 ID |
| user_id | text | YES |  | 用户 ID |
| async_job_id | text | YES |  | 异步任务 ID |
| attempts_json | text | YES |  | 重试记录 JSON |
| actual_endpoint | text | YES |  | 实际调用的完整 API URL（endpoint） |
| request_body_json | text | YES |  | 请求体 JSON |
| request_headers_json | text | YES |  | 请求头 JSON |
| call_mode | character varying(50) | YES |  | 调用模式 |

## nrm_provider_policies

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 策略唯一标识 |
| route_key | text | NO |  | 路由键 |
| primary_provider_id | text | NO |  | 主Provider ID |
| fallback_provider_ids | jsonb | NO | '[]'::jsonb | 备选Provider IDs（JSONB数组） |
| timeout_ms | integer(32) | NO | 30000 | 超时时间（毫秒） |
| retry_count | integer(32) | NO | 0 | 重试次数 |
| enabled | boolean | NO | true | 是否启用 |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| description | text | YES |  |  |
| functional_key | text | YES |  |  |
| sort_order | integer(32) | NO | 0 |  |

## nrm_provider_secrets

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 provider_id | text | NO |  | 关联Provider ID |
| cipher_text | text | NO |  | 加密后的密钥 |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |

## nrm_providers

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | Provider唯一标识 |
| name | text | NO |  | Provider名称 |
| type | text | NO |  | 类型：llm/video/image |
| vendor | text | NO |  | 供应商：openai/anthropic/runway等 |
| base_url | text | NO |  | API基础URL |
| model | text | NO |  | 模型标识 |
| options | jsonb | YES |  | 配置选项（JSONB） |
| enabled | boolean | NO | true | 是否启用 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| call_mode | text | NO | 'openai'::text |  |
| access_key | text | YES |  |  |
| remark | text | YES |  | 备注说明 |

## nrm_public_resources

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 资源唯一标识 |
| resource_type | text | NO |  | 资源类型：project/script/template |
| resource_id | text | NO |  | 关联资源ID |
| owner_user_id | text | NO |  | 所有者用户ID |
| square_category | text | YES |  | 广场分类：男装/女装/男童装/女童装 |
| published_at | bigint(64) | NO |  | 发布时间（毫秒时间戳） |

## nrm_reverse_attempts

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 尝试唯一标识 |
| trace_id | text | NO |  | 关联追踪ID |
| task_id | text | YES |  | 关联任务ID |
| user_id | text | NO |  | 用户ID |
| project_id | text | NO |  | 项目ID |
| input_url | text | NO |  | 输入URL |
| stage | text | NO |  | 尝试阶段：video_download/video_analysis/script_generation |
| provider | text | NO |  | 使用的Provider |
| status | text | NO |  | 状态：pending/success/failed |
| reason_code | text | NO |  | 失败原因码 |
| elapsed_ms | integer(32) | NO | 0 | 耗时（毫秒） |
| retryable | boolean | NO | false | 是否可重试 |
| next_action | text | NO |  | 下一步行动 |
| detail | text | YES |  | 详细信息 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |

## nrm_reverse_storyboard_library

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 模板唯一标识 |
| title | text | NO |  | 模板标题 |
| summary | text | NO |  | 模板摘要 |
| tags | jsonb | NO | '[]'::jsonb | 标签（JSONB数组） |
| source_type | text | NO |  | 来源类型 |
| source_meta | jsonb | NO |  | 来源元数据（JSONB） |
| report | jsonb | NO |  | 分析报告（JSONB） |
| content | text | NO |  | 模板内容 |
| current_version | integer(32) | NO | 1 | 当前版本号 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_reverse_storyboard_library_versions

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 版本唯一标识 |
| item_id | text | NO |  | 关联模板ID |
| version | integer(32) | NO |  | 版本号 |
| title | text | NO |  | 版本标题 |
| summary | text | NO |  | 版本摘要 |
| tags | jsonb | NO | '[]'::jsonb | 标签（JSONB数组） |
| source_meta | jsonb | YES |  | 来源元数据（JSONB） |
| report | jsonb | YES |  | 分析报告（JSONB） |
| content | text | NO |  | 版本内容 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |

## nrm_reverse_tasks

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 项目唯一标识 |
| user_id | text | NO |  | 用户ID |
| project_id | text | NO |  | 关联项目ID |
| source | text | NO |  | 来源：url/upload |
| input | text | NO |  | 输入：视频URL或文件路径 |
| status | text | NO |  | 状态：pending/processing/completed/failed |
| script_version_id | text | YES |  | 生成的脚本版本ID |
| fallback_reason | text | YES |  | 降级原因 |
| trace_id | text | YES |  | 追踪ID |
| resolved_video_url | text | YES |  | 解析后的视频URL |
| resolved_by_stage | text | YES |  | 解析阶段 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |

## nrm_reverse_traces

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 追踪唯一标识 |
| user_id | text | NO |  | 用户ID |
| project_id | text | NO |  | 项目ID |
| input_url | text | NO |  | 输入URL |
| stage_order | jsonb | NO |  | 阶段顺序（JSONB） |
| final_stage | text | NO |  | 最终阶段 |
| success | boolean | NO | false | 是否成功 |
| resolved_video_url | text | YES |  | 解析的视频URL |
| script_hints | jsonb | YES |  | 脚本提示（JSONB） |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_review_requests

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 请求唯一标识 |
| user_id | text | NO |  | 申请人用户ID |
| resource_type | text | NO |  | 资源类型 |
| resource_id | text | NO |  | 资源ID |
| square_category | text | YES |  | 目标分类 |
| status | text | NO | 'pending'::text | 状态：pending/approved/rejected |
| published | boolean | NO | false | 是否已发布 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| reviewed_at | bigint(64) | YES |  | 审核时间（毫秒时间戳） |
| reviewed_by | text | YES |  | 审核人用户ID |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |

## nrm_role_direction_cards

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() |  |
| project_id | text | NO |  |  |
| cards_json | jsonb | YES |  |  |
| created_at | bigint(64) | NO |  |  |
| updated_at | bigint(64) | NO |  |  |

## nrm_script_data

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  | 脚本数据主键ID，varchar(128) 支持复合ID格式 |
| type | integer(32) | NO |  | 脚本类型：1-短视频/2-长视频 |
| title | text | YES |  | 脚本标题 |
| duration_seconds | integer(32) | YES |  | 预计时长（秒） |
| source | text | YES |  | 来源：manual/ai/reverse |
| time_of_day | text | YES |  | 拍摄时间段：day/night/dawn/dusk |
| weather | text | YES |  | 天气：sunny/cloudy/rainy/snowy |
| theme | text | YES |  | 主题标签 |
| summary | text | YES |  | 剧情摘要 |
| primary_emotion | text | YES |  | 主要情感 |
| emotion_arc | text | YES |  | 情感曲线 |
| video_type | text | YES |  | 视频类型 |
| video_style | text | YES |  | 视频风格 |
| target_audience | text | YES |  | 目标受众 |
| fashion_suitable | boolean | YES |  | 是否适合服装展示 |
| fashion_reason | text | YES |  | 服装展示适配理由 |
| emotion_detail | jsonb | YES |  | 情感详情（JSONB） |
| on_screen_presence | jsonb | YES |  | 出镜信息（JSONB） |
| fashion_styles | jsonb | YES |  | 时尚风格（JSONB） |
| editing_analysis | jsonb | YES |  | 剪辑分析（JSONB） |
| source_script_id | character varying(256) | YES |  | 来源脚本ID，varchar(128) 支持复合ID格式 |
| project_id | character varying(256) | YES |  | 关联项目ID |
| source_oss_url | text | YES |  | 源文件OSS URL |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| basic_info | text | YES |  | 基本信息文本 |
| role_table | text | YES |  | 角色表文本 |
| outfit_table | text | YES |  | 服饰表文本 |
| storyboard | text | YES |  | 分镜内容文本 |
| source_type | text | YES |  | 来源类型：original/reverse/library |
| user_id | text | YES |  | 用户ID |
| shot_prompts | jsonb | YES |  | 分镜提示词（JSONB） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| main_scene | text | YES |  | 主场景描述 |
| atmosphere | text | YES |  | 氛围描述 |
| is_selected | boolean | YES | false | 是否被选中为候选脚本 |
| is_confirmed | boolean | YES | false | 是否已确认为最终脚本 |
| previous_script_id | character varying(256) | YES |  | 直接前驱脚本ID，首条为 NULL |
| tags | ARRAY | YES |  | 用户标签 |
| content | text | YES |  | 脚本内容 |
| key_elements | jsonb | YES |  | 关键元素数组（从 video_analysis.key_elements 提取） |
| placement_notes | text | YES |  | 服饰植入备注（从 video_analysis.fashion_placement.placement_notes 提取） |

## nrm_script_quality_scores

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  |  |
| script_data_id | character varying(256) | NO |  |  |
| strategy | character varying(40) | NO |  | 脚本策略：library/video/realtime/effectiveness/custom/fashion |
| score | integer(32) | NO |  | 综合评分 0-100 |
| viewer_score | integer(32) | YES |  | 观众视角评分 |
| director_score | integer(32) | YES |  | 编导视角评分 |
| strategist_score | integer(32) | YES |  | 策略师视角评分 |
| rule_based_score | integer(32) | YES |  |  |
| scoring_method | character varying(50) | NO |  | 评分方法：llm_multi_perspective / rule_based |
| strengths | jsonb | YES |  |  |
| weaknesses | jsonb | YES |  |  |
| suggestions | jsonb | YES |  |  |
| score_spread | integer(32) | YES |  |  |
| prompt_code | character varying(80) | YES |  | 关联的 prompt 模板 code |
| prompt_version | character varying(20) | YES |  | 关联的 prompt 版本号 |
| project_id | character varying(256) | YES |  |  |
| user_id | text | YES |  |  |
| llm_model | character varying(40) | YES |  |  |
| duration_ms | integer(32) | YES |  |  |
| created_at | bigint(64) | NO |  |  |

## nrm_section_versions

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  |  |
| section_id | text | NO |  |  |
| project_id | text | NO |  |  |
| version_number | integer(32) | NO |  |  |
| prompt_snapshot | jsonb | YES |  |  |
| copy_snapshot | jsonb | YES |  |  |
| image_asset_id | text | YES |  |  |
| is_active | boolean | YES | false |  |
| created_at | bigint(64) | NO |  |  |

## nrm_sessions

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 token | text | NO |  | 会话令牌 |
| user_id | text | NO |  | 关联用户ID |
| created_at | bigint(64) | NO |  | 会话创建时间（毫秒时间戳） |
| expires_at | bigint(64) | NO |  | 会话过期时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |

## nrm_shot_breakdown

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  | 镜头数据主键ID，varchar(128) 支持复合ID格式 |
| script_data_id | character varying(256) | NO |  | 关联脚本数据ID，varchar(128) 支持复合ID格式 |
| shot_index | integer(32) | NO |  | 镜头序号 |
| shot_type | character varying(50) | YES |  | 镜头类型：远景/中景/近景/特写等 |
| camera_movement | character varying(100) | YES |  | 镜头运动：推/拉/摇/移/跟等 |
| shot_description | text | YES |  | 镜头画面描述 |
| timecode_start | character varying(20) | YES |  | 开始时间码 |
| timecode_end | character varying(20) | YES |  | 结束时间码 |
| duration_seconds | numeric(6) | YES |  | 镜头持续时长（秒） |
| transition_json | jsonb | YES |  | 转场信息（transition_in + transition_out） |
| camera_details_json | jsonb | YES |  | 镜头细节参数 |
| visual_json | jsonb | YES |  | 视觉信息（场景/构图/光线/色彩） |
| subjects_json | jsonb | YES |  | 人物信息数组 |
| audio_json | jsonb | YES |  | 音频信息（对话/旁白/音乐/音效） |
| text_elements_json | jsonb | YES |  | 文字元素数组 |
| speed_effects_json | jsonb | YES |  | 速度特效信息 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_shot_prompts

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  | 主键UUID |
| project_id | character varying(256) | NO |  | 关联项目ID |
| script_data_id | character varying(256) | YES |  | 来源脚本ID（仅记录，不做关联查询） |
| type | character varying(20) | NO |  | 类型：origin=Step3原始, fission=裂变 |
| version | integer(32) | NO | 1 | 版本号（同项目同类型自增） |
| is_active | boolean | NO | true | 是否激活版本 |
| shots | jsonb | NO |  | 镜头提示词数组 ShotPromptItem[] |
| character_anchors | jsonb | YES |  | 角色锚点数组 CharacterAnchor[] |
| emotional_arc | jsonb | YES |  | 情绪弧线 EmotionalArc |
| consistency_notes | jsonb | YES |  | 一致性说明 ConsistencyNotes |
| input_snapshot | jsonb | YES |  | 生成参数快照 ShotPromptsInputSnapshot |
| generated_at | bigint(64) | NO |  | LLM生成时间戳 |
| created_at | bigint(64) | NO |  | 记录创建时间 |
| updated_at | bigint(64) | NO |  | 记录更新时间 |
| created_by | character varying(256) | YES |  | 创建用户ID |
| deleted_at | bigint(64) | YES |  | 软删除时间戳 |
| deleted_by | character varying(256) | YES |  | 删除用户ID |

## nrm_smart_storyboard_library

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 故事板唯一标识 |
| owner_user_id | text | NO |  | 所有者用户ID |
| title | text | NO |  | 标题 |
| summary | text | NO |  | 摘要 |
| tags | jsonb | NO | '[]'::jsonb | 标签（JSONB数组） |
| category | text | NO |  | 分类 |
| source_ref | jsonb | NO |  | 来源引用（JSONB） |
| relation_ref | jsonb | YES |  | 关联引用（JSONB） |
| reverse_source_script_text | text | YES |  | 反推源脚本文本 |
| report | jsonb | NO |  | 分析报告（JSONB） |
| content | text | NO |  | 内容 |
| current_version | integer(32) | NO | 1 | 当前版本号 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_smart_storyboard_library_versions

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 版本唯一标识 |
| parent_id | text | NO |  | 父故事板ID |
| version | integer(32) | NO | 1 | 版本号 |
| content | jsonb | YES |  | 版本内容（JSONB） |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_source_credentials

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 凭证唯一标识 |
| user_id | text | NO |  | 用户ID |
| scope | text | NO |  | 权限范围 |
| provider | text | NO |  | 平台标识：douyin/kuaishou/bilibili |
| key_hint | text | NO |  | 密钥提示 |
| cipher_text | text | NO |  | 加密后的凭证 |
| masked_value | text | NO |  | 脱敏显示值 |
| expires_at | bigint(64) | YES |  | 过期时间（毫秒时间戳） |
| revoked_at | bigint(64) | YES |  | 撤销时间（毫秒时间戳） |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_square_behavior_logs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 日志唯一标识 |
| user_id | text | NO |  | 用户ID |
| item_id | text | NO |  | 条目ID |
| item_type | text | NO |  | 条目类型：project/script/template |
| item_category | text | NO |  | 条目分类 |
| behavior_type | text | NO |  | 行为类型：view/click/like/share |
| session_id | text | YES |  | 会话ID |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |

## nrm_square_publish_requests

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  |  |
| user_id → nrm_users(id) | text | NO |  |  |
| project_id → nrm_projects(id) | text | NO |  |  |
| status | text | NO | 'pending'::text |  |
| reject_reason | text | YES |  |  |
| reviewer_id → nrm_users(id) | text | YES |  |  |
| reviewed_at | bigint(64) | YES |  |  |
| created_at | bigint(64) | NO |  |  |

## nrm_square_templates

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 模板唯一标识 |
| title | text | NO |  | 模板标题 |
| category | text | NO |  | 分类 |
| author | text | NO |  | 作者 |
| cover_url | text | NO |  | 封面图URL |
| video_url | text | YES |  | 视频URL |
| views | integer(32) | YES |  | 浏览次数 |
| likes | integer(32) | YES |  | 点赞数 |
| sort_order | integer(32) | YES |  | 排序权重 |
| is_enabled | boolean | YES |  | 是否启用 |
| creator_id | text | NO |  | 创建者用户ID |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| script_data_id | character varying | YES |  | 关联的脚本数据ID，来自 nrm_script_data 表 |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| project_id | text | YES |  |  |
| review_status | character varying(20) | YES | 'pending'::character varying |  |
| reviewer_id | text | YES |  |  |
| reviewed_at | bigint(64) | YES |  |  |
| reject_reason | character varying(500) | YES |  |  |

## nrm_square_user_works

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 作品唯一ID |
| user_id | text | NO |  | 用户ID |
| project_id | text | NO |  | 项目ID |
| title | text | NO |  | 作品标题 |
| cover_url | text | NO |  | 封面URL |
| video_url | text | YES |  | 视频URL |
| category | text | NO |  | 分类：男装/女装/男童装/女童装 |
| views | integer(32) | YES | 0 | 浏览量 |
| likes | integer(32) | YES | 0 | 点赞量 |
| published_at | bigint(64) | YES |  | 发布时间戳(ms) |
| created_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint | 创建时间戳(ms) |
| updated_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint | 更新时间戳(ms) |
| is_enabled | boolean | YES | true | 是否启用 |
| deleted_at | bigint(64) | YES |  | 软删除时间戳 |
| deleted_by | text | YES |  | 删除操作人ID |

## nrm_step3_frame_images

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() |  |
| project_id | character varying(256) | NO |  |  |
| user_id | character varying(256) | NO |  |  |
| shot_breakdown_id | character varying(256) | YES |  | 关联分镜表ID，外键 |
| frame_index | integer(32) | NO |  | 镜头序号，冗余字段便于查询 |
| batches | jsonb | NO | '[]'::jsonb |  |
| selected_batch_id | character varying(256) | YES |  |  |
| selected_image_url | text | YES |  |  |
| selected_image_index | integer(32) | YES | 0 |  |
| created_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint |  |
| updated_at | bigint(64) | NO | ((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint |  |
| script_data_id | character varying(256) | YES |  | 脚本ID，冗余字段便于查询 |
| prompt | text | YES |  | 分镜旁白/内容提示词 |
| image_prompt | text | YES |  | 图片生成提示词 |
| reference_image_urls | jsonb | YES | '[]'::jsonb | 参考图URL列表 |
| status | character varying(20) | NO | 'pending'::character varying | 帧状态: pending/running/succeeded/failed |

## nrm_step4_video_scenes

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() |  |
| project_id | character varying(256) | NO |  |  |
| user_id | character varying(256) | NO |  |  |
| scene_index | integer(32) | NO |  |  |
| variant_urls | jsonb | NO | '[]'::jsonb |  |
| selected_index | integer(32) | NO | 0 |  |
| clip_status | character varying(20) | YES | 'pending'::character varying |  |
| clip_url | text | YES |  |  |
| clip_prompt | text | YES |  |  |
| clip_progress | integer(32) | YES | 0 |  |
| created_at | bigint(64) | YES | (EXTRACT(epoch FROM now()) * (1000)::numeric) |  |
| updated_at | bigint(64) | YES | (EXTRACT(epoch FROM now()) * (1000)::numeric) |  |
| deleted_variant_urls | jsonb | NO | '[]'::jsonb | 被删除的视频变体URL列表（软删除，用于审计和恢复） |
| external_task_id | text | YES |  |  |
| error_message | text | YES |  |  |
| audit_id | text | YES |  |  |
| llm_query_url_json | jsonb | YES |  | LLM视频任务查询上下文：queryUrl, callMode, taskId |
| clip_generation | integer(32) | NO | 0 |  |

## nrm_step_prompt

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 记录唯一标识 |
| project_id | text | NO |  | 关联项目ID |
| type | text | NO |  | 提示词类型：script/storyboard/style |
| prompt | text | NO |  | 发送的提示词 |
| response | text | NO |  | AI响应内容 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_themes

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 主题唯一标识 |
| name | text | NO |  | 主题名称（英文标识） |
| display_name | text | NO |  | 主题显示名称（中文） |
| category | text | NO |  | 主题分类：light/dark/custom |
| is_system | boolean | NO | false | 是否系统内置主题 |
| is_enabled | boolean | NO | true | 是否启用 |
| config | jsonb | NO |  | 主题配置（JSONB）：颜色、字体等 |
| logo_url | text | YES |  | 主题Logo URL |
| created_by | text | YES |  | 创建者用户ID |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_trend_entries

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 条目唯一标识 |
| source | text | NO |  | 来源平台：weibo/douyin/zhihu等 |
| trend_type | text | NO |  | 热榜类型：realtime/video |
| date_window | text | NO |  | 时间窗口 |
| normalized_key | text | NO |  | 标准化键 |
| title | text | NO |  | 热榜标题 |
| url | text | NO |  | 原文链接 |
| item_id | text | YES |  | 平台条目ID |
| trend | text | NO | 'flat'::text | 热度值 |
| rank | integer(32) | NO | 0 | 排名 |
| hash | text | NO |  | 内容哈希 |
| synced_at | bigint(64) | NO |  | 同步时间（毫秒时间戳） |
| raw_payload | jsonb | YES |  | 原始数据（JSONB） |

## nrm_trend_sync_jobs

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 项目唯一标识 |
| trend_type | text | NO |  | 热榜类型 |
| source | text | NO |  | 来源平台 |
| date_window | text | NO |  | 时间窗口 |
| status | text | NO |  | 状态：pending/running/completed/failed |
| started_at | bigint(64) | NO |  | 开始时间（毫秒时间戳） |
| finished_at | bigint(64) | YES |  | 结束时间（毫秒时间戳） |
| elapsed_ms | integer(32) | YES |  | 耗时（毫秒） |
| topic_count | integer(32) | NO | 0 | 话题数量 |
| error_code | text | YES |  | 错误码 |
| error_message | text | YES |  | 错误信息 |

## nrm_user_script_assoc

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | character varying(256) | NO |  | 关联唯一标识 |
| user_id | character varying(256) | NO |  | 用户ID |
| script_data_id | character varying(256) | NO |  | 脚本ID |
| title | text | YES |  | 用户自定义标题 |
| tags | ARRAY | YES |  | 用户标签（数组） |
| source | character varying(32) | NO | 'manual'::character varying | 来源：manual/favorite/import |
| notes | text | YES |  | 用户备注 |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_user_square_preferences

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 偏好唯一标识 |
| user_id → nrm_users(id) | text | NO |  | 用户ID |
| category_weights | jsonb | NO | '{"女装": 0.25, "男装": 0.25, "女童装": 0.25, "男童装": 0.25}'::jsonb | 分类权重（JSONB） |
| source_weights | jsonb | NO | '{"template": 0.5, "hot_trend": 0.3, "user_work": 0.2}'::jsonb | 来源权重（JSONB） |
| asset_type_weights | jsonb | NO | '{}'::jsonb | 资产类型权重（JSONB） |
| behavior_stats | jsonb | NO | '{"view_count": {}, "click_count": {}}'::jsonb | 行为统计（JSONB） |
| last_updated | bigint(64) | NO |  | 最后更新时间（毫秒时间戳） |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |

## nrm_user_theme_preferences

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 user_id | text | NO |  | 用户ID |
| theme_id | text | NO |  | 选中的主题ID |
| system_name | text | NO | ''::text | 系统主题名称 |
| custom_config | jsonb | YES |  | 自定义配置（JSONB） |
| custom_logo_url | text | YES |  | 自定义Logo URL |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |

## nrm_users

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 用户唯一标识（UUID） |
| email | text | NO |  | 用户邮箱（登录账号） |
| password_hash | text | NO |  | 密码哈希值 |
| role | text | NO | 'user'::text | 用户角色：admin/user |
| created_at | bigint(64) | NO |  | 账号创建时间（毫秒时间戳） |
| failed_attempts | integer(32) | NO | 0 | 连续登录失败次数 |
| lock_until | bigint(64) | YES |  | 账号锁定截止时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |
| company_name | character varying(200) | YES |  | 公司名称 |

## nrm_video_musics

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | text | NO |  | 音乐唯一标识 |
| title | text | NO |  | 音乐标题 |
| music_url | text | NO |  | 音乐文件URL |
| local_path | text | YES |  | 本地存储路径 |
| source_url | text | YES |  | 来源URL |
| atmospheres | jsonb | NO | '[]'::jsonb | 氛围标签（JSONB数组） |
| duration_sec | integer(32) | YES |  | 时长（秒） |
| artist | text | YES |  | 艺术家 |
| album | text | YES |  | 专辑 |
| cover_url | text | YES |  | 封面URL |
| genre | text | YES |  | 音乐风格 |
| creator_id | text | YES |  | 创建者用户ID |
| created_at | bigint(64) | NO |  | 创建时间（毫秒时间戳） |
| updated_at | bigint(64) | NO |  | 更新时间（毫秒时间戳） |
| deleted_at | bigint(64) | YES |  | 软删除时间戳，NULL表示未删除 |
| deleted_by | text | YES |  | 删除操作者ID |

## nrm_video_script_assoc

| 列名 | 类型 | 可空 | 默认值 | 注释 |
|------|------|------|--------|------|
| 🔑 id | uuid | NO | gen_random_uuid() | 主键ID（UUID） |
| video_source | character varying(50) | NO |  | 视频来源：hot_trend_asset/square_user_work/template/project |
| video_id | character varying(256) | NO |  | 视频来源表中的ID |
| video_url | text | YES |  | 视频URL（冗余存储，便于查询） |
| script_id | character varying(256) | NO |  | 关联脚本ID（nrm_script_data.id） |
| user_id | uuid | YES |  | 创建该关联的用户ID |
| entry_point | character varying(50) | YES |  | 来源入口：hot_trend_batch/square_input/square_replica/project_create |
| created_at | bigint(64) | NO |  | 创建时间戳（毫秒） |
| updated_at | bigint(64) | NO |  | 更新时间戳（毫秒） |

