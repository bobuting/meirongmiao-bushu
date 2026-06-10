{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["outfitTitle", "styleName", "analysis", "targetPhotoCount"],
  "properties": {
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
    "optimizedPrompt": {
      "type": "string",
      "description": "优化后的提示词"
    },
    "characterDescription": {
      "type": "string",
      "description": "角色描述"
    },
    "targetPhotoCount": {
      "type": "number",
      "description": "目标图片数量",
      "default": 10
    },
    "garments": {
      "type": "array",
      "description": "服装单品列表",
      "items": {
        "type": "object",
        "properties": {
          "description": {
            "type": "string",
            "description": "单品描述"
          }
        }
      }
    }
  }
}
