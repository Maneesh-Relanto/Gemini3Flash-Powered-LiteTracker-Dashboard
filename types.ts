
export interface AnalyticsEvent {
  id: string;
  // Broadened to string to allow custom event types like 'signup_start' and 'purchase_complete' from the simulator
  type: string;
  path: string;
  referrer: string;
  timestamp: number;
  metadata: {
    browser: string;
    os: string;
    // Broadened to string to support various device identifiers without type overlap issues
    device: string;
    duration?: number;
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
}

export interface FunnelReport {
  name: string;
  steps: FunnelStep[];
}