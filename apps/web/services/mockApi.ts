import { Project, ReviewTask, VideoAsset, AiModel, User, ScriptSegment, Character } from '../types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockUser: User = {
  id: 'u1',
  name: 'Alex Chen',
  avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD9ZVOCT6D3CtCYPEXANM1mEayDcOpQwbBTvtHSWGFFqsH8IOjxmorMtkSTO33UgK6jRCmQJHPuDpNXNtct6BZHwjK2m6LayyY52W3Hk9zLj-kJ0zKl27wCoCMGbku2MZKLvhtGu0-8LBEsrG7dSOqmLUpFMerDPw-emBWcaFoEUIDWLCWFQ6NjCpVbhPiMlHiRPeXolNpDF3Lm5VoyuD4eB0MXUHO8Ym8I9E6bFQiDxVQTMYvb0WxRnlu95WCD7Wc_84vWv5muIrNz',
  email: 'alex@vogue.ai',
  role: 'admin',
  plan: 'pro',
};

export const fetchProjects = async (): Promise<Project[]> => {
  await delay(600);
  return [
    {
      id: 'p1',
      title: '夏季新品系列 V2',
      thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBytgy1CjMtbET-LMpxnvuE-ydsVLvc0AsPA5DGgXdM8Cah2W2fwcz68B0d_jSVyLI3FvAhJGffUqDC1omOI_9r5Pc4ZX3yZvBWYIG36gSmMpPqD_A94s8bZF8v_zV7YUUJPph7ANLym69AZ1NJ2bvgPS-mLZ76ZDpKVeEYVkAuqapMDcCyQ418JnmqnOBeor0QGX5GonhLlX7vhZheUMB54v6kYFDQFnFVtWia5oUq-19F02PyqXuiDEbwu_HhppVWrW9Wj4oHOS7V',
      status: 'processing',
      type: '全身展示 • 4K画质',
      createdAt: '2 mins ago',
      updatedAt: '2 mins ago',
    },
    {
      id: 'p2',
      title: '街头潮牌宣传片',
      thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCfbWwOCS4MUjF52Lk682zbOoVRh4_X8TSJ_VM7huyORH1c9GqbctutoaczfoTkYrS659A2CXR2ZYj6p8eAYgiqgchQjvd3THGbWqhiRNSMTDRVjvccBOdduNzrADJzJfeXE2E26IpzxZTIJaTbRX2eCWV6SjsOIc3vur1YG9n3fPDJ6xsN6-xAE1yHAgK3lW0zScziDkgziDZFTLqnnTfuW8VKafoepe_-aOqMieesdlh2OBySOQeURMXkDaLqF9HErwAPeNH1YQI0',
      status: 'completed',
      type: '15秒 • 9:16',
      createdAt: '2023-10-24',
      updatedAt: '2023-10-24',
      views: 2400,
    },
    {
      id: 'p3',
      title: '丝绸连衣裙广告',
      thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuABANytqOkQj8EiQqy7svIA0gsC7EM552VyGfwLK8qIHEUtA0HQKk5yUHGqPBAre9rBs04lmFHqW97bVa-qDUfum2ebXtI4d6RU4-lj54iUAX6OmklzpABwYtu8RvVZiOG5W-W8C5f32UgACI2eTB9e-_mW_i-9ee2TT6j8Mlf5dAGdkQNFPIBPOJysLxjFNCSeJmlFrkiS_rseuKtB6NqdiOxRVa6HhxaPKNsxuSU7r38e7ZUxisDPzFjQmRqkovrGn4q4nlqKBuSu',
      status: 'draft',
      type: '等待素材',
      createdAt: '1 day ago',
      updatedAt: '1 day ago',
    }
  ];
};

export const fetchReviewTasks = async (): Promise<ReviewTask[]> => {
  await delay(500);
  return [
    {
      id: 'VID-9928',
      videoId: 'v1',
      videoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDYY5YJC_nuYg0Z5l2_9KF_Fa8cXB3bFfg9fc9b4dNW4e9Jp0LNUaM_D6F2i89pbqyGFw04Rsq2ro5ZLnvfI-aRAejkFQm-Cpn6_r46VzhMJym9pXRLRHXdkk4jFhAxJlyR_6fZUu1i6nQ3dzkWxPyZy86B8bLee5YvP5kZ32G12gU1Ftgwv-EbuPO-XQgYaCH1FJ81efczNTUVpygEtJXV0p8lVhgjz1neR3zC2dpS5EF5SEgx_Mwr3kiCZ0MsRhXue5_gsUHufU_g',
      title: '赛博朋克风格运动鞋在霓虹灯台上旋转',
      author: 'Enterprise_Client_01',
      authorHandle: '@enterprise_client',
      submittedAt: '2分钟前',
      status: 'pending',
      aiScore: { nsfw: 0.01, copyright: 1.2, violence: 0.05 },
      metadata: { model: 'VideoGen XL v2.1', seed: '84729104', cost: 0.45, prompt: 'Cyberpunk sneakers spinning on a neon pedestal...' },
    },
    {
      id: 'VID-9927',
      videoId: 'v2',
      videoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAy35gQFzJNLWsFhZJKeSMm4xB345YyIrEdFLG0_kYrT5ogpiUzfX8rWK0mFKHJTswkQ_OGWkqBGUaxW4wcAjnxB-UGmQid4nm2pipvPOFKp-DlD3xn2bN0o9QM5p4h5Igb2rNEKhjgk5nvyaZ-V7lOzOLQ8jQ16ajzzvNNvQnwwsQUUXd6WvZ7ZN3yy5GSOuxMj0A1i9vUdVmVi0QFmndbBeKERSHOVR9SFx9GMnNd-l5Kuw2hiOaP2NnzMMQyvT1YYsRlw6cWZuLv',
      title: '悬浮的红色运动鞋，解构部件',
      author: 'Nike Creative Team',
      authorHandle: '@nike_creative',
      submittedAt: '10分钟前',
      status: 'approved',
      aiScore: { nsfw: 0.0, copyright: 0.0, violence: 0.0 },
      metadata: { model: 'VideoGen Fast v1.0', seed: '11223344', cost: 0.12, prompt: 'Floating red sneaker, deconstructed parts...' },
    }
  ];
};

export const fetchModels = async (): Promise<AiModel[]> => {
  await delay(400);
  return [
    { id: 'm1', name: 'Elena', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARiIb2XHvGXxy0fwhGFWxbXUFyt8rZuSdfp5eKcPUbf7YRrLUknZSh1bjJQiaSl6pQ7oHEGXXTnyPIQffrNHIqR54NeczgEV5ugMnXZ_6HYIHG8fncW99awZh9bJd443Cah5mOQeuMYEWd_qlpWt4TMY0n7iOHr2YPslkpe3QM8VCgZso6YftfWjDMcunCVGhAjemN_xv1tPtU71k5yI88sGfehu3s0AFwqRvxYOt0l6PK7gKer_gpIgtKOBzDBvp7ZjxVrcET--6D', tags: ['现代', '休闲', '亚洲'], type: 'real' },
    { id: 'm2', name: 'Marcus', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBQpU1PODeUxQpct9oJTlHXB_K2WIRjPm1RBtS-n5_BQILlnP22fdVK1_mKyZLeZONc8HT2tRgac9P13xTe5AEHwfof8T1dwF7kD1OTTzoZKnl5kJL_hlWy0GNYFDgJSiDM4KtG9RxZXS7nm6jHQMgehuRKB8q1gKVwyLBU0dvZ5C2ZUx6FQQY2onKVOtvoEq0zzjoxyZZJky3dS7enkgfd99IEi5ZtCnN_DemmlIGtKMI1pW8FeRrI7ltXh1oYyiUgN8-GBfXGIbrI', tags: ['街头', '欧美'], type: 'real' },
    { id: 'm3', name: 'Sophia', image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAYnzT7ox0nkcJw8Szi5ylqO6kn-LDwoMaGzsteTZQw58ZIC2vg4J6pBjizE2QDP1gNdeuB9L1WFUi31WybVv8NP3_L8ZrHjQqkmBuh6kuhBdgKlkVyyakFZscJLZYFCUoW8zn_d9rI8IVWU1X5xnrnZ_RtG6gmOzPV4w3NWQEmsjuAuDMb24valyEF7HvWZIJ0hs7x6KCGpGGpNPkQTo2mga0Bn9WL-AfyTP_3h9HqEy1kXvjGLtD7ug44Nx_t31FCVQiQerGl-8p0', tags: ['优雅', '高端'], type: 'real' },
  ];
};

export const fetchAssets = async (): Promise<VideoAsset[]> => {
  await delay(400);
  return [
    { id: 'a1', name: '白色T恤.jpg', mainImageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD4ESFcXT47vRuSLh-gu-XGaFf1ELf-QBru0hY-Jh5Se8vCNCAn50NuRb_P0gTLi-7hCvUWEjNQ5ma33bV1DYw9FK3COBbGYpCVtaO6FNucx0E7pYwJw6zIzRdkkDScj_MVSGSRiA3CjAH7d3_prfA1exP7UbF69yaWVmb_78hFRNeZk7WT3oiEyw5wdX7SWeWXYGJRz5H21fNPQAPcLhH3e0KrMbEqSNacPE1g87RwZ2nuTLekpsDCu6QYzWbrinYTokhVbRp6XmFQ', type: 'image', category: 'top', tags: ['纯棉', '休闲', '基础款'] },
    { id: 'a2', name: '牛仔裤_v2.jpg', mainImageUrl: 'https://placehold.co/400x600/e2e8f0/1e293b?text=Jeans', type: 'image', category: 'bottom', tags: ['丹宁', '复古'] },
    { id: 'a3', name: '运动板鞋.jpg', mainImageUrl: 'https://placehold.co/300x300/e2e8f0/1e293b?text=Sneakers', type: 'image', category: 'shoes', tags: ['运动', '百搭'] },
    { id: 'a4', name: '银色项链.png', mainImageUrl: 'https://placehold.co/300x300/e2e8f0/1e293b?text=Necklace', type: 'image', category: 'accessory', tags: ['金属', '配饰'] },
    { id: 'a5', name: '手提包.jpg', mainImageUrl: 'https://placehold.co/300x300/e2e8f0/1e293b?text=Bag', type: 'image', category: 'accessory', tags: ['皮革', '商务'] },
  ];
};

export const mockCharacters: Character[] = [
    {
        id: 'c1',
        name: 'Elena - 2024夏季',
        thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARiIb2XHvGXxy0fwhGFWxbXUFyt8rZuSdfp5eKcPUbf7YRrLUknZSh1bjJQiaSl6pQ7oHEGXXTnyPIQffrNHIqR54NeczgEV5ugMnXZ_6HYIHG8fncW99awZh9bJd443Cah5mOQeuMYEWd_qlpWt4TMY0n7iOHr2YPslkpe3QM8VCgZso6YftfWjDMcunCVGhAjemN_xv1tPtU71k5yI88sGfehu3s0AFwqRvxYOt0l6PK7gKer_gpIgtKOBzDBvp7ZjxVrcET--6D',
        type: 'image',
        tags: ['真实感', '女性', '亚洲', '休闲'],
        status: 'ready',
        views: [
            'https://lh3.googleusercontent.com/aida-public/AB6AXuARiIb2XHvGXxy0fwhGFWxbXUFyt8rZuSdfp5eKcPUbf7YRrLUknZSh1bjJQiaSl6pQ7oHEGXXTnyPIQffrNHIqR54NeczgEV5ugMnXZ_6HYIHG8fncW99awZh9bJd443Cah5mOQeuMYEWd_qlpWt4TMY0n7iOHr2YPslkpe3QM8VCgZso6YftfWjDMcunCVGhAjemN_xv1tPtU71k5yI88sGfehu3s0AFwqRvxYOt0l6PK7gKer_gpIgtKOBzDBvp7ZjxVrcET--6D',
            'https://placehold.co/300x500?text=Left',
            'https://placehold.co/300x500?text=Right',
            'https://placehold.co/300x500?text=Back',
            'https://placehold.co/300x300?text=Face'
        ],
        createdAt: '2023-10-20'
    },
    {
        id: 'c2',
        name: 'Marcus - 街头风',
        thumbnail: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBQpU1PODeUxQpct9oJTlHXB_K2WIRjPm1RBtS-n5_BQILlnP22fdVK1_mKyZLeZONc8HT2tRgac9P13xTe5AEHwfof8T1dwF7kD1OTTzoZKnl5kJL_hlWy0GNYFDgJSiDM4KtG9RxZXS7nm6jHQMgehuRKB8q1gKVwyLBU0dvZ5C2ZUx6FQQY2onKVOtvoEq0zzjoxyZZJky3dS7enkgfd99IEi5ZtCnN_DemmlIGtKMI1pW8FeRrI7ltXh1oYyiUgN8-GBfXGIbrI',
        type: 'video',
        tags: ['真实感', '男性', '欧美', '商务'],
        status: 'ready',
        videoPreview: 'https://placehold.co/video',
        createdAt: '2023-10-15'
    },
     {
        id: 'c5',
        name: 'New Base Model',
        thumbnail: 'https://placehold.co/400x500/e2e8f0/1e293b?text=Base',
        type: 'basic',
        tags: ['真实感', '女性'],
        status: 'ready',
        createdAt: 'Just now'
    }
];

export const fetchDefaultScript = async (): Promise<ScriptSegment[]> => {
  await delay(300);
  return [
    { time: '0-3s', title: '开场钩子', content: '还在为夏天穿什么烦恼吗？这件T恤绝对是你的首选！', visualCue: '模特穿着白色T恤在阳光下微笑，特写面料质感' },
    { time: '3-8s', title: '卖点展示', content: '采用100%纯棉面料，透气吸汗，亲肤舒适，怎么洗都不变形。', visualCue: '展示拉伸面料的回弹性，水滴在面料上滑落' },
    { time: '8-12s', title: '场景代入', content: '无论是通勤上班，还是周末约会，都能轻松驾驭。', visualCue: '快速切换办公室和咖啡厅场景背景' },
    { time: '12-15s', title: '行动呼吁', content: '点击左下角链接，限时优惠等你来拿！', visualCue: '出现价格标签动画，模特指引点击手势' },
  ];
};