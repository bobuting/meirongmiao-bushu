/**
 * 测试接口返回的数据
 */
import 'dotenv/config';

async function test() {
  const projectId = '16656ca5-57d1-4187-88de-80391806167e';
  const token = process.env.AUTH_TOKEN || '';

  console.log('=== 测试 Step3 快照接口 ===\n');

  try {
    const response = await fetch(`http://localhost:3020/neirongmiao/api/projects/${projectId}/step3/candidates/snapshot`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      console.log(`接口返回错误: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const items = data.snapshot?.items || [];

    console.log(`总共有 ${items.length} 个脚本\n`);

    // 查找 "笑死我了" 脚本
    const xiaoSiLeItems = items.filter((item: any) => item.title?.includes('笑死我了'));

    if (xiaoSiLeItems.length > 0) {
      console.log(`找到 ${xiaoSiLeItems.length} 个 "笑死我了" 脚本：\n`);
      xiaoSiLeItems.forEach((item: any, i: number) => {
        console.log(`[${i}] ${item.title}`);
        console.log(`    candidateId: ${item.candidateId}`);
        console.log(`    sourceUrl: ${item.sourceUrl || '❌ 无'}`);
        console.log(`    sourceScriptId: ${item.sourceScriptId || '无'}`);
        console.log(`    trendType: ${item.trendType}`);
        console.log('');
      });
    } else {
      console.log('没有找到 "笑死我了" 脚本');
    }

    // 查找所有 video 类型的脚本
    const videoItems = items.filter((item: any) => item.trendType === 'video');
    console.log(`\n视频脚本 (trendType=video) 共 ${videoItems.length} 个：\n`);
    videoItems.slice(0, 5).forEach((item: any, i: number) => {
      console.log(`[${i}] ${item.title?.substring(0, 30)}`);
      console.log(`    sourceUrl: ${item.sourceUrl || '❌ 无'}`);
      console.log('');
    });

  } catch (error) {
    console.error('请求失败:', error);
  }
}

test();
