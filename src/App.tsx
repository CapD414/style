/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  FileText, 
  Sparkles, 
  Copy, 
  Check, 
  RefreshCw, 
  ArrowRight,
  BookOpen,
  PenTool,
  Zap,
  Loader2,
  Trash2,
  Menu,
  X,
  Plus,
  History,
  Layout,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { AnalysisResult, StyleAnalysis, GeneratedPrompt, StructuralAnalysis } from './types';
import { supabase } from './lib/supabase';

// Set up PDF.js worker using the local worker file from the package
// @ts-ignore - Vite handled import
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const STORAGE_KEY = "style_echo_history";

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from Supabase (with localStorage fallback)
  useEffect(() => {
    const loadHistory = async () => {
      // 1. Try Supabase first
      if (supabase) {
        const { data, error } = await supabase
          .from('analysis_history')
          .select('*')
          .order('timestamp', { ascending: false });
        
        if (!error && data) {
          // Map snake_case back to camelCase for the UI
          const mappedData = data.map((item: any) => ({
            ...item,
            inputText: item.input_text
          }));
          setHistory(mappedData as AnalysisResult[]);
          return;
        }
      }

      // 2. Fallback to localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setHistory(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse history", e);
        }
      }
    };

    loadHistory();
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    setError(null);
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('仅支持 PDF 格式文件');
      return;
    }

    try {
      setIsAnalyzing(true);
      setFileName(file.name);
      const text = await extractTextFromPdf(file);
      setInputText(text);
      setError(null);
    } catch (err) {
      console.error('PDF parsing error:', err);
      setError('解析 PDF 失败，请尝试直接粘贴文本。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeStyle = async () => {
    if (!inputText.trim()) {
      setError('请输入文本或上传 PDF 以供分析');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '分析失败，请检查服务器配置或网络');
      }

      const data = await response.json();
      const newResult: AnalysisResult = {
        ...data,
        id: Date.now().toString(),
        timestamp: Date.now(),
        inputText: inputText
      };
      
      setResult(newResult);
      setHistory(prev => [newResult, ...prev]);

      // Sync to Supabase if available
      if (supabase) {
        // Map camelCase to snake_case for SQL compatibility
        const supabaseData = {
          id: newResult.id,
          title: newResult.title,
          timestamp: newResult.timestamp,
          input_text: newResult.inputText,
          analysis: newResult.analysis,
          structure: newResult.structure,
          prompt: newResult.prompt
        };

        const { error: syncError } = await supabase
          .from('analysis_history')
          .upsert(supabaseData);
        if (syncError) console.error('Supabase sync error:', syncError);
      }
    } catch (err) {
      console.error('AI Analysis error:', err);
      setError(err instanceof Error ? err.message : '分析失败，请稍后重试。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handlePromptChange = (field: keyof GeneratedPrompt, value: string) => {
    if (!result) return;
    const updatedResult = {
      ...result,
      prompt: {
        ...result.prompt,
        [field]: value
      }
    };
    setResult(updatedResult);
    setHistory(prev => prev.map(item => item.id === result.id ? updatedResult : item));
  };

  const copyAll = () => {
    if (!result) return;
    const allText = `【System Instruction / 系统指令】\n${result.prompt.systemInstruction}\n\n【User Prompt Template / 用户模板】\n${result.prompt.userPromptTemplate}\n\n【Example Output / 示例输出】\n${result.prompt.exampleOutput}`;
    copyToClipboard(allText, 'all');
  };

  const reset = () => {
    setInputText('');
    setResult(null);
    setFileName(null);
    setError(null);
  };

  const loadHistoryItem = (item: AnalysisResult) => {
    setResult(item);
    setInputText(item.inputText);
    setFileName(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    
    if (supabase) {
      const { error } = await supabase
        .from('analysis_history')
        .delete()
        .eq('id', id);
      if (error) console.error('Supabase delete error:', error);
    }

    if (result?.id === id) {
      reset();
    }
  };

  return (
    <div className="flex h-screen bg-[#f8f9fa] text-slate-900 font-sans selection:bg-indigo-100 overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="w-72 bg-white border-r border-slate-200 flex flex-col z-40"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <Sparkles className="text-white w-5 h-5" />
                </div>
                <span className="font-bold text-slate-800">StyleEcho</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-slate-100 rounded-md text-slate-400 md:hidden">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <button 
                onClick={reset}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-colors border border-indigo-100"
              >
                <Plus className="w-4 h-4" />
                开启新分析
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                历史记录
              </div>
              {history.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-slate-400">
                  暂无历史记录
                </div>
              ) : (
                history.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => loadHistoryItem(item)}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all border border-transparent",
                      result?.id === item.id 
                        ? "bg-indigo-50 border-indigo-100 text-indigo-700" 
                        : "hover:bg-slate-50 text-slate-600"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <History className={cn("w-4 h-4 flex-shrink-0", result?.id === item.id ? "text-indigo-500" : "text-slate-400")} />
                      <span className="text-sm font-medium truncate">{item.title}</span>
                    </div>
                    <button 
                      onClick={(e) => deleteHistoryItem(e, item.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 font-medium">STYLEECHO V2.0 WORKSTATION</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-bold text-slate-800 truncate">
              {result ? result.title : "开始分析新文风"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400 font-medium hidden sm:block">
              Gemini 3.1 Pro Powered
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
            <AnimatePresence mode="wait">
              {!result ? (
                <motion.div 
                  key="input-section"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-8"
                >
                  {/* Hero */}
                  <div className="text-center space-y-4 max-w-2xl mx-auto">
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                      提取灵魂笔触，告别“AI味”
                    </h2>
                    <p className="text-lg text-slate-600">
                      上传 PDF 或粘贴文本，我们将为你生成针对 Gemini 深度优化的模仿 Prompt。
                    </p>
                  </div>

                  {/* Input Area */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                          上传 PDF
                        </button>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileUpload} 
                          className="hidden" 
                          accept=".pdf"
                        />
                        {fileName && (
                          <span className="text-xs text-slate-500 flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200">
                            <FileText className="w-3 h-3" />
                            {fileName}
                            <button onClick={() => { setFileName(null); setInputText(''); }} className="hover:text-red-500">
                              <Trash2 className="w-3 h-3 ml-1" />
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        建议字数：500 - 5000 字
                      </div>
                    </div>
                    
                    <textarea
                      value={inputText}
                      onChange={handleTextChange}
                      placeholder="在此粘贴你想要模仿的文本内容..."
                      className="w-full h-64 p-6 text-slate-700 placeholder:text-slate-400 focus:outline-none resize-none text-lg leading-relaxed"
                    />

                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={analyzeStyle}
                        disabled={isAnalyzing || !inputText.trim()}
                        className={cn(
                          "flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white transition-all shadow-lg shadow-indigo-200",
                          isAnalyzing || !inputText.trim() 
                            ? "bg-slate-300 cursor-not-allowed" 
                            : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                        )}
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            正在深度解析风格与框架...
                          </>
                        ) : (
                          <>
                            <Zap className="w-5 h-5 fill-current" />
                            开始分析
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm text-center"
                    >
                      {error}
                    </motion.div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="result-section"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-12"
                >
                  {/* Analysis Report */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2">
                      <BookOpen className="text-indigo-600 w-6 h-6" />
                      <h3 className="text-2xl font-bold text-slate-800">风格分析报告</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ReportCard title="语气情感" content={result.analysis.tone} icon="😊" />
                      <ReportCard title="词汇特征" content={result.analysis.vocabulary} icon="✍️" />
                      <ReportCard title="句式结构" content={result.analysis.sentenceStructure} icon="🏗️" />
                      <ReportCard title="节奏韵律" content={result.analysis.rhythm} icon="🎵" />
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <h4 className="font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        独特癖好与细节
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {result.analysis.uniqueTraits.map((trait, i) => (
                          <span key={i} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium border border-slate-200">
                            {trait}
                          </span>
                        ))}
                      </div>
                      <p className="text-slate-600 leading-relaxed pt-2 italic border-t border-slate-50">
                        "{result.analysis.overallSummary}"
                      </p>
                    </div>
                  </section>

                  {/* Structural Analysis */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2">
                      <Layout className="text-indigo-600 w-6 h-6" />
                      <h3 className="text-2xl font-bold text-slate-800">写作框架分析</h3>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h4 className="font-bold text-slate-800 mb-2">逻辑流向</h4>
                        <p className="text-slate-600 text-sm leading-relaxed">{result.structure.logicFlow}</p>
                      </div>
                      <div className="p-6 space-y-6">
                        <div>
                          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <ChevronRight className="w-4 h-4 text-indigo-500" />
                            详细写作大纲
                          </h4>
                          <div className="space-y-3">
                            {result.structure.detailedOutline.map((step, i) => (
                              <div key={i} className="flex gap-4 group">
                                <div className="flex flex-col items-center">
                                  <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold flex items-center justify-center border border-indigo-100">
                                    {i + 1}
                                  </div>
                                  {i !== result.structure.detailedOutline.length - 1 && (
                                    <div className="w-px h-full bg-slate-100 my-1" />
                                  )}
                                </div>
                                <div className="pb-4 text-sm text-slate-600 leading-relaxed group-hover:text-slate-900 transition-colors">
                                  {step}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="pt-6 border-t border-slate-100">
                          <h4 className="font-bold text-slate-800 mb-2">设计意图</h4>
                          <p className="text-slate-600 text-sm leading-relaxed italic">{result.structure.designIntent}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Generated Prompt */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2">
                      <PenTool className="text-indigo-600 w-6 h-6" />
                      <h3 className="text-2xl font-bold text-slate-800">针对 Gemini 优化的 Prompt</h3>
                    </div>

                    <div className="space-y-4">
                      <PromptBox 
                        title="System Instruction (系统指令)" 
                        description="在 Gemini 的系统设置或 API 配置中使用，定义核心人格。"
                        content={result.prompt.systemInstruction}
                        onCopy={() => copyToClipboard(result.prompt.systemInstruction, 'sys')}
                        isCopied={copied === 'sys'}
                        onChange={(val) => handlePromptChange('systemInstruction', val)}
                      />
                      
                      <PromptBox 
                        title="User Prompt Template (用户模板)" 
                        description="在对话框中直接输入，用于触发具体的创作任务。"
                        content={result.prompt.userPromptTemplate}
                        onCopy={() => copyToClipboard(result.prompt.userPromptTemplate, 'user')}
                        isCopied={copied === 'user'}
                        onChange={(val) => handlePromptChange('userPromptTemplate', val)}
                      />
                    </div>
                  </section>

                  {/* Example Output */}
                  <section className="bg-indigo-900 rounded-2xl p-8 text-white shadow-xl relative group">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <Zap className="text-amber-400 w-6 h-6 fill-current" />
                        <h3 className="text-xl font-bold">模仿创作示例</h3>
                      </div>
                      <button 
                        onClick={() => copyToClipboard(result.prompt.exampleOutput, 'example')}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                          copied === 'example' ? "bg-green-500/20 text-green-300" : "bg-white/10 hover:bg-white/20 text-white/80"
                        )}
                      >
                        {copied === 'example' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied === 'example' ? "已复制" : "复制示例"}
                      </button>
                    </div>
                    <div className="prose prose-invert max-w-none text-indigo-100 leading-loose text-lg">
                      <textarea
                        value={result.prompt.exampleOutput}
                        onChange={(e) => handlePromptChange('exampleOutput', e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-indigo-100 leading-loose text-lg resize-none overflow-hidden min-h-[100px]"
                        style={{ height: 'auto' }}
                        onInput={(e) => {
                          const target = e.target as HTMLTextAreaElement;
                          target.style.height = 'auto';
                          target.style.height = target.scrollHeight + 'px';
                        }}
                      />
                    </div>
                  </section>

                  {/* Copy All Button */}
                  <div className="flex justify-center pt-4 pb-12">
                    <button
                      onClick={copyAll}
                      className={cn(
                        "flex items-center gap-2 px-10 py-4 rounded-2xl font-bold text-white transition-all shadow-xl",
                        copied === 'all' ? "bg-green-600" : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                      )}
                    >
                      {copied === 'all' ? (
                        <>
                          <Check className="w-5 h-5" />
                          全部内容已复制
                        </>
                      ) : (
                        <>
                          <Copy className="w-5 h-5" />
                          一键复制全部 (指令 + 模板 + 示例)
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}

function ReportCard({ title, content, icon }: { title: string, content: string, icon: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors group">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <h4 className="font-bold text-slate-800">{title}</h4>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{content}</p>
    </div>
  );
}

function PromptBox({ title, description, content, onCopy, isCopied, onChange }: { 
  title: string, 
  description: string, 
  content: string, 
  onCopy: () => void,
  isCopied: boolean,
  onChange: (val: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h4 className="font-bold text-slate-800 text-sm">{title}</h4>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <button 
          onClick={onCopy}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
            isCopied ? "bg-green-100 text-green-700" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          )}
        >
          {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {isCopied ? "已复制" : "复制"}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-6 bg-slate-900 text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none min-h-[150px] overflow-hidden"
      />
    </div>
  );
}
