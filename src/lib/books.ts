// 按水平分级的推荐书单（浏览器和服务端共用，不要引入服务端模块）
//
// 书单是手工整理的，只收真实存在、容易买到或借到的书。分级是大致判断：
// 同一本书不同的人读起来难度会差一级，以"翻开一页不认识的词有几个"为准。

export type BookKind = 'graded' | 'picture' | 'chapter' | 'novel' | 'nonfiction';

export const BOOK_KIND_LABEL: Record<BookKind, string> = {
  graded: '分级读物',
  picture: '绘本',
  chapter: '桥梁/章节书',
  novel: '小说',
  nonfiction: '非虚构',
};

export interface Book {
  id: string;
  title: string;
  /** 常见的中文译名，方便搜索 */
  zh: string;
  author: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  kind: BookKind;
  /** 是不是一个系列（可以一本接一本读下去） */
  series?: boolean;
  note: string;
}

export const BOOKS: Book[] = [
  // ---- A1 入门 ----
  { id: 'ort', title: 'Oxford Reading Tree', zh: '牛津阅读树', author: 'Roderick Hunt 等', level: 'A1', kind: 'graded', series: true, note: '英国小学的识字读物，从一页一句话开始，级别分得很细，适合从零起步。' },
  { id: 'bookworms-starter', title: 'Oxford Bookworms Library: Starter & Stage 1', zh: '书虫 入门级、1 级', author: '牛津大学出版社', level: 'A1', kind: 'graded', series: true, note: '专为英语学习者改写的故事，入门级约 250 词、1 级约 400 词的词汇量就能读。国内有英汉对照版。' },
  { id: 'brown-bear', title: 'Brown Bear, Brown Bear, What Do You See?', zh: '棕色的熊，棕色的熊，你在看什么？', author: 'Bill Martin Jr. / Eric Carle', level: 'A1', kind: 'picture', note: '全书重复同一个句型，读完颜色和动物的词就记住了。' },
  { id: 'hungry-caterpillar', title: 'The Very Hungry Caterpillar', zh: '好饿的毛毛虫', author: 'Eric Carle', level: 'A1', kind: 'picture', note: '星期、数字、食物的词都在里面，句子简单，有过去式的自然用法。' },
  { id: 'green-eggs', title: 'Green Eggs and Ham', zh: '绿鸡蛋和火腿', author: 'Dr. Seuss', level: 'A1', kind: 'picture', note: '全书只用了 50 个不同的词，押韵好读，适合读出声。' },
  { id: 'cat-in-hat', title: 'The Cat in the Hat', zh: '戴高帽的猫', author: 'Dr. Seuss', level: 'A1', kind: 'picture', note: '用很少的常用词写成的押韵故事，比《绿鸡蛋和火腿》稍长。' },
  { id: 'elephant-piggie', title: 'Elephant & Piggie', zh: '小猪小象', author: 'Mo Willems', level: 'A1', kind: 'picture', series: true, note: '全是两个角色的对话，句子短，都是日常口语里真正会说的话。' },
  { id: 'fly-guy', title: 'Fly Guy', zh: '苍蝇小子', author: 'Tedd Arnold', level: 'A1', kind: 'chapter', series: true, note: '每本分三小章，每页一两句话，是从绘本过渡到章节书的第一步。' },
  { id: 'frog-toad', title: 'Frog and Toad Are Friends', zh: '青蛙和蟾蜍是好朋友', author: 'Arnold Lobel', level: 'A1', kind: 'chapter', series: true, note: '五个温暖的小故事，句子简单但完整，过去式用得很多，适合写日记的人模仿。' },

  // ---- A2 初中 ----
  { id: 'bookworms-2', title: 'Oxford Bookworms Library: Stage 2', zh: '书虫 2 级', author: '牛津大学出版社', level: 'A2', kind: 'graded', series: true, note: '约 700 词的词汇量，有改写的名著也有原创故事，一本一两个小时能读完。' },
  { id: 'nate-the-great', title: 'Nate the Great', zh: '大侦探内特', author: 'Marjorie Weinman Sharmat', level: 'A2', kind: 'chapter', series: true, note: '小侦探破案，句子很短，第一人称叙述，和写日记的口吻接近。' },
  { id: 'magic-tree-house', title: 'Magic Tree House', zh: '神奇树屋', author: 'Mary Pope Osborne', level: 'A2', kind: 'chapter', series: true, note: '最常被推荐的第一套章节书。每本十章左右，句型反复出现，几十本可以一直读下去。' },
  { id: 'junie-b-jones', title: 'Junie B. Jones', zh: '朱尼·琼斯', author: 'Barbara Park', level: 'A2', kind: 'chapter', series: true, note: '小女孩的口吻讲学校里的事，很口语。书里故意保留了孩子说错的语法，读的时候留意一下。' },
  { id: 'flat-stanley', title: 'Flat Stanley', zh: '纸片人斯坦利', author: 'Jeff Brown', level: 'A2', kind: 'chapter', series: true, note: '被压扁的男孩的奇遇，篇幅短，情节简单有趣。' },
  { id: 'a-to-z-mysteries', title: 'A to Z Mysteries', zh: 'A to Z 神秘案件', author: 'Ron Roy', level: 'A2', kind: 'chapter', series: true, note: '三个孩子破案，从 A 到 Z 共 26 本，比《神奇树屋》稍长一点。' },
  { id: 'fantastic-mr-fox', title: 'Fantastic Mr Fox', zh: '了不起的狐狸爸爸', author: 'Roald Dahl', level: 'A2', kind: 'chapter', note: '罗尔德·达尔最短最容易的一本，读完可以接着读他别的书。' },
  { id: 'dog-man', title: 'Dog Man', zh: '神探狗狗', author: 'Dav Pilkey', level: 'A2', kind: 'chapter', series: true, note: '漫画形式，有图帮助理解，文字不多，读起来没有压力。' },

  // ---- B1 高中 ----
  { id: 'bookworms-3', title: 'Oxford Bookworms Library: Stage 3–4', zh: '书虫 3 级、4 级', author: '牛津大学出版社', level: 'B1', kind: 'graded', series: true, note: '约 1000 到 1400 词的词汇量。想读名著又怕原版太难时，先读这个级别的改写本。' },
  { id: 'wimpy-kid', title: 'Diary of a Wimpy Kid', zh: '小屁孩日记', author: 'Jeff Kinney', level: 'B1', kind: 'chapter', series: true, note: '就是一本日记：中学生用第一人称写每天的事，配漫画。对写英语日记的人特别有参考价值。' },
  { id: 'charlottes-web', title: "Charlotte's Web", zh: '夏洛的网', author: 'E. B. White', level: 'B1', kind: 'novel', note: '小猪和蜘蛛的友谊。文字干净准确，作者本人就是讲英文写作的名家。' },
  { id: 'chocolate-factory', title: 'Charlie and the Chocolate Factory', zh: '查理和巧克力工厂', author: 'Roald Dahl', level: 'B1', kind: 'novel', note: '情节熟悉，读起来有底。达尔会自己造一些词，遇到查不到的词不用纠结。' },
  { id: 'matilda', title: 'Matilda', zh: '玛蒂尔达', author: 'Roald Dahl', level: 'B1', kind: 'novel', note: '爱读书的天才小女孩对付坏校长，比《查理》稍长。' },
  { id: 'winn-dixie', title: 'Because of Winn-Dixie', zh: '傻狗温迪克', author: 'Kate DiCamillo', level: 'B1', kind: 'novel', note: '小女孩和一条流浪狗。第一人称，句子短，感情真。' },
  { id: 'number-the-stars', title: 'Number the Stars', zh: '数星星', author: 'Lois Lowry', level: 'B1', kind: 'novel', note: '二战时丹麦女孩帮助犹太朋友的故事，篇幅不长，语言朴素。' },
  { id: 'little-prince', title: 'The Little Prince', zh: '小王子', author: 'Antoine de Saint-Exupéry（英译本）', level: 'B1', kind: 'novel', note: '大多数人读过中文版，知道内容再读英文会轻松很多。' },
  { id: 'holes', title: 'Holes', zh: '洞', author: 'Louis Sachar', level: 'B1', kind: 'novel', note: '章节很短，悬念一环扣一环，很多人第一本读完的英文小说就是它。' },
  { id: 'wonder', title: 'Wonder', zh: '奇迹男孩', author: 'R. J. Palacio', level: 'B1', kind: 'novel', note: '几个孩子轮流用第一人称讲述，全是校园日常用语，章节短。' },

  // ---- B2 四级 ----
  { id: 'bookworms-5', title: 'Oxford Bookworms Library: Stage 5–6', zh: '书虫 5 级、6 级', author: '牛津大学出版社', level: 'B2', kind: 'graded', series: true, note: '约 1800 到 2500 词的词汇量，是读原版小说之前的最后一级台阶。' },
  { id: 'harry-potter-1', title: "Harry Potter and the Philosopher's Stone", zh: '哈利·波特与魔法石', author: 'J. K. Rowling', level: 'B2', kind: 'novel', series: true, note: '情节大家都熟。第一本最容易，后面越来越长、越来越难；魔法相关的生造词不用查。' },
  { id: 'the-giver', title: 'The Giver', zh: '记忆传授人', author: 'Lois Lowry', level: 'B2', kind: 'novel', note: '用词不难，但讲的东西有深度，适合想读点有内容的书的成年人。' },
  { id: 'curious-incident', title: 'The Curious Incident of the Dog in the Night-Time', zh: '深夜小狗神秘事件', author: 'Mark Haddon', level: 'B2', kind: 'novel', note: '叙述者说话直白、句子简单，是成人小说里语言最容易的之一。' },
  { id: 'old-man-sea', title: 'The Old Man and the Sea', zh: '老人与海', author: 'Ernest Hemingway', level: 'B2', kind: 'novel', note: '海明威以句子短、用词简单著称，全书不到三万词。会有一些捕鱼和船的词。' },
  { id: 'animal-farm', title: 'Animal Farm', zh: '动物农场', author: 'George Orwell', level: 'B2', kind: 'novel', note: '篇幅短，叙述清楚，是读经典的好起点。' },
  { id: 'tuesdays-morrie', title: 'Tuesdays with Morrie', zh: '相约星期二', author: 'Mitch Albom', level: 'B2', kind: 'nonfiction', note: '学生每周二去看望临终的老师。大量对话，句子短，谈的是人生。' },
  { id: 'alchemist', title: 'The Alchemist', zh: '牧羊少年奇幻之旅', author: 'Paulo Coelho（英译本）', level: 'B2', kind: 'novel', note: '寓言式的故事，英译本语言非常简单。' },
  { id: 'hunger-games', title: 'The Hunger Games', zh: '饥饿游戏', author: 'Suzanne Collins', level: 'B2', kind: 'novel', series: true, note: '现在时、第一人称，节奏快，容易一口气读下去。' },
  { id: 'atomic-habits', title: 'Atomic Habits', zh: '掌控习惯', author: 'James Clear', level: 'B2', kind: 'nonfiction', note: '讲怎么养成习惯。结构清楚，每章有小结，适合第一次读英文非虚构。' },

  // ---- C1 六级及以上 ----
  { id: 'mockingbird', title: 'To Kill a Mockingbird', zh: '杀死一只知更鸟', author: 'Harper Lee', level: 'C1', kind: 'novel', note: '有美国南方的方言和时代背景，比看起来难，但值得。' },
  { id: 'gatsby', title: 'The Great Gatsby', zh: '了不起的盖茨比', author: 'F. Scott Fitzgerald', level: 'C1', kind: 'novel', note: '篇幅短，但文字讲究、比喻多，适合慢读。' },
  { id: '1984', title: 'Nineteen Eighty-Four', zh: '一九八四', author: 'George Orwell', level: 'C1', kind: 'novel', note: '奥威尔主张用平实的词写作，这本书的英文清楚有力，是很好的写作范本。' },
  { id: 'catcher-rye', title: 'The Catcher in the Rye', zh: '麦田里的守望者', author: 'J. D. Salinger', level: 'C1', kind: 'novel', note: '通篇是少年的口语和上世纪中叶的俚语，难在语气，不在生词。' },
  { id: 'never-let-me-go', title: 'Never Let Me Go', zh: '别让我走', author: 'Kazuo Ishiguro', level: 'C1', kind: 'novel', note: '叙述平静克制，用词不难，要读的是言外之意。' },
  { id: 'pride-prejudice', title: 'Pride and Prejudice', zh: '傲慢与偏见', author: 'Jane Austen', level: 'C1', kind: 'novel', note: '两百年前的英文，句子长、说法旧，建议先看过电影或中文版再读。' },
  { id: 'sapiens', title: 'Sapiens: A Brief History of Humankind', zh: '人类简史', author: 'Yuval Noah Harari', level: 'C1', kind: 'nonfiction', note: '讲得清楚、例子多，是长篇非虚构里比较好读的。' },
  { id: 'educated', title: 'Educated', zh: '你当像鸟飞往你的山', author: 'Tara Westover', level: 'C1', kind: 'nonfiction', note: '回忆录，叙事性强，像小说一样能读进去。' },
  { id: 'thinking-fast-slow', title: 'Thinking, Fast and Slow', zh: '思考，快与慢', author: 'Daniel Kahneman', level: 'C1', kind: 'nonfiction', note: '内容密度高，适合想练学术类阅读的人，一次读一章。' },
];

export type ReadingStatus = 'want' | 'reading' | 'done';

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  want: '想读',
  reading: '在读',
  done: '读完',
};

export const READING_STATUSES = Object.keys(READING_STATUS_LABEL) as ReadingStatus[];
