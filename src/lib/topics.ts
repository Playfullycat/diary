// 每日话题：不知道写什么时的引子。每条带几个引导问题，回答完就是一篇日记

export const TOPICS: { en: string; zh: string; hints: string[] }[] = [
  { en: 'What did you eat today?', zh: '今天吃了什么？', hints: ['在哪吃的', '和谁一起', '味道怎么样'] },
  { en: 'What was the best moment of your day?', zh: '今天最开心的一刻是什么？', hints: ['发生了什么', '为什么开心'] },
  { en: 'Describe the weather and how it made you feel.', zh: '今天天气如何，心情怎样？', hints: ['天气', '穿了什么', '心情'] },
  { en: 'What did you do at work or school today?', zh: '今天工作或学习做了什么？', hints: ['做了哪些事', '哪件最难', '明天的计划'] },
  { en: 'Who did you talk to today?', zh: '今天和谁聊天了？', hints: ['是谁', '聊了什么', '你的感受'] },
  { en: 'What is something new you learned recently?', zh: '最近学到了什么新东西？', hints: ['是什么', '怎么学到的', '有什么用'] },
  { en: 'What are you going to do this weekend?', zh: '这个周末打算做什么？', hints: ['计划', '和谁', '期待什么'] },
  { en: 'Describe your room or your desk.', zh: '描述一下你的房间或书桌。', hints: ['有什么东西', '最喜欢哪件', '想换掉什么'] },
  { en: 'What made you tired or stressed today?', zh: '今天什么事让你累或有压力？', hints: ['什么事', '你怎么处理', '现在感觉'] },
  { en: 'What did you buy recently?', zh: '最近买了什么？', hints: ['买了什么', '多少钱', '值不值'] },
  { en: 'Write about a movie, show, or video you watched.', zh: '写写最近看的电影、剧或视频。', hints: ['讲了什么', '喜欢哪里', '推荐吗'] },
  { en: 'What is your plan for tomorrow?', zh: '明天有什么计划？', hints: ['要做的三件事', '最重要的是哪件'] },
  { en: 'Describe a person you saw or met today.', zh: '描述今天见到的一个人。', hints: ['长什么样', '在做什么', '给你的印象'] },
  { en: 'What is a small thing you are thankful for today?', zh: '今天有什么值得感谢的小事？', hints: ['什么事', '为什么'] },
  { en: 'How did you get to work or school today?', zh: '今天是怎么去上班或上学的？', hints: ['交通方式', '路上看到了什么', '花了多久'] },
  { en: 'What did you do after dinner?', zh: '晚饭后做了什么？', hints: ['做了什么', '几点睡'] },
  { en: 'Write about your favorite food and why you like it.', zh: '写写你最喜欢的食物。', hints: ['是什么', '什么味道', '多久吃一次'] },
  { en: 'What is one thing you want to do better?', zh: '有什么事你想做得更好？', hints: ['什么事', '现在的问题', '打算怎么做'] },
  { en: 'Describe a place you went to today.', zh: '描述今天去过的一个地方。', hints: ['在哪里', '什么样子', '去做什么'] },
  { en: 'What did you do for fun this week?', zh: '这周做了什么放松的事？', hints: ['做了什么', '和谁', '感觉如何'] },
  { en: 'Write about a problem you solved recently.', zh: '写一个你最近解决的问题。', hints: ['什么问题', '怎么解决', '学到什么'] },
];

export function topicFor(date: string) {
  const day = Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86400000);
  return TOPICS[((day % TOPICS.length) + TOPICS.length) % TOPICS.length];
}
