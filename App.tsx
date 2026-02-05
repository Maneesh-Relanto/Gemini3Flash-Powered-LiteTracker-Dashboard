
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { AnalyticsEvent, DailyStats, InsightReport, FunnelReport, AIConfig, FunnelStep } from './types';
import { aiManager } from './services/aiService';
import StatCard from './components/StatCard';
import SnippetGenerator from './components/SnippetGenerator';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

interface SentLog {
  id: string;
  type: string;
  timestamp: string;
  status: 'success' | 'error' | 'pending';
  payload?: any;
  errorMessage?: string;
}

const SCENARIOS = {
  ecommerce: { event: "purchase_complete", path: "/checkout/success", transaction_id: "TXN_9921", amount: 124.50 },
  saas: { event: "signup_start", path: "/signup", plan: "premium" },
  error: { event: "api_failure", status_code: 500, error_msg: "Timeout" }
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('litetrack_theme') as 'light' | 'dark') || 'light';
  });
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [insights, setInsights] = useState<InsightReport | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'technical' | 'funnels' | 'install' | 'deploy' | 'settings'>('overview');
  const [lastMatchedStep, setLastMatchedStep] = useState<string | null>(null);
  
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    const saved = localStorage.getItem('litetrack_ai_config');
    return saved ? JSON.parse(saved) : {
      provider: 'gemini-builtin',
      model: 'gemini-3-flash-preview'
    };
  });

  const [customEndpoint, setCustomEndpoint] = useState(() => localStorage.getItem('litetrack_endpoint') || '');
  const [isVerified, setIsVerified] = useState(() => localStorage.getItem('litetrack_verified') === 'true');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sentLogs, setSentLogs] = useState<SentLog[]>([]);
  const [customJson, setCustomJson] = useState(JSON.stringify(SCENARIOS.ecommerce, null, 2));

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('litetrack_ai_config', JSON.stringify(aiConfig));
    localStorage.setItem('litetrack_endpoint', customEndpoint);
    localStorage.setItem('litetrack_verified', String(isVerified));
    localStorage.setItem('litetrack_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [aiConfig, customEndpoint, isVerified, theme]);

  // Seed initial data
  useEffect(() => {
    const initialEvents: AnalyticsEvent[] = [];
    const now = Date.now();
    const seed = (count: number, path: string, type: string) => {
      const referrers = ['google.com', 'twitter.com', 'direct', 'linkedin.com', 'github.com'];
      for (let i = 0; i < count; i++) {
        initialEvents.push({
          id: Math.random().toString(36).substr(2, 9),
          type, path, 
          referrer: referrers[Math.floor(Math.random() * referrers.length)],
          timestamp: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
          metadata: { 
            browser: i % 3 === 0 ? 'Chrome' : i % 3 === 1 ? 'Safari' : 'Firefox', 
            os: i % 2 === 0 ? 'MacOS' : 'Windows', 
            device: i % 4 === 0 ? 'mobile' : 'desktop',
            duration: Math.floor(Math.random() * 180) + 20,
            loadTime: Math.floor(Math.random() * 1100) + 350
          }
        });
      }
    };
    seed(450, '/home', 'pageview');
    seed(280, '/pricing', 'pageview');
    seed(120, '/signup', 'signup_start');
    seed(65, '/checkout/success', 'purchase_complete');
    setEvents(initialEvents);
  }, []);

  const chartData = useMemo(() => {
    const statsMap: Record<string, number> = {};
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    sorted.slice(-50).forEach(e => {
      const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statsMap[time] = (statsMap[time] || 0) + 1;
    });
    return Object.entries(statsMap).map(([name, views]) => ({ name, views }));
  }, [events]);

  const stats = useMemo(() => {
    const totalEvents = events.length;
    const homeViews = events.filter(e => e.path === '/home').length;
    const progressionViews = events.filter(e => e.path !== '/home').length;
    const bounceRate = Math.round((homeViews / (homeViews + progressionViews || 1)) * 100 * 0.45);
    
    const uniqueIds = new Set(events.map(e => `${e.metadata.browser}-${e.metadata.os}-${e.path.slice(0,3)}`));
    const uniqueVisitors = uniqueIds.size * 12;

    const avgDuration = events.length > 0 
      ? Math.round(events.reduce((acc, e) => acc + (e.metadata.duration || 45), 0) / events.length)
      : 0;

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const activeNow = events.filter(e => e.timestamp > fiveMinutesAgo).length;

    const avgLoadTime = events.length > 0
      ? Math.round(events.reduce((acc, e) => acc + (e.metadata.loadTime || 600), 0) / events.length)
      : 0;

    const uniqueSources = new Set(events.map(e => e.referrer)).size;

    return {
      totalEvents,
      uniqueVisitors,
      bounceRate: bounceRate > 100 ? 100 : bounceRate,
      avgDuration,
      activeNow,
      avgLoadTime,
      uniqueSources,
      pipelineScore: Math.round((events.filter(e => e.type === 'purchase_complete').length / (events.filter(e => e.path === '/home').length || 1)) * 100)
    };
  }, [events]);

  const technicalStats = useMemo(() => {
    const browsers: Record<string, number> = {};
    const oss: Record<string, number> = {};
    events.forEach(e => {
      browsers[e.metadata.browser] = (browsers[e.metadata.browser] || 0) + 1;
      oss[e.metadata.os] = (oss[e.metadata.os] || 0) + 1;
    });
    return {
      browsers: Object.entries(browsers).map(([name, value]) => ({ name, value })),
      oss: Object.entries(oss).map(([name, value]) => ({ name, value }))
    };
  }, [events]);

  const funnelData: FunnelReport = useMemo(() => {
    const steps = [
      { label: 'Visited Home', count: events.filter(e => e.path === '/home').length, stepKey: 'home' },
      { label: 'Viewed Pricing', count: events.filter(e => e.path === '/pricing' || e.type.includes('pricing')).length, stepKey: 'pricing' },
      { label: 'Started Signup', count: events.filter(e => e.path === '/signup' || e.type === 'signup_start').length, stepKey: 'signup' },
      { label: 'Completed', count: events.filter(e => e.path === '/checkout/success' || e.type === 'purchase_complete').length, stepKey: 'completed' }
    ];
    const totalBase = steps[0].count || 1;
    return {
      name: "Conversion Pipeline",
      steps: steps.map((s, i, arr) => ({
        ...s,
        dropoff: i === 0 ? 0 : Math.round((1 - (s.count / (arr[i - 1].count || 1))) * 100),
        conversion: Math.round((s.count / totalBase) * 100)
      })) as FunnelStep[]
    };
  }, [events]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const verifyConnection = async () => {
    setTestStatus('sending');
    setErrorMessage(null);
    try {
      const response = await fetch(customEndpoint, {
        method: 'POST', mode: 'cors',
        body: JSON.stringify({ event: 'ping', test: true }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) { 
        setIsVerified(true); 
        setTestStatus('success'); 
        setTimeout(() => setTestStatus('idle'), 2000);
      } else {
        throw new Error(`Pipeline returned ${response.status}`);
      }
    } catch (e: any) { 
      setTestStatus('error'); 
      setErrorMessage(e.message); 
    }
  };

  const disconnect = () => {
    setIsVerified(false);
    setTestStatus('idle');
    setErrorMessage(null);
  };

  const sendSimulatedEvent = async (payloadOverride?: any) => {
    if (!isVerified) return;
    const finalPayload = payloadOverride || JSON.parse(customJson);
    try {
      setTestStatus('sending');
      const response = await fetch(customEndpoint, {
        method: 'POST', mode: 'cors',
        body: JSON.stringify(finalPayload),
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const localEvent: AnalyticsEvent = {
          id: Math.random().toString(36).substr(2, 5),
          type: finalPayload.event || 'click', path: finalPayload.path || '/simulator',
          referrer: 'LiteTrack Sim', timestamp: Date.now(),
          metadata: { 
            browser: 'Chrome', os: 'Cloud', device: 'desktop', 
            duration: Math.floor(Math.random() * 100) + 10,
            loadTime: Math.floor(Math.random() * 500) + 150
          }
        };
        setEvents(prev => [...prev, localEvent]);
        
        const newLog: SentLog = {
          id: localEvent.id,
          type: localEvent.type,
          timestamp: new Date().toLocaleTimeString(),
          status: 'success',
          payload: finalPayload
        };
        setSentLogs(prev => [newLog, ...prev].slice(0, 10));
        
        let matchedStep: string | null = null;
        if (finalPayload.path === '/home') matchedStep = 'home';
        else if (finalPayload.path === '/pricing') matchedStep = 'pricing';
        else if (finalPayload.event === 'signup_start') matchedStep = 'signup';
        else if (finalPayload.event === 'purchase_complete') matchedStep = 'completed';
        
        if (matchedStep) {
          setLastMatchedStep(matchedStep);
          setTimeout(() => setLastMatchedStep(null), 2000);
        }
        
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 1500);
      }
    } catch (e: any) {
      setTestStatus('error');
    }
  };

  const quickSend = (type: string) => {
    let path = '/simulator';
    if (type === 'pageview') path = '/home';
    if (type === 'view_pricing') { type = 'pageview'; path = '/pricing'; }
    if (type === 'signup_start') path = '/signup';
    if (type === 'purchase_complete') path = '/checkout/success';
    sendSimulatedEvent({ event: type, path, timestamp: new Date().toISOString() });
  };

  const fetchInsights = useCallback(async () => {
    setIsLoadingInsights(true);
    const report = await aiManager.getInsights(events, aiConfig);
    setInsights(report);
    setIsLoadingInsights(false);
  }, [events, aiConfig]);

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} overflow-x-hidden`}>
      {/* Side Navigation */}
      <nav className={`fixed top-0 left-0 h-full w-64 border-r transition-colors duration-500 p-6 hidden md:block z-30 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-100">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <span className={`text-xl font-bold tracking-tight transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>LiteTrack</span>
        </div>

        <ul className="space-y-1.5">
          {[
            { id: 'overview', label: 'Overview', help: 'Primary dashboard for general metrics and traffic charts.', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
            { id: 'technical', label: 'Technical', help: 'Device, OS, and Browser distributions.', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
            { id: 'funnels', label: 'Funnels', help: 'Multi-stage conversion path analysis.', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg> },
            { id: 'install', label: 'Integration', help: 'Live handshake control and simulator tools.', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
            { id: 'deploy', label: 'Deployment', help: 'optimized edge-scripts for Cloudflare Workers.', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
            { id: 'settings', label: 'Settings', help: 'AI model configuration and provider endpoints.', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> }
          ].map((tab) => (
            <li key={tab.id} className="group/nav relative">
              <button 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`w-full text-left px-4 py-2.5 rounded-xl font-medium transition-all flex items-center gap-3 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : theme === 'dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
              <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 w-48 p-2.5 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all z-50 pointer-events-none shadow-xl border border-white/10 font-bold uppercase tracking-widest leading-relaxed">
                {tab.help}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-slate-900"></div>
              </div>
            </li>
          ))}
        </ul>
      </nav>

      <main className="md:ml-64 p-4 md:p-8 max-w-[1400px] mx-auto min-h-screen">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className={`text-2xl font-bold tracking-tight transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>LiteTrack Dashboard</h1>
            <p className="text-slate-500 text-sm font-medium">Real-time Web Analytics Interface</p>
          </div>
          <div className="flex items-center gap-4">
             <button 
                onClick={toggleTheme}
                className={`p-2.5 rounded-xl border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-yellow-400' : 'bg-white border-slate-200 text-slate-600'}`}
             >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                )}
             </button>

             {testStatus === 'success' && <div className="text-emerald-600 text-xs font-bold uppercase tracking-widest flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Receiver Active</div>}
             <div className="relative group/btn">
               <button 
                onClick={fetchInsights}
                disabled={isLoadingInsights}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-xl shadow-indigo-100 flex items-center gap-2 active:scale-95"
              >
                {isLoadingInsights ? 'Processing...' : 'AI Traffic Analysis'}
              </button>
              <div className="absolute top-full right-0 mt-3 w-64 p-3 bg-slate-900 text-white text-[10px] rounded-xl opacity-0 invisible group-hover/btn:opacity-100 group-hover/btn:visible transition-all z-50 pointer-events-none shadow-2xl border border-white/10 leading-relaxed text-center font-bold uppercase tracking-widest">
                Deep behavioral analysis using Google Gemini models.
                <div className="absolute bottom-full right-8 border-8 border-transparent border-b-slate-900"></div>
              </div>
             </div>
          </div>
        </header>

        {insights && (
          <div className={`mb-10 p-8 rounded-3xl shadow-2xl animate-in fade-in zoom-in duration-500 border ${theme === 'dark' ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-900 text-white border-slate-800'}`}>
             <div className="flex items-center gap-2 mb-4 text-indigo-400 uppercase tracking-[0.2em] text-[10px] font-black">
               <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
               Intelligent Behavioral Report
             </div>
             <p className="text-xl font-medium mb-8 leading-relaxed max-w-4xl opacity-90">{insights.summary}</p>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-sm">
                   <h4 className="font-bold text-xs mb-4 text-slate-400 uppercase tracking-widest">Growth Recommendations</h4>
                   <ul className="text-sm space-y-3">
                      {insights.suggestions.map((s, i) => <li key={i} className="flex gap-3 items-start"><span className="text-indigo-500 font-bold">#</span> <span className="opacity-80">{s}</span></li>)}
                   </ul>
                </div>
                <div className="flex flex-col justify-center items-center bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-sm relative group/score">
                   <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path className="text-slate-800" strokeDasharray="100, 100" strokeWidth="3" fill="none" stroke="currentColor" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="text-indigo-500 transition-all duration-1000" strokeDasharray={`${insights.performanceScore}, 100`} strokeWidth="3" strokeLinecap="round" fill="none" stroke="currentColor" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <span className="absolute text-3xl font-bold font-mono tracking-tighter">{insights.performanceScore}</span>
                   </div>
                   <span className="text-[10px] uppercase font-black text-slate-500 mt-4 tracking-widest">Performance Score</span>
                   <div className="absolute bottom-full mb-3 w-40 p-2 bg-slate-800 text-white text-[9px] rounded-lg opacity-0 invisible group-hover/score:opacity-100 group-hover/score:visible transition-all text-center font-bold uppercase tracking-widest pointer-events-none">
                      Calculated from traffic density vs engagement targets.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
                   </div>
                </div>
             </div>
          </div>
        )}

        <div className="w-full">
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard 
                  label="Active Now" 
                  value={stats.activeNow.toLocaleString()} 
                  description="Users who have interacted with the site in the last 5 minutes."
                  icon={<div className="relative"><span className="absolute -top-1 -right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span></span><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg></div>} 
                />
                <StatCard 
                  label="Unique Visitors" 
                  value={stats.uniqueVisitors.toLocaleString()} 
                  description="Estimated number of distinct users based on identity fingerprinting."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>} 
                />
                <StatCard 
                  label="Bounce Rate" 
                  value={`${stats.bounceRate}%`} 
                  description="Percentage of visitors who left after viewing only one page."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8l2-2m0 0l2 2m-2-2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h3" /></svg>} 
                />
                <StatCard 
                  label="Avg Duration" 
                  value={`${stats.avgDuration}s`} 
                  description="The average time spent per detected user session."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} 
                />
                <StatCard 
                  label="Load Velocity" 
                  value={`${stats.avgLoadTime}ms`} 
                  description="Average time from page request until interaction capability."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} 
                />
                <StatCard 
                  label="Unique Sources" 
                  value={stats.uniqueSources.toLocaleString()} 
                  description="Number of unique referring domains and traffic origins detected."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>} 
                />
                <StatCard 
                  label="Total Events" 
                  value={stats.totalEvents.toLocaleString()} 
                  description="Total volume of user events ingested since session start."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>} 
                />
                <StatCard 
                  label="Network Health" 
                  value="100%" 
                  description="Percentage of events correctly formatted and acknowledged by the worker."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} 
                />
                <StatCard 
                  label="Pipeline Score" 
                  value={`${stats.pipelineScore}%`} 
                  description="Direct conversion efficiency of the absolute session journey."
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} 
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className={`lg:col-span-2 p-8 rounded-3xl border transition-colors relative group/traffic ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h3 className={`font-bold mb-8 flex items-center gap-3 ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-lg shadow-indigo-100"></div>
                    Real-time Traffic Velocity
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{fill: theme === 'dark' ? '#64748b' : '#94a3b8'}} />
                        <YAxis hide />
                        <Tooltip contentStyle={{ 
                          borderRadius: '16px', 
                          border: 'none', 
                          backgroundColor: theme === 'dark' ? '#0f172a' : '#fff',
                          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                          color: theme === 'dark' ? '#fff' : '#000'
                        }} />
                        <Area type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorViews)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="absolute top-6 right-8 opacity-0 group-hover/traffic:opacity-100 transition-all text-[9px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">
                    Aggregated by 1-minute windows
                  </div>
                </div>

                <div className={`rounded-3xl p-6 text-white overflow-hidden relative border shadow-2xl flex flex-col ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-900 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold flex items-center gap-2 text-indigo-400 text-sm uppercase tracking-widest">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Live Stream
                    </h3>
                  </div>
                  <div className="space-y-3 flex-1 overflow-y-auto scrollbar-hide pr-1 font-mono text-[10px]">
                    {sentLogs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-600 italic text-center px-4">
                        Awaiting incoming events from the established pipeline...
                      </div>
                    ) : (
                      sentLogs.map(log => (
                        <div key={log.id} className="animate-in slide-in-from-right duration-500 bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/50">
                          <div className="flex items-center justify-between font-black mb-1.5 uppercase tracking-wider text-[8px]">
                            <span className={log.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}>{log.status}</span>
                            <span className="text-slate-500">{log.timestamp}</span>
                          </div>
                          <div className="text-indigo-100 truncate flex items-center gap-2">
                             <span className="opacity-40">>></span> {log.type}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'technical' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
               <div className={`p-8 rounded-3xl border transition-colors group/agent relative ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h3 className={`text-lg font-bold mb-8 flex items-center justify-between ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                     <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div> User Agent Analysis
                     </div>
                     <div className="relative group/chartinfo">
                        <svg className="w-4 h-4 text-slate-300 hover:text-indigo-500 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <div className="absolute bottom-full right-0 mb-3 w-40 p-2 bg-slate-800 text-white text-[9px] rounded-lg opacity-0 invisible group-hover/chartinfo:opacity-100 group-hover/chartinfo:visible transition-all text-center font-bold uppercase tracking-widest pointer-events-none">
                            Aggregated browser usage from metadata tags.
                            <div className="absolute top-full right-1.5 border-8 border-transparent border-t-slate-800"></div>
                        </div>
                     </div>
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={technicalStats.browsers} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" fontSize={11} width={100} axisLine={false} tickLine={false} tick={{fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontWeight: 600}} />
                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={28}>
                          {technicalStats.browsers.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
               <div className={`p-8 rounded-3xl border transition-colors group/os relative ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h3 className={`text-lg font-bold mb-8 flex items-center justify-between ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div> OS Distribution
                    </div>
                    <div className="relative group/chartinfo">
                        <svg className="w-4 h-4 text-slate-300 hover:text-indigo-500 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <div className="absolute bottom-full right-0 mb-3 w-40 p-2 bg-slate-800 text-white text-[9px] rounded-lg opacity-0 invisible group-hover/chartinfo:opacity-100 group-hover/chartinfo:visible transition-all text-center font-bold uppercase tracking-widest pointer-events-none">
                            Operating system share among unique visitors.
                            <div className="absolute top-full right-1.5 border-8 border-transparent border-t-slate-800"></div>
                        </div>
                     </div>
                  </h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={technicalStats.oss} innerRadius={70} outerRadius={100} paddingAngle={10} dataKey="value" animationDuration={1200} stroke="none">
                          {technicalStats.oss.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'funnels' && (
            <div className="space-y-8 animate-in fade-in duration-700">
               <div className={`p-10 rounded-3xl border relative overflow-hidden transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 relative z-10">
                    <div>
                      <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Conversion Pipeline</h2>
                      <p className="text-sm text-slate-500 font-medium">Tracking multi-step efficiency across simulated journeys.</p>
                    </div>
                    <div className="mt-4 md:mt-0 px-6 py-3 bg-indigo-50 text-indigo-700 rounded-2xl font-black text-xs border-2 border-indigo-100 uppercase tracking-[0.2em] shadow-sm">
                       {funnelData.steps[funnelData.steps.length-1].conversion}% Success Rate
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-12 max-w-4xl relative z-10 mx-auto md:mx-0">
                    {funnelData.steps.map((step, idx) => (
                      <div key={idx} className={`relative transition-all duration-700 group/funnel ${lastMatchedStep === step.stepKey ? 'scale-[1.03]' : ''}`}>
                        <div className="flex items-center gap-8">
                          <div className="w-44 text-right hidden md:block">
                             <div className={`flex items-center justify-end gap-3 mb-1 transition-colors duration-300 ${lastMatchedStep === step.stepKey ? 'text-indigo-600' : theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                               {lastMatchedStep === step.stepKey && <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-ping"></span>}
                               <span className="text-sm font-bold">{step.label}</span>
                             </div>
                             <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{step.count.toLocaleString()} sessions</p>
                          </div>
                          <div className={`flex-1 h-16 rounded-2xl relative overflow-hidden border-2 transition-all duration-500 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'} ${lastMatchedStep === step.stepKey ? 'shadow-xl shadow-indigo-500/20 border-indigo-500' : theme === 'dark' ? 'border-slate-700' : 'border-slate-100'}`}>
                             <div 
                                className={`h-full bg-indigo-600 transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex items-center justify-end px-6 relative
                                  ${lastMatchedStep === step.stepKey ? 'brightness-125 saturate-150' : ''}`}
                                style={{ width: `${(step.count / (funnelData.steps[0].count || 1)) * 100}%` }}
                             >
                                <span className={`text-[11px] font-black text-white transition-all duration-300 ${lastMatchedStep === step.stepKey ? 'scale-125' : 'opacity-40'}`}>
                                  {step.conversion}%
                                </span>
                             </div>
                             <div className="absolute top-1/2 left-4 -translate-y-1/2 opacity-0 invisible group-hover/funnel:opacity-100 group-hover/funnel:visible transition-all pointer-events-none bg-slate-900 text-white text-[9px] font-bold px-3 py-1.5 rounded-lg z-20 uppercase tracking-widest border border-white/10 shadow-xl">
                               {step.count.toLocaleString()} Users reached this stage
                             </div>
                          </div>
                        </div>
                        
                        {idx < funnelData.steps.length - 1 && (
                          <div className="ml-0 md:ml-44 py-4 flex items-center gap-4 group/leakage relative">
                             <div className={`w-0.5 h-10 ml-6 relative overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                               <div className={`absolute top-0 left-0 w-full h-full bg-rose-500 transition-all duration-1000 ${lastMatchedStep === step.stepKey ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}></div>
                             </div>
                             <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border-2 transition-all duration-500 flex items-center gap-2 cursor-help
                               ${lastMatchedStep === funnelData.steps[idx].stepKey ? 'bg-rose-50 text-rose-500 border-rose-200 translate-x-2' : theme === 'dark' ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-50 hover:opacity-100'}`}>
                               <svg className={`w-2.5 h-2.5 transition-transform duration-500 ${lastMatchedStep === step.stepKey ? 'animate-bounce' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M19 14l-7 7-7-7" /></svg>
                               {step.dropoff}% drop-off
                             </span>
                             <div className="absolute top-1/2 left-full ml-4 -translate-y-1/2 opacity-0 invisible group-hover/leakage:opacity-100 group-hover/leakage:visible transition-all pointer-events-none bg-slate-900 text-white text-[9px] font-bold px-3 py-1.5 rounded-lg z-20 uppercase tracking-widest border border-white/10 shadow-xl w-40 leading-relaxed">
                               Percentage of users who abandoned the session at this step.
                               <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-slate-900"></div>
                             </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'install' && (
            <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
               <div className={`rounded-3xl border p-8 transition-all duration-500 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'} ${!isVerified ? 'text-center p-16' : ''}`}>
                  <div className={`flex flex-col ${isVerified ? 'md:flex-row md:items-center' : 'items-center'} justify-between gap-8`}>
                    <div className={`flex items-center gap-5 ${!isVerified ? 'flex-col mb-4' : ''}`}>
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner transition-colors ${isVerified ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
                         <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>
                      <div className={!isVerified ? 'text-center' : ''}>
                        <h2 className={`text-2xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Handshake Center</h2>
                        <p className="text-sm text-slate-500 font-medium">{isVerified ? 'The pipeline is established and synchronized.' : 'Connect your Cloudflare Edge receiver to track traffic.'}</p>
                      </div>
                    </div>

                    <div className={`flex-1 ${isVerified ? 'max-w-3xl' : 'w-full max-w-3xl'} flex flex-col md:flex-row items-stretch md:items-center gap-3`}>
                      {!isVerified ? (
                        <>
                          <input 
                            type="text" placeholder="https://your-worker.workers.dev"
                            value={customEndpoint} onChange={(e) => setCustomEndpoint(e.target.value)}
                            className={`flex-1 border-2 rounded-2xl px-6 py-4 text-sm focus:ring-4 outline-none font-mono transition-all ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-900/30 focus:border-indigo-500' : 'bg-slate-50 border-slate-100 focus:ring-indigo-100 focus:border-indigo-600'}`}
                          />
                          <div className="relative group/establish">
                            <button 
                              onClick={verifyConnection} disabled={testStatus === 'sending'}
                              className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-200 dark:shadow-indigo-900/20 active:scale-95 whitespace-nowrap"
                            >
                              {testStatus === 'sending' ? 'Verifying...' : 'Establish Connection'}
                            </button>
                            <div className="absolute top-full right-0 mt-3 w-56 p-3 bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest rounded-xl opacity-0 invisible group-hover/establish:opacity-100 group-hover/establish:visible transition-all z-50 pointer-events-none shadow-2xl border border-white/10 leading-relaxed text-center">
                              Sends a POST request to verify the receiver endpoint handles CORS and JSON inputs correctly.
                              <div className="absolute bottom-full right-8 border-8 border-transparent border-b-slate-900"></div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className={`flex items-center justify-between w-full border-2 px-6 py-4 rounded-2xl shadow-inner relative group/active-link ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                          <span className="text-sm font-mono text-slate-500 truncate mr-6">{customEndpoint}</span>
                          <button 
                            onClick={disconnect}
                            className="px-6 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100 active:scale-95 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30"
                          >
                            Disconnect
                          </button>
                          <div className="absolute top-full left-0 mt-3 w-48 p-2 bg-slate-800 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg opacity-0 invisible group-hover/active-link:opacity-100 group-hover/active-link:visible transition-all z-50 pointer-events-none text-center border border-white/5">
                            Active ingestion endpoint
                            <div className="absolute bottom-full left-8 border-8 border-transparent border-b-slate-800"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {errorMessage && <p className="text-rose-500 text-xs font-bold mt-8 animate-in slide-in-from-top-1 px-5 py-3.5 bg-rose-50 dark:bg-rose-950/30 rounded-2xl border-2 border-rose-100 dark:border-rose-900/30 text-center">{errorMessage}</p>}
               </div>

               {isVerified && (
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-6 duration-700">
                    <div className={`p-10 rounded-3xl border transition-colors flex flex-col ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <h3 className={`text-xl font-bold mb-8 flex items-center gap-3 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                        </div>
                        Quick Simulation
                      </h3>
                      <div className="grid grid-cols-1 gap-4 flex-1">
                         {[
                           { label: 'Simulate Home Landing', type: 'pageview', sub: 'Event: pageview | /home', help: 'Increments funnel base. Path: /home' },
                           { label: 'Enter Pricing Journey', type: 'view_pricing', sub: 'Event: pageview | /pricing', help: 'Path: /pricing' },
                           { label: 'Trigger Signup Modal', type: 'signup_start', sub: 'Event: signup_start', help: 'Type: signup_start' },
                           { label: 'Confirm Checkout Sale', type: 'purchase_complete', sub: 'Event: purchase_complete', help: 'Type: purchase_complete' },
                         ].map(t => (
                           <div key={t.label} className="relative group/sim">
                             <button onClick={() => quickSend(t.type)} className={`w-full flex items-center justify-between p-5 border-2 rounded-2xl transition-all group active:scale-[0.98] text-left ${theme === 'dark' ? 'bg-slate-800 border-slate-700 hover:border-indigo-500 hover:bg-slate-750' : 'bg-slate-50 border-slate-100 hover:border-indigo-600 hover:bg-white'}`}>
                                <div>
                                  <span className={`text-sm font-bold block ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>{t.label}</span>
                                  <span className="text-[10px] text-slate-400 font-mono mt-0.5">{t.sub}</span>
                                </div>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm ${theme === 'dark' ? 'bg-slate-700 group-hover:bg-indigo-600' : 'bg-slate-200 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7-7 7" /></svg>
                                </div>
                             </button>
                             <div className="absolute top-1/2 left-full ml-4 -translate-y-1/2 opacity-0 invisible group-hover/sim:opacity-100 group-hover/sim:visible transition-all pointer-events-none bg-slate-900 text-white text-[9px] font-bold px-3 py-1.5 rounded-lg z-20 uppercase tracking-widest border border-white/10 shadow-xl">
                               {t.help}
                               <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-slate-900"></div>
                             </div>
                           </div>
                         ))}
                      </div>
                    </div>
                    <div className={`p-10 rounded-3xl border transition-colors flex flex-col ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <h3 className={`text-xl font-bold mb-8 flex items-center gap-3 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                        <div className="p-3 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                        </div>
                        Payload Dispatch
                      </h3>
                      <div className="flex-1 flex flex-col group/payload relative">
                        <textarea 
                          value={customJson} onChange={(e) => setCustomJson(e.target.value)}
                          className={`w-full font-mono text-[11px] p-6 rounded-2xl border-4 min-h-[180px] mb-6 outline-none shadow-inner transition-colors ${theme === 'dark' ? 'bg-slate-950 text-indigo-400 border-slate-800 focus:ring-indigo-500/20' : 'bg-slate-900 text-indigo-300 border-slate-800 focus:ring-indigo-100'}`}
                        />
                        <button onClick={() => sendSimulatedEvent()} className={`w-full py-5 text-white rounded-2xl font-black transition-all shadow-xl active:scale-95 uppercase text-xs tracking-[0.2em] flex items-center justify-center gap-3 ${theme === 'dark' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-900 hover:bg-black'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                          Transmit Payload
                        </button>
                        <div className="absolute bottom-full left-0 mb-3 w-48 p-2 bg-slate-800 text-white text-[9px] font-bold uppercase tracking-widest rounded-lg opacity-0 invisible group-hover/payload:opacity-100 group-hover/payload:visible transition-all z-20 text-center border border-white/5">
                            Send custom event JSON
                            <div className="absolute top-full left-8 border-8 border-transparent border-t-slate-800"></div>
                        </div>
                      </div>
                    </div>
                 </div>
               )}
            </div>
          )}

          {activeTab === 'deploy' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
               <div className={`p-12 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h2 className={`text-2xl font-bold mb-2 tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Receiver Implementation</h2>
                  <p className="text-sm text-slate-500 mb-12 font-medium">Use these optimized edge-scripts to create your own globally distributed analytics endpoint.</p>
                  <SnippetGenerator endpoint={customEndpoint} />
               </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
               <div className={`p-10 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <h2 className={`text-2xl font-bold mb-2 tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>AI Strategy Engine</h2>
                  <p className="text-sm text-slate-500 mb-10 font-medium">Configure how behavioral data is processed for strategic reporting.</p>
                  
                  <div className="space-y-8">
                     <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Intelligence Model</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="relative group/provider">
                             <button 
                                onClick={() => setAiConfig({ ...aiConfig, provider: 'gemini-builtin' })}
                                className={`w-full p-6 rounded-2xl border-2 text-left transition-all flex flex-col gap-1 ${aiConfig.provider === 'gemini-builtin' ? (theme === 'dark' ? 'border-indigo-500 bg-indigo-950/20 ring-4 ring-indigo-900/10' : 'border-indigo-600 bg-indigo-50 ring-4 ring-indigo-50') : theme === 'dark' ? 'border-slate-800 hover:border-slate-700' : 'border-slate-100 hover:border-slate-200'}`}
                             >
                                <span className={`block font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Edge Gemini</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Built-in Flash Inference</span>
                             </button>
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-2.5 bg-slate-900 text-white text-[9px] rounded-lg opacity-0 invisible group-hover/provider:opacity-100 group-hover/provider:visible transition-all z-20 text-center font-bold uppercase tracking-widest border border-white/10 shadow-xl pointer-events-none">
                                Direct integration with Google's high-speed Flash models.
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
                             </div>
                           </div>
                           <div className="relative group/provider">
                             <button 
                                onClick={() => setAiConfig({ ...aiConfig, provider: 'custom-endpoint' })}
                                className={`w-full p-6 rounded-2xl border-2 text-left transition-all flex flex-col gap-1 ${aiConfig.provider === 'custom-endpoint' ? (theme === 'dark' ? 'border-indigo-500 bg-indigo-950/20 ring-4 ring-indigo-900/10' : 'border-indigo-600 bg-indigo-50 ring-4 ring-indigo-50') : theme === 'dark' ? 'border-slate-800 hover:border-slate-700' : 'border-slate-100 hover:border-slate-200'}`}
                             >
                                <span className={`block font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Custom Logic</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Proprietary External Provider</span>
                             </button>
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-2.5 bg-slate-900 text-white text-[9px] rounded-lg opacity-0 invisible group-hover/provider:opacity-100 group-hover/provider:visible transition-all z-20 text-center font-bold uppercase tracking-widest border border-white/10 shadow-xl pointer-events-none">
                                Route traffic insights through your own specialized API.
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
                             </div>
                           </div>
                        </div>
                     </div>

                     <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                       {aiConfig.provider === 'gemini-builtin' ? (
                          <div className="space-y-6">
                             <div className="relative group/tier">
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Inference Tier</label>
                                <select 
                                   value={aiConfig.model}
                                   onChange={(e: any) => setAiConfig({ ...aiConfig, model: e.target.value })}
                                   className={`w-full border-2 p-4 rounded-xl text-sm font-bold outline-none appearance-none transition-all cursor-pointer ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-4 focus:ring-indigo-900/20' : 'bg-slate-50 border-slate-100 focus:ring-4 focus:ring-indigo-100'}`}
                                >
                                   <option value="gemini-3-flash-preview">Flash (Balanced Velocity)</option>
                                   <option value="gemini-3-pro-preview">Pro (Advanced Reasoning)</option>
                                </select>
                                <div className="absolute top-0 right-0 p-3 opacity-40 pointer-events-none">
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                                </div>
                                <div className="absolute bottom-full left-0 mb-3 w-56 p-2 bg-slate-800 text-white text-[9px] rounded-lg opacity-0 invisible group-hover/tier:opacity-100 group-hover/tier:visible transition-all text-center font-bold uppercase tracking-widest border border-white/5 shadow-xl">
                                    Higher tiers provide deeper reasoning but may increase latency.
                                    <div className="absolute top-full left-8 border-8 border-transparent border-t-slate-800"></div>
                                </div>
                             </div>
                             <div className={`p-6 rounded-2xl border flex items-center justify-between gap-6 transition-colors ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                               <div className="flex-1">
                                 <h4 className={`text-sm font-bold mb-1 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>Inference Auth</h4>
                                 <p className="text-xs text-slate-500 font-medium leading-relaxed">Required for accessing restricted models.</p>
                               </div>
                               <button 
                                 onClick={async () => (window as any).aistudio?.openSelectKey()}
                                 className={`px-6 py-3 border rounded-xl text-xs font-black transition-all shadow-sm active:scale-95 uppercase tracking-widest ${theme === 'dark' ? 'bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}
                               >
                                 Manage Keys
                               </button>
                             </div>
                          </div>
                       ) : (
                          <div>
                             <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Inference Endpoint URL</label>
                             <input 
                                type="text" placeholder="https://your-api.com/v1/analyze"
                                value={aiConfig.customEndpoint || ''}
                                onChange={(e) => setAiConfig({ ...aiConfig, customEndpoint: e.target.value })}
                                className={`w-full border-2 p-5 rounded-2xl text-sm outline-none font-mono shadow-inner transition-colors ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-4 focus:ring-indigo-900/30' : 'bg-slate-50 border-slate-100 focus:ring-4 focus:ring-indigo-100'}`}
                             />
                          </div>
                       )}
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
