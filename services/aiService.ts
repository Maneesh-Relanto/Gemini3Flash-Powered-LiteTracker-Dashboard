
import { GoogleGenAI, Type } from "@google/genai";
import { AnalyticsEvent, InsightReport, AIConfig } from "../types";

export interface AIProvider {
  generateInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport>;
}

class GeminiProvider implements AIProvider {
  async generateInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const summaryData = this.prepareSummary(events);
    
    const prompt = `Analyze this website traffic data for patterns and potential technical issues:
    ${JSON.stringify(summaryData)}
    
    Return a JSON report including:
    1. A summary and suggestions.
    2. A performance score (0-100).
    3. An "anomalies" array if you detect issues like high load times (>800ms) or low conversion (<2%).
    
    Format: { 
      "summary": string, 
      "suggestions": string[], 
      "performanceScore": number, 
      "anomalies": [{ "id": string, "level": "info"|"warning"|"critical", "title": string, "message": string }] 
    }`;

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
            performanceScore: { type: Type.NUMBER },
            anomalies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  level: { type: Type.STRING },
                  title: { type: Type.STRING },
                  message: { type: Type.STRING }
                }
              }
            }
          },
          required: ["summary", "suggestions", "performanceScore"]
        }
      }
    });

    const text = response.text || '{}';
    return JSON.parse(text);
  }

  private prepareSummary(events: AnalyticsEvent[]) {
    return {
      total: events.length,
      avgLoadTime: events.reduce((acc, e) => acc + (e.metadata.loadTime || 0), 0) / events.length,
      conversionRate: (events.filter(e => e.type === 'purchase_complete').length / events.length) * 100,
      pages: events.slice(-50).reduce((acc: any, e) => {
        acc[e.path] = (acc[e.path] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

class CustomEndpointProvider implements AIProvider {
  async generateInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport> {
    if (!config.customEndpoint) throw new Error("No custom endpoint configured");
    const response = await fetch(config.customEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: events.slice(-50), timestamp: Date.now() })
    });
    if (!response.ok) throw new Error(`External API error: ${response.status}`);
    return await response.json();
  }
}

export const aiManager = {
  async getInsights(events: AnalyticsEvent[], config: AIConfig): Promise<InsightReport> {
    try {
      const provider = config.provider === 'gemini-builtin' ? new GeminiProvider() : new CustomEndpointProvider();
      return await provider.generateInsights(events, config);
    } catch (error) {
      console.error("AI Insight Error:", error);
      return {
        summary: "Inference engine paused. Check your connection.",
        suggestions: ["Verify API Key.", "Check firewall."],
        performanceScore: 0
      };
    }
  }
};
