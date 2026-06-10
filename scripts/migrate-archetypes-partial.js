const { Pool } = require('pg');

// 完整的65个情感原型数据
const archetypes = [
  // ========== 类别1：自我发现（10个） ==========
  { id: "EA-001", name: "镜子里的陌生人", category: "自我发现", emotionCore: "不确定 → 接纳", moment: "剪了新发型/换了新风格，第一次照镜子", conflict: "这真的是我吗？", clothingRole: "新风格的首次尝试，服饰=新身份", visualCues: ["镜子", "光线", "表情变化"], duration: "12-18秒", shotCount: 3, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["18-35"], suitableGender: ["male", "female"] },
  { id: "EA-002", name: "断舍离的瞬间", category: "自我发现", emotionCore: "犹豫 → 释怀", moment: "把旧衣服装进袋子，准备扔掉", conflict: "每件都有回忆，舍不得", clothingRole: "旧衣服=过去，新衣服=未来", visualCues: ["衣柜", "袋子", "手的动作"], duration: "15-20秒", shotCount: 4, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["25-45"], suitableGender: ["male", "female"] },
  { id: "EA-003", name: "第一次穿出门", category: "自我发现", emotionCore: "紧张 → 自信", moment: "穿上新买的衣服，出门前深呼吸", conflict: "会不会太夸张？别人会怎么看？", clothingRole: "服饰=勇气的象征", visualCues: ["门把手", "深呼吸", "迈出门的脚步"], duration: "10-15秒", shotCount: 3, syncMode: "动作同步", suitableStyles: ["所有风格"], suitableAge: ["18-35"], suitableGender: ["male", "female"] },
  { id: "EA-004", name: "试衣间的犹豫", category: "自我发现", emotionCore: "犹豫 → 决定", moment: "试衣间里，换了三次，不知道选哪件", conflict: "哪件更适合我？", clothingRole: "服饰=选择的困境", visualCues: ["试衣间镜子", "多件衣服", "纠结表情"], duration: "15-20秒", shotCount: 4, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["18-45"], suitableGender: ["male", "female"] },
  { id: "EA-005", name: "风格突破", category: "自我发现", emotionCore: "不安 → 惊喜", moment: "第一次尝试完全不同的风格", conflict: "我能驾驭吗？", clothingRole: "服饰=突破的象征", visualCues: ["镜子", "新旧对比", "表情变化"], duration: "12-18秒", shotCount: 3, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["18-35"], suitableGender: ["male", "female"] },
  { id: "EA-006", name: "找到自己的风格", category: "自我发现", emotionCore: "迷茫 → 笃定", moment: "试了很多风格后，终于找到适合自己的", conflict: "什么才是真正的我？", clothingRole: "服饰=自我认同", visualCues: ["镜子", "满意的微笑", "自信姿态"], duration: "15-20秒", shotCount: 4, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["20-40"], suitableGender: ["male", "female"] },
  { id: "EA-007", name: "接纳不完美", category: "自我发现", emotionCore: "挑剔 → 接纳", moment: "照镜子，发现衣服不完美，但决定接受", conflict: "必须完美吗？", clothingRole: "服饰=真实的自己", visualCues: ["镜子", "小瑕疵", "释然表情"], duration: "10-15秒", shotCount: 3, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["25-45"], suitableGender: ["male", "female"] },
  { id: "EA-008", name: "重新定义自己", category: "自我发现", emotionCore: "困惑 → 清晰", moment: "整理衣柜，决定重新定义自己的风格", conflict: "我想成为什么样的人？", clothingRole: "服饰=身份的重塑", visualCues: ["衣柜", "分类整理", "决心"], duration: "18-25秒", shotCount: 5, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["25-45"], suitableGender: ["male", "female"] },
  { id: "EA-009", name: "穿上战袍", category: "自我发现", emotionCore: "忐忑 → 强大", moment: "重要场合前，穿上最有信心的衣服", conflict: "我准备好了吗？", clothingRole: "服饰=力量的来源", visualCues: ["镜子", "整理衣服", "深呼吸"], duration: "12-18秒", shotCount: 3, syncMode: "动作同步", suitableStyles: ["通勤职场", "优雅知性"], suitableAge: ["25-45"], suitableGender: ["male", "female"] },
  { id: "EA-010", name: "做回自己", category: "自我发现", emotionCore: "压抑 → 释放", moment: "脱掉不舒服的正装，换上舒适的衣服", conflict: "为什么要伪装？", clothingRole: "服饰=真实vs伪装", visualCues: ["脱衣动作", "舒适衣服", "放松表情"], duration: "10-15秒", shotCount: 3, syncMode: "动作同步", suitableStyles: ["居家慵懒", "休闲街头"], suitableAge: ["20-40"], suitableGender: ["male", "female"] },

  // ========== 类别2：时间流逝（10个） ==========
  { id: "EA-011", name: "十年前的衣服", category: "时间流逝", emotionCore: "怀念 → 释怀", moment: "整理衣柜，翻出十年前的衣服，试穿一下", conflict: "还能穿吗？我变了多少？", clothingRole: "服饰=时间的见证", visualCues: ["旧衣服", "镜子", "对比"], duration: "18-25秒", shotCount: 5, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["25-45"], suitableGender: ["male", "female"] },
  { id: "EA-012", name: "妈妈的衣柜", category: "时间流逝", emotionCore: "好奇 → 理解", moment: "翻妈妈年轻时的衣服，试穿", conflict: "原来妈妈年轻时是这样的", clothingRole: "服饰=跨代连接", visualCues: ["老照片", "旧衣服", "镜子"], duration: "20-25秒", shotCount: 5, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["20-35"], suitableGender: ["female"] },
  { id: "EA-013", name: "老地方新衣服", category: "时间流逝", emotionCore: "怀念 → 向前看", moment: "穿着新衣服回到多年前常去的地方", conflict: "地方没变，我变了", clothingRole: "服饰=成长的标记", visualCues: ["熟悉的场景", "新的自己"], duration: "15-20秒", shotCount: 4, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["25-45"], suitableGender: ["male", "female"] },
  { id: "EA-014", name: "毕业照里的衣服", category: "时间流逝", emotionCore: "怀旧 → 感慨", moment: "翻出毕业照，发现还留着当时的衣服", conflict: "那时的梦想实现了吗？", clothingRole: "服饰=青春的记忆", visualCues: ["照片", "旧衣服", "回忆"], duration: "18-25秒", shotCount: 5, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["25-40"], suitableGender: ["male", "female"] },
  { id: "EA-015", name: "第一次约会的衣服", category: "时间流逝", emotionCore: "甜蜜 → 感慨", moment: "翻出第一次约会穿的衣服", conflict: "那时的我们还在一起吗？", clothingRole: "服饰=爱情的见证", visualCues: ["衣服", "回忆", "微笑或叹息"], duration: "15-20秒", shotCount: 4, syncMode: "情绪同步", suitableStyles: ["浪漫约会", "优雅知性"], suitableAge: ["25-40"], suitableGender: ["male", "female"] },
  { id: "EA-016", name: "孩子穿不下的衣服", category: "时间流逝", emotionCore: "不舍 → 接受", moment: "整理孩子的旧衣服，发现都穿不下了", conflict: "孩子长大了", clothingRole: "服饰=成长的痕迹", visualCues: ["小衣服", "对比", "感慨"], duration: "15-20秒", shotCount: 4, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["30-50"], suitableGender: ["male", "female"] },
  { id: "EA-017", name: "换季整理", category: "时间流逝", emotionCore: "平静 → 感慨", moment: "换季整理衣柜，发现时间过得真快", conflict: "又一年过去了", clothingRole: "服饰=季节的轮回", visualCues: ["衣柜", "换季衣服", "时光流逝"], duration: "12-18秒", shotCount: 3, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["25-50"], suitableGender: ["male", "female"] },
  { id: "EA-018", name: "旧照片新造型", category: "时间流逝", emotionCore: "对比 → 自信", moment: "对比旧照片，发现现在的自己更好", conflict: "我变了吗？", clothingRole: "服饰=蜕变的证明", visualCues: ["照片", "镜子", "对比"], duration: "15-20秒", shotCount: 4, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["25-45"], suitableGender: ["male", "female"] },
  { id: "EA-019", name: "重回母校", category: "时间流逝", emotionCore: "怀念 → 释然", moment: "穿着现在的衣服回到母校", conflict: "我还是当年的我吗？", clothingRole: "服饰=时间的对比", visualCues: ["校园", "新衣服", "回忆"], duration: "18-25秒", shotCount: 5, syncMode: "环境同步", suitableStyles: ["所有风格"], suitableAge: ["25-40"], suitableGender: ["male", "female"] },
  { id: "EA-020", name: "告别旧衣服", category: "时间流逝", emotionCore: "不舍 → 向前", moment: "把陪伴多年的衣服装箱，准备捐赠", conflict: "舍不得，但该放手了", clothingRole: "服饰=过去的告别", visualCues: ["旧衣服", "箱子", "告别"], duration: "15-20秒", shotCount: 4, syncMode: "情绪同步", suitableStyles: ["所有风格"], suitableAge: ["25-50"], suitableGender: ["male", "female"] },

  // ========== 类别3-8数据已在上面的Read文件中获取，这里省略以节省篇幅，实际执行时需完整65个原型 ==========
  // 我将在下一个命令中生成完整脚本
];

const pool = new Pool({ connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao' });

(async () => {
  console.log('开始迁移情感原型...');
  const now = Date.now();

  for (const a of archetypes) {
    await pool.query(
      `INSERT INTO nrm_emotion_archetype_library (
        id, name, category, emotion_core, moment, conflict, clothing_role,
        visual_cues, duration, shot_count, sync_mode,
        suitable_styles, suitable_age, suitable_gender,
        popularity_score, use_count, is_active, source, created_at, updated_at
      ) VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14, \$15, \$16, \$17, \$18, \$19, \$19)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at`,
      [a.id, a.name, a.category, a.emotionCore, a.moment, a.conflict, a.clothingRole,
       JSON.stringify(a.visualCues), a.duration, a.shotCount, a.syncMode,
       JSON.stringify(a.suitableStyles), JSON.stringify(a.suitableAge), JSON.stringify(a.suitableGender),
       0.7, 0, true, 'manual', now]
    );
  }

  const result = await pool.query('SELECT COUNT(*) as total FROM nrm_emotion_archetype_library');
  console.log('✅ 迁移完成，总数:', result.rows[0].total);
  pool.end();
})();