
export interface AnalyticsEvent {
  id: string;
  type: 'pageview' | 'click' | 'session_start' | 'session_end';
  path: string;
  referrer: string;
  timestamp: number;
  metadata: {
    browser: string;
    os: string;
    device: 'mobile' | 'desktop' | 'tablet';
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
