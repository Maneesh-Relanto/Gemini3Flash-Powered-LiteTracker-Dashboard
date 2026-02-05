
import { GoogleGenAI, Type } from "@google/genai";
import { AnalyticsEvent, InsightReport } from "../types";

export async function generateAnalyticsInsights(events: AnalyticsEvent[]): Promise<InsightReport> {
  // Always initialize GoogleGenAI within the function to ensure the most current API key is used
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const summaryData = {
    totalEvents: events.length,
    topPages: events.reduce((acc: any, e) => {
      acc[e.path] = (acc[e.path] || 0) + 1;
      return acc;
    }, {}),
    devices: events.reduce((acc: any, e) => {
      acc[e.metadata.device] = (acc[e.metadata.device] || 0) + 1;
      return acc;
    }, {})
  };

  const prompt = `Analyze the following website traffic summary and provide a JSON report:
  ${JSON.stringify(summaryData)}
  
  Please provide:
  1. A concise summary of the traffic patterns.
  2. 3 actionable suggestions to improve user engagement.
  3. A performance score from 0-100 based on the balance of traffic.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            suggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            performanceScore: { type: Type.NUMBER }
          },
          required: ["summary", "suggestions", "performanceScore"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text.trim()) as InsightReport;
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return {
      summary: "Unable to generate insights at this time.",
      suggestions: ["Ensure your tracking script is installed correctly.", "Monitor traffic daily for anomalies."],
      performanceScore: 0
    };
  }
}
