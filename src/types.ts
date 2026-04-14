export interface StyleAnalysis {
  tone: string;
  vocabulary: string;
  sentenceStructure: string;
  rhythm: string;
  uniqueTraits: string[];
  overallSummary: string;
}

export interface StructuralAnalysis {
  logicFlow: string;
  detailedOutline: string[];
  designIntent: string;
}

export interface GeneratedPrompt {
  systemInstruction: string;
  userPromptTemplate: string;
  exampleOutput: string;
}

export interface AnalysisResult {
  id: string;
  title: string;
  timestamp: number;
  inputText: string;
  analysis: StyleAnalysis;
  structure: StructuralAnalysis;
  prompt: GeneratedPrompt;
}
