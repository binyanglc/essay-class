# 中文写作反馈平台

中文写作课 AI 反馈系统 MVP。学生提交作文（打字或拍照上传），获得即时 AI 反馈，系统追踪长期错误模式，教师可查看班级常见问题用于课堂讲解。

## 技术栈

- **Next.js 16** + TypeScript + App Router
- **Tailwind CSS v4**
- **Supabase** — Auth、Database (PostgreSQL)、Storage
- **OCR.space API** — 中文 OCR 识别
- **OpenAI API** (gpt-4o-mini) — AI 反馈生成

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Supabase

1. 在 [supabase.com](https://supabase.com) 创建项目
2. 在 SQL Editor 中运行 `supabase/schema.sql` 创建数据库表
3. 在 Supabase Dashboard > Authentication > Settings 中：
   - 关闭 "Confirm email"（MVP 阶段方便测试）
   - 或保留开启，用户注册后需要确认邮箱

### 3. 配置环境变量

复制 `.env.local.example` 为 `.env.local` 并填入：

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
OCR_SPACE_API_KEY=helloworld
OPENAI_API_KEY=sk-your-openai-key
```

- Supabase URL 和 Anon Key 在 Supabase Dashboard > Settings > API 中获取
- OCR.space 免费 key `helloworld` 可直接使用（有速率限制），生产环境建议注册获取专用 key
- OpenAI API Key 在 [platform.openai.com](https://platform.openai.com) 获取

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

## 使用流程

### 教师
1. 注册账号，选择"教师"身份
2. 创建班级，获得 6 位邀请码
3. 将邀请码分享给学生
4. 在"课堂常见问题"页面查看学生提交中的常见错误
5. 可按"今日/全部/作业名称"筛选

### 学生
1. 注册账号，选择"学生"身份
2. 在主页输入邀请码加入班级
3. 提交作文：打字输入 或 拍照上传 → OCR 识别 → 编辑修正 → 提交
4. 获得 AI 即时反馈：整体评价、句子修改建议、错误标记
5. 在"常见错误"页面查看自己的错误模式统计

## 核心功能

- **OCR 识别**：上传手写/打印稿照片，自动识别中文文字
- **AI 结构化反馈**：整体评价、优点、问题、句子级修改建议
- **错误标记分类**：词汇选择、搭配、语法（了/的地得）、语序、标点、连贯、语体、错别字
- **长期错误追踪**：记录每次提交的错误类型，识别反复出现的错误模式
- **课堂展示视图**：教师可直接在课堂上展示班级 Top 5 常见问题及匿名例句

## 项目结构

```
src/
├── app/
│   ├── api/           # API 路由
│   │   ├── ocr/       # OCR 处理
│   │   ├── submissions/# 提交作文 + AI 反馈
│   │   ├── classes/   # 创建/加入班级
│   │   └── teacher/   # 教师数据接口
│   ├── login/         # 登录页
│   ├── signup/        # 注册页
│   ├── student/       # 学生页面
│   └── teacher/       # 教师页面
├── components/        # 复用组件
├── lib/               # 核心逻辑
│   ├── supabase/      # Supabase 客户端
│   ├── ocr.ts         # OCR 模块（可替换）
│   ├── ai-feedback.ts # AI 反馈模块
│   └── error-tracking.ts # 错误追踪逻辑
└── types/             # TypeScript 类型定义
```

## 部署

推荐使用 Vercel 部署：

```bash
npm run build
```

在 Vercel 中配置相同的环境变量即可。
