
import { GoogleGenAI, Type } from "@google/genai";
import { AnalyticsEvent, InsightReport, AIConfig } from "../types";

/**
 * Interface for any AI provider implementation
 */
export interface AIProvider {
  generateInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport>;
}

/**
 * Gemini Implementation using @google/genai
 */
class GeminiProvider implements AIProvider {
  async generateInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const summaryData = this.prepareSummary(events);
    
    const prompt = `Analyze this website traffic and return a JSON report:
    ${JSON.stringify(summaryData)}
    
    Format: { "summary": string, "suggestions": string[], "performanceScore": number }`;

    const response = await ai.models.generateContent({
      model: config.model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            performanceScore: { type: Type.NUMBER }
          },
          required: ["summary", "suggestions", "performanceScore"]
        }
      }
    });

    return JSON.parse(response.text || '{}');
  }

  private prepareSummary(events: AnalyticsEvent[]) {
    return {
      total: events.length,
      pages: events.slice(-100).reduce((acc: any, e) => {
        acc[e.path] = (acc[e.path] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

/**
 * Generic JSON Endpoint Implementation
 */
class CustomEndpointProvider implements AIProvider {
  async generateInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport> {
    if (!config.customEndpoint) throw new Error("No custom endpoint configured");
    
    const response = await fetch(config.customEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: events.slice(-50), // Send recent sample
        timestamp: Date.now()
      })
    });

    if (!response.ok) throw new Error(`External API error: ${response.status}`);
    return await response.json();
  }
}

export const aiManager = {
  async getInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport> {
    try {
      const provider = config.provider === 'gemini-builtin' 
        ? new GeminiProvider() 
        : new CustomEndpointProvider();
        
      return await provider.generateInsights(events, config);
    } catch (error) {
      console.error("AI Insight Error:", error);
      return {
        summary: "The AI engine is currently unavailable or misconfigured.",
        suggestions: ["Check your API settings in the Settings tab.", "Ensure your network allows outbound AI requests."],
        performanceScore: 0
      };
    }
  }
};
