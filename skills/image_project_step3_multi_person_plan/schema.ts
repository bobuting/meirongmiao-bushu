{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["relationMode", "characters", "garmentVariants", "targetPhotoCount"],
  "properties": {
    "relationMode": {
      "type": "string",
      "enum": ["couple", "parent_child", "friends", "siblings"],
      "description": "多人关系模式"
    },
    "characters": {
      "type": "array",
      "description": "角色列表",
      "items": {
        "type": "object",
        "required": ["characterId", "gender", "description"],
        "properties": {
          "characterId": {
            "type": "string",
            "description": "角色ID"
          },
          "gender": {
            "type": "string",
            "description": "性别"
          },
          "age": {
            "type": "number",
            "description": "年龄"
          },
          "description": {
            "type": "string",
            "description": "角色外貌描述"
          },
          "assignedVariantAssetId": {
            "type": "string",
            "description": "分配的颜色变体资产ID"
          },
          "assignedColor": {
            "type": "string",
            "description": "分配的颜色名称"
          }
        }
      }
    },
    "garmentVariants": {
      "type": "array",
      "description": "服饰变体列表",
      "items": {
        "type": "object",
        "properties": {
          "assetId": {
            "type": "string",
            "description": "变体资产ID"
          },
          "colorName": {
            "type": "string",
            "description": "颜色名称"
          },
          "description": {
            "type": "string",
            "description": "服饰描述"
          }
        }
      }
    },
    "outfitTitle": {
      "type": "string",
      "description": "服装搭配标题"
    },
    "styleName": {
      "type": "string",
      "description": "风格名称"
    },
    "analysis": {
      "type": "string",
      "description": "搭配分析文本"
    },
    "targetPhotoCount": {
      "type": "number",
      "description": "目标图片数量",
      "default": 6
    },
    "backgroundStyle": {
      "type": "string",
      "enum": ["solid", "scene", "balanced"],
      "description": "背景风格偏好",
      "default": "balanced"
    }
  }
}
