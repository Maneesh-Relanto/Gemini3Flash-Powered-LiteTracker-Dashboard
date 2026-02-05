
export interface AnalyticsEvent {
  id: string;
  type: string;
  path: string;
  referrer: string;
  timestamp: number;
  metadata: {
    browser: string;
    os: string;
    device: string;
    country: string; // New: Simulated geo-location
    sessionId: string; // New: For retention/cohort tracking
    duration?: number;
    loadTime?: number;
  };
}

export interface Alert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: number;
}

export interface InsightReport {
  summary: string;
  suggestions: string[];
  performanceScore: number;
  anomalies?: Alert[]; // New: AI-detected anomalies
}

export interface FunnelStep {
  label: string;
  count: number;
  dropoff: number;
  conversion: number;
  stepKey: string;
}

export interface FunnelReport {
  name: string;
  steps: FunnelStep[];
}

export type AIProviderType = 'gemini-builtin' | 'custom-endpoint';

export interface AIConfig {
  provider: AIProviderType;
  model: 'gemini-3-flash-preview' | 'gemini-3-pro-preview';
  customEndpoint?: string;
}
