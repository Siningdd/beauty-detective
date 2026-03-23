# Beauty Detective - 化妆品成分识图分析 App

AI 识图查询化妆品成分并生成分析报告的移动应用。

## 技术栈

- **移动端**: Expo + React Native + TypeScript
- **后端**: Node.js + Express
- **AI**: Google Gemini API

## 快速开始

### 1. 申请 Gemini API Key

在 [Google AI Studio](https://aistudio.google.com/apikey) 申请 API Key。

### 2. 启动后端 API

```bash
cd api
cp .env.example .env   # 编辑 .env 填入 GEMINI_API_KEY
npm install
npm run dev
```

API 默认运行在 http://localhost:3001

### 3. 启动移动端

```bash
npm install        # 根目录执行
npx expo start --web    # 浏览器预览
# 或
npx expo start          # 真机 Expo Go 扫码
```

### 4. 修改 Prompt 与 JSON 结构

编辑 `api/prompts.ts` 即可调整分析维度和返回格式。

### 5. API 地址配置

开发时默认请求 `http://localhost:3001`。若后端部署到其他地址，修改 `services/api.ts` 中的 `API_BASE`。

## 项目结构

```
beauty-detective/
├── app/                 # Expo 路由（expo-router）
│   ├── _layout.tsx  # 根布局
│   ├── index.tsx    # 首页（Shazam 风格）
│   ├── report.tsx  # 分析报告
│   └── assets/      # 图标等资源
├── services/            # API 调用
├── types/               # 类型定义
├── api/                 # 后端
│   ├── prompts.ts       # Prompt + JSON 定义
│   ├── analyze.ts       # Gemini 调用
│   └── server.ts        # Express 服务
├── app.json
├── package.json
└── README.md
```

## 环境变量

| 变量 | 说明 |
|------|------|
| GEMINI_API_KEY | Google AI Studio API Key |
| PORT | API 端口，默认 3001 |
