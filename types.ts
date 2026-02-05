
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
    duration?: number;
    loadTime?: number; // Time in ms for the page to become interactive
  };
}

export interface DailyStats {
  date: string;
  views: number;
  uniques: number;
}

export interface InsightReport {
  summary: string;
  suggestions: string[];
  performanceScore: number;
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
