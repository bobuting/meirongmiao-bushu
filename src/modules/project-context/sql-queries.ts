/**
 * 项目上下文模块 - SQL 查询语句
 */

/**
 * 查询项目上下文主信息
 * 包含：项目信息、角色信息、穿搭方案
 */
export const QUERY_PROJECT_CONTEXT = `
WITH selected_character AS (
  -- 获取选中的角色
  SELECT pc.library_character_id
  FROM nrm_project_characters pc
  WHERE pc.project_id = $1
    AND pc.is_selected = true
    AND pc.deleted_at IS NULL
  LIMIT 1
),
selected_outfit AS (
  -- 获取选中的穿搭方案
  SELECT op.id, op.title, op.style_name, op.tags, op.analysis,
         op.optimized_prompt, op.suitable_scene
  FROM nrm_project_outfit_plans pop
  JOIN nrm_outfit_plans op ON pop.outfit_plan_id = op.id
  WHERE pop.project_id = $1
    AND pop.selected = true
  LIMIT 1
)
SELECT
  -- 项目信息
  p.id AS project_id,
  p.name AS project_name,
  p.selected_role_direction,

  -- 角色信息
  lc.id AS character_id,
  lc.name AS character_name,
  lc.gender,
  lc.age,
  lc.style AS character_style,

  lc.tags AS character_tags,
  lc.thumbnail_url AS character_thumbnail,
  lc.five_view_oss_image_url,

  -- 穿搭方案
  so.id AS outfit_plan_id,
  so.title AS outfit_title,
  so.style_name,
  so.tags AS outfit_tags,
  so.analysis,
  so.optimized_prompt,
  so.suitable_scene
FROM nrm_projects p
LEFT JOIN selected_character sc ON true
LEFT JOIN nrm_library_characters lc ON lc.id = sc.library_character_id
LEFT JOIN selected_outfit so ON true
WHERE p.id = $1;
`;

/**
 * 查询项目服饰列表
 */
export const QUERY_PROJECT_GARMENTS = `
SELECT
  ga.id AS garment_asset_id,
  ga.name,
  ga.category,
  ga.description,
  ga.style,
  ga.occasion,
  ga.main_image_url,
  ga.flat_lay_image_url
FROM nrm_project_garment_assoc pga
JOIN nrm_garment_assets ga ON pga.garment_asset_id = ga.id
WHERE pga.project_id = $1
ORDER BY pga.created_at ASC;
`;

/**
 * 查询备用穿搭方案
 * 当 nrm_project_outfit_plans 中没有 selected=true 时，取第一条有效的
 */
export const QUERY_FALLBACK_OUTFIT = `
SELECT
  op.id AS outfit_plan_id,
  op.title,
  op.style_name,
  op.tags,
  op.analysis,
  op.optimized_prompt,
  op.suitable_scene
FROM nrm_outfit_plans op
WHERE op.project_id = $1
  AND op.deleted_at IS NULL
ORDER BY
  -- 优先取有 style_name 或 tags 不为空的
  CASE WHEN op.style_name IS NOT NULL AND op.style_name != '' THEN 0 ELSE 1 END,
  CASE WHEN op.tags IS NOT NULL AND jsonb_array_length(op.tags) > 0 THEN 0 ELSE 1 END,
  op.index ASC
LIMIT 1;
`;
