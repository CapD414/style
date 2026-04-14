import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  // Gemini API Endpoint
  app.post("/api/analyze", async (req, res) => {
    try {
      const { inputText } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

      const prompt = `你是一位顶级的语言学家、提示词工程师和内容策略专家。请分析以下文本的写作风格和文章架构，并生成一个针对 Gemini 优化的模仿 Prompt。
              
              待分析文本：
              """
              ${inputText.slice(0, 10000)} 
              """
              
              请以 JSON 格式返回结果，结构如下：
              {
                "title": "自动生成的标题",
                "analysis": {
                  "tone": "语气描述",
                  "vocabulary": "词汇特征",
                  "sentenceStructure": "句式结构",
                  "rhythm": "节奏感描述",
                  "uniqueTraits": ["独特癖好1", "独特癖好2"],
                  "overallSummary": "总体风格总结"
                },
                "structure": {
                  "logicFlow": "逻辑流向描述",
                  "detailedOutline": ["大纲步骤1", "大纲步骤2", "..."],
                  "designIntent": "设计意图分析"
                },
                "prompt": {
                  "systemInstruction": "针对 Gemini 的详细系统指令",
                  "userPromptTemplate": "用户使用的 Prompt 模板，末尾预留资料粘贴区",
                  "exampleOutput": "使用该风格写一段话作为示例"
                }
              }`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      console.log("Gemini Raw Response:", text);
      
      // Extract JSON using regex to handle potential extra text or markdown wrappers
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("AI 返回的内容不是有效的 JSON 格式");
      }
      
      const jsonStr = jsonMatch[0];
      try {
        res.json(JSON.parse(jsonStr));
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Raw JSON string:", jsonStr);
        throw new Error("AI 返回了格式错误的 JSON 数据，请重试。");
      }
    } catch (error) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
