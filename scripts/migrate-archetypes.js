import { Pool } from 'pg';
import fs from 'fs';

const sourceFile = './src/modules/video-step/step3-emotion-archetype/archetype-library.ts';
const content = fs.readFileSync(sourceFile, 'utf8');

const archetypes = [];
const regex = /id:\s*"([^"]+)"[\s\S]*?name:\s*"([^"]+)"[\s\S]*?category:\s*"([^"]+)"[\s\S]*?emotionCore:\s*"([^"]+)"[\s\S]*?moment:\s*"([^"]+)"[\s\S]*?conflict:\s*"([^"]+)"[\s\S]*?clothingRole:\s*"([^"]+)"/g;

let match;
while ((match = regex.exec(content)) !== null) {
  archetypes.push({
    id: match[1],
    name: match[2],
    category: match[3],
    emotionCore: match[4],
    moment: match[5],
    conflict: match[6],
    clothingRole: match[7],
  });
}

console.log(`解析原型数量: ${archetypes.length}`);

const pool = new Pool({
  connectionString: 'postgres://gitlab:password@101.37.80.207:5432/neirongmiao'
});

(async () => {
  console.log('开始迁移...');
  const now = Date.now();
  let successCount = 0;

  for (const a of archetypes) {
    try {
      await pool.query(
        `INSERT INTO nrm_emotion_archetype_library
         (id, name, category, emotion_core, moment, conflict, clothing_role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at`,
        [a.id, a.name, a.category, a.emotionCore, a.moment, a.conflict, a.clothingRole, now]
      );
      successCount++;
      console.log(`✅ ${a.id}: ${a.name}`);
    } catch (e) {
      console.error(`❌ ${a.id}: ${e.message}`);
    }
  }

  const result = await pool.query(
    'SELECT COUNT(*) as total FROM nrm_emotion_archetype_library'
  );

  console.log(`\n✅ 迁移完成: ${successCount} 个成功，总数 ${result.rows[0].total}`);
  pool.end();
})();