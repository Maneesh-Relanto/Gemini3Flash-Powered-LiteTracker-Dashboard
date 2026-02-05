
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
  }, [aiConfig, customEndpoint, isVerified]);

  // Seed initial data
  useEffect(() => {
    const initialEvents: AnalyticsEvent[] = [];
    const now = Date.now();
    const seed = (count: number, path: string, type: string) => {
      for (let i = 0; i < count; i++) {
        initialEvents.push({
          id: Math.random().toString(36).substr(2, 9),
          type, path, referrer: 'direct',
          timestamp: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
          metadata: { 
            browser: i % 3 === 0 ? 'Chrome' : i % 3 === 1 ? 'Safari' : 'Firefox', 
            os: i % 2 === 0 ? 'MacOS' : 'Windows', 
            device: i % 4 === 0 ? 'mobile' : 'desktop' 
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
        throw new Error(`Connection Failed: ${response.status}`);
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
          metadata: { browser: 'Chrome', os: 'Cloud', device: 'desktop' }
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
        
        // Funnel highlighting
        if (finalPayload.path === '/home') setLastMatchedStep('home');
        else if (finalPayload.path === '/pricing') setLastMatchedStep('pricing');
        else if (finalPayload.event === 'signup_start') setLastMatchedStep('signup');
        else if (finalPayload.event === 'purchase_complete') setLastMatchedStep('completed');
        setTimeout(() => setLastMatchedStep(null), 3000);
        
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 2000);
      }
    } catch (e: any) {
      setTestStatus('error');
      const errorLog: SentLog = {
        id: 'ERR',
        type: finalPayload.event,
        timestamp: new Date().toLocaleTimeString(),
        status: 'error',
        errorMessage: e.message
      };
      setSentLogs(prev => [errorLog, ...prev].slice(0, 10));
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Side Navigation */}
      <nav className="fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 p-6 hidden md:block">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-tight">LiteTrack</span>
        </div>

        <ul className="space-y-2">
          {[
            { id: 'overview', label: 'Overview', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg> },
            { id: 'technical', label: 'Technical', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
            { id: 'funnels', label: 'Funnels', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg> },
            { id: 'install', label: 'Integration', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
            { id: 'deploy', label: 'Deployment', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
            { id: 'settings', label: 'Settings', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> }
          ].map((tab) => (
            <li key={tab.id}>
              <button 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`w-full text-left px-4 py-2.5 rounded-xl font-medium transition-all flex items-center gap-3 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <div className={activeTab === tab.id ? 'text-white' : 'text-slate-400'}>{tab.icon}</div>
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main Content Area */}
      <main className="md:ml-64 p-4 md:p-8 max-w-7xl mx-auto pb-20">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">LiteTrack Dashboard</h1>
            <p className="text-slate-500 text-sm font-medium">Real-time Web Intelligence with {aiConfig.provider === 'gemini-builtin' ? 'Gemini AI' : 'Custom Provider'}</p>
          </div>
          <div className="flex items-center gap-4">
             {testStatus === 'success' && <div className="text-emerald-600 text-xs font-bold uppercase tracking-widest flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Pipeline Verified</div>}
             <button 
              onClick={fetchInsights}
              disabled={isLoadingInsights}
              className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition-all disabled:opacity-50 shadow-xl shadow-slate-200 flex items-center gap-2 active:scale-95"
            >
              {isLoadingInsights ? 'Analyzing...' : 'Generate AI Report'}
            </button>
          </div>
        </header>

        {insights && (
          <div className="mb-10 bg-indigo-900 text-white p-8 rounded-3xl shadow-2xl animate-in fade-in zoom-in border border-indigo-800">
             <div className="flex items-center gap-2 mb-4 text-indigo-300 uppercase tracking-widest text-[10px] font-bold">
               <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
               AI Behavioral Strategy ({aiConfig.provider})
             </div>
             <p className="text-xl font-medium mb-8 leading-relaxed max-w-4xl">{insights.summary}</p>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-indigo-950/40 p-6 rounded-2xl border border-indigo-700/50 backdrop-blur-md">
                   <h4 className="font-bold text-xs mb-4 text-indigo-200 uppercase tracking-[0.2em]">Optimization Tactics</h4>
                   <ul className="text-sm space-y-3">
                      {insights.suggestions.map((s, i) => <li key={i} className="flex gap-3 items-start"><span className="text-indigo-400 font-bold">#</span> <span className="opacity-90 leading-relaxed">{s}</span></li>)}
                   </ul>
                </div>
                <div className="flex flex-col justify-center items-center bg-indigo-950/40 p-6 rounded-2xl border border-indigo-700/50 backdrop-blur-md">
                   <div className="relative w-28 h-28 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path className="text-indigo-800" strokeDasharray="100, 100" strokeWidth="2.5" fill="none" stroke="currentColor" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="text-indigo-300 transition-all duration-1000" strokeDasharray={`${insights.performanceScore}, 100`} strokeWidth="2.5" strokeLinecap="round" fill="none" stroke="currentColor" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <span className="absolute text-3xl font-bold font-mono">{insights.performanceScore}</span>
                   </div>
                   <span className="text-[10px] uppercase font-bold text-indigo-400 mt-4 tracking-widest">Global Traction Score</span>
                </div>
             </div>
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard label="Pipeline" value={isVerified ? "CONNECTED" : "OFFLINE"} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
              <StatCard label="Total Events" value={events.length.toLocaleString()} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>} />
              <StatCard label="Pipeline Health" value="100%" icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
              <StatCard label="Success Rate" value={`${funnelData.steps[funnelData.steps.length-1].conversion}%`} icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-8 flex items-center gap-3">
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
                      <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#fff' }} 
                        itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorViews)" animationDuration={1500} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900 rounded-3xl p-6 text-white overflow-hidden relative border border-slate-800 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold flex items-center gap-2 text-indigo-400 text-sm">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    Live Feed
                  </h3>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{sentLogs.length} Events</span>
                </div>
                <div className="space-y-3 flex-1 overflow-y-auto scrollbar-hide pr-1">
                  {sentLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 text-[11px] italic text-center px-4">
                      Awaiting incoming signals from your pipeline...
                    </div>
                  ) : (
                    sentLogs.map(log => (
                      <div key={log.id} className="animate-in slide-in-from-right duration-500 bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/50 hover:border-indigo-500/50 transition-colors">
                        <div className="flex items-center justify-between text-[10px] font-black mb-1.5 uppercase tracking-wider">
                          <span className={log.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}>{log.status}</span>
                          <span className="text-slate-500 font-mono">{log.timestamp}</span>
                        </div>
                        <div className="font-mono text-[11px] text-indigo-100 truncate flex items-center gap-2">
                           <span className="opacity-40">>></span> {log.type}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate font-mono mt-1">{log.payload?.path || '/'}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TECHNICAL TAB */}
        {activeTab === 'technical' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4">
             <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-8 flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-indigo-500"></div> Browser Environment
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={technicalStats.browsers} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" fontSize={11} width={100} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontWeight: 600}} />
                      <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={24}>
                        {technicalStats.browsers.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
             </div>
             <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-8 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div> OS Distribution
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={technicalStats.oss} innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value" animationDuration={1200} stroke="none">
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

        {/* INTEGRATION TAB */}
        {activeTab === 'install' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-6 duration-500">
             {!isVerified ? (
               <div className="bg-white border border-slate-200 rounded-3xl p-16 shadow-2xl text-center max-w-2xl mx-auto">
                   <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                   </div>
                   <h2 className="text-3xl font-bold text-slate-900 mb-3 tracking-tight">Establish Handshake</h2>
                   <p className="text-slate-500 mb-10 font-medium">Connect your LiteTrack receiver (Cloudflare Worker) to enable real-time simulation and AI traffic reporting.</p>
                   
                   <div className="space-y-4">
                      <div className="relative">
                        <input 
                          type="text" placeholder="https://your-receiver.workers.dev"
                          value={customEndpoint} onChange={(e) => setCustomEndpoint(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-center font-mono text-sm focus:ring-4 focus:ring-indigo-100 outline-none transition-all border-2 focus:border-indigo-600"
                        />
                      </div>
                      
                      {errorMessage && <div className="text-rose-600 text-xs font-bold p-4 bg-rose-50 rounded-2xl border border-rose-100 animate-bounce">{errorMessage}</div>}

                      <button 
                        onClick={verifyConnection} disabled={testStatus === 'sending'}
                        className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-200 disabled:opacity-50 active:scale-95"
                      >
                        {testStatus === 'sending' ? 'Verifying Pipeline...' : 'Establish Secure Connection'}
                      </button>
                   </div>
                </div>
             ) : (
               <div className="space-y-8">
                  {/* Connection Header Card */}
                  <div className="bg-indigo-600 rounded-3xl p-8 shadow-2xl text-white flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 opacity-10 -mr-10 -mt-10">
                       <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div className="flex items-center gap-5 relative z-10">
                      <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30 shadow-xl">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 leading-none mb-1.5">Active Receiver</p>
                        <h3 className="text-lg font-mono font-bold truncate max-w-md">{customEndpoint}</h3>
                      </div>
                    </div>
                    <button 
                      onClick={disconnect}
                      className="px-8 py-3.5 bg-rose-500/90 hover:bg-rose-600 text-white rounded-xl text-xs font-black transition-all shadow-xl backdrop-blur-md active:scale-95 z-10 uppercase tracking-widest"
                    >
                      Disconnect Pipeline
                    </button>
                  </div>

                  {/* Dual Column Simulation Panels */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="flex items-center gap-3 mb-8">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-900">Live Simulator</h3>
                            <p className="text-xs text-slate-400 font-medium">Verify tracking logic with instant triggers.</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 flex-1">
                           {[
                             { label: 'Simulate Home Visit', type: 'pageview', sub: 'Event: pageview | Path: /home' },
                             { label: 'View Pricing Table', type: 'view_pricing', sub: 'Event: pageview | Path: /pricing' },
                             { label: 'Initiate Signup', type: 'signup_start', sub: 'Event: signup_start | Path: /signup' },
                             { label: 'Confirm Purchase', type: 'purchase_complete', sub: 'Event: purchase_complete | Path: /checkout/success' },
                           ].map(t => (
                             <button 
                              key={t.label} 
                              onClick={() => quickSend(t.type)} 
                              className="flex items-center justify-between p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl hover:border-indigo-500 hover:bg-white transition-all group text-left active:scale-[0.98]"
                             >
                                <div>
                                  <span className="text-sm font-bold text-slate-800 block">{t.label}</span>
                                  <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">{t.sub}</span>
                                </div>
                                <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7" /></svg>
                                </div>
                             </button>
                           ))}
                        </div>
                     </div>
                     <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
                        <div className="flex items-center gap-3 mb-8">
                          <div className="p-2 bg-slate-900 text-white rounded-lg">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-900">Advanced Transmit</h3>
                            <p className="text-xs text-slate-400 font-medium">Test proprietary event schemas.</p>
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col">
                          <textarea 
                            value={customJson} onChange={(e) => setCustomJson(e.target.value)}
                            className="w-full bg-slate-900 text-indigo-300 font-mono text-[11px] p-6 rounded-2xl border border-slate-800 focus:ring-4 focus:ring-indigo-100 min-h-[180px] mb-6 outline-none shadow-inner"
                          />
                          <button 
                            onClick={() => sendSimulatedEvent()} 
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            Transmit Payload
                          </button>
                        </div>
                     </div>
                  </div>
               </div>
             )}
          </div>
        )}

        {/* REST OF TABS (FUNNELS, DEPLOY, SETTINGS) ARE RENDERED CONDITIONALLY AS BEFORE */}
        {activeTab === 'funnels' && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
             <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-12">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Conversion Funnel</h2>
                    <p className="text-sm text-slate-500 font-medium">Tracking multi-step user acquisition health.</p>
                  </div>
                  <div className="mt-4 md:mt-0 px-6 py-3 bg-indigo-50 text-indigo-700 rounded-2xl font-black text-xs border-2 border-indigo-100 uppercase tracking-widest shadow-sm">
                     {funnelData.steps[funnelData.steps.length-1].conversion}% Absolute Conversion
                  </div>
                </div>

                <div className="space-y-10 max-w-4xl">
                  {funnelData.steps.map((step, idx) => (
                    <div key={idx} className="relative">
                      <div className="flex items-center gap-8">
                        <div className="w-40 text-right hidden md:block">
                           <div className="flex items-center justify-end gap-3 mb-1">
                             {lastMatchedStep === step.stepKey && <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-ping"></span>}
                             <span className="text-sm font-bold text-slate-800">{step.label}</span>
                           </div>
                           <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{step.count.toLocaleString()} sessions</p>
                        </div>
                        <div className="flex-1 bg-slate-100 h-16 rounded-2xl relative overflow-hidden border border-slate-200 shadow-inner">
                           <div 
                              className={`h-full bg-indigo-600 transition-all duration-1000 ease-out flex items-center justify-end px-6 ${lastMatchedStep === step.stepKey ? 'brightness-125 saturate-150' : ''}`}
                              style={{ width: `${(step.count / (funnelData.steps[0].count || 1)) * 100}%` }}
                           >
                              <span className="text-[10px] font-black text-white/50">{step.conversion}%</span>
                           </div>
                        </div>
                      </div>
                      
                      {idx < funnelData.steps.length - 1 && (
                        <div className="ml-0 md:ml-48 py-2 flex items-center gap-3">
                           <div className="w-0.5 h-10 bg-slate-200 ml-5"></div>
                           <span className="text-[9px] font-black uppercase tracking-[0.2em] bg-rose-50 text-rose-600 px-3 py-1 rounded-full border border-rose-100">
                             &darr; {step.dropoff}% drop-off
                           </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}

        {activeTab === 'deploy' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">
            <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">Cloudflare Edge Receiver</h2>
              <p className="text-slate-500 mb-12 font-medium">Deploy this worker script to your Cloudflare account to create a high-performance, globally distributed analytics endpoint.</p>
              
              <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative border-4 border-slate-800">
                <div className="flex items-center justify-between mb-8">
                   <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                   </div>
                   <button 
                    onClick={() => {
                      const code = `export default {\n  async fetch(request) {\n    if (request.method === 'OPTIONS') {\n      return new Response(null, {\n        headers: {\n          'Access-Control-Allow-Origin': '*',\n          'Access-Control-Allow-Methods': 'POST, OPTIONS',\n          'Access-Control-Allow-Headers': 'Content-Type'\n        }\n      });\n    }\n    if (request.method === 'POST') {\n      const data = await request.json();\n      console.log('Event Recv:', data);\n      return new Response('OK', { headers: { 'Access-Control-Allow-Origin': '*' } });\n    }\n    return new Response('Online', { status: 200 });\n  }\n};`;
                      navigator.clipboard.writeText(code);
                    }}
                    className="text-[10px] font-black bg-indigo-600 px-4 py-2 rounded-xl hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 uppercase tracking-widest"
                   >
                     Copy To Clipboard
                   </button>
                </div>
                <pre className="text-indigo-200 text-xs overflow-x-auto bg-slate-950 p-8 rounded-2xl border border-slate-800 leading-relaxed font-mono">
{`export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight Handshake
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // 2. Process Analytics Data
    if (request.method === 'POST') {
      const data = await request.json();
      
      // PERSISTENCE: Send to Cloudflare D1 or KV
      // await env.DB.prepare("INSERT INTO log (data) VALUES (?)").bind(JSON.stringify(data)).run();
      
      console.log('LiteTrack Record:', data);
      
      return new Response('OK', { 
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*' } 
      });
    }

    return new Response('LiteTrack Online', { status: 200 });
  }
};`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
             <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900 mb-2">Strategy Engine</h2>
                <p className="text-sm text-slate-500 mb-10 font-medium">Configure how the dashboard interprets traffic data for AI insights.</p>
                
                <div className="space-y-8">
                   <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Inference Provider</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <button 
                            onClick={() => setAiConfig({ ...aiConfig, provider: 'gemini-builtin' })}
                            className={`p-6 rounded-2xl border-2 text-left transition-all ${aiConfig.provider === 'gemini-builtin' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-300'}`}
                         >
                            <span className="block font-bold text-slate-900 mb-1">Standard Gemini</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Fast Edge Analysis</span>
                         </button>
                         <button 
                            onClick={() => setAiConfig({ ...aiConfig, provider: 'custom-endpoint' })}
                            className={`p-6 rounded-2xl border-2 text-left transition-all ${aiConfig.provider === 'custom-endpoint' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-300'}`}
                         >
                            <span className="block font-bold text-slate-900 mb-1">Custom API Wrapper</span>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Proprietary LLM Pipeline</span>
                         </button>
                      </div>
                   </div>

                   <div className="pt-8 border-t border-slate-100">
                     {aiConfig.provider === 'gemini-builtin' ? (
                        <div className="space-y-6">
                           <div>
                              <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Model Fidelity</label>
                              <select 
                                 value={aiConfig.model}
                                 onChange={(e: any) => setAiConfig({ ...aiConfig, model: e.target.value })}
                                 className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100"
                              >
                                 <option value="gemini-3-flash-preview">Flash (Instant Performance)</option>
                                 <option value="gemini-3-pro-preview">Pro (Advanced Behavioral Context)</option>
                              </select>
                           </div>
                           <button 
                             onClick={async () => (window as any).aistudio?.openSelectKey()}
                             className="w-full py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-xl text-xs font-black hover:bg-slate-50 transition-all uppercase tracking-widest shadow-sm"
                           >
                             Manage API Credentials
                           </button>
                        </div>
                     ) : (
                        <div>
                           <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">External Endpoint</label>
                           <input 
                              type="text" placeholder="https://your-api.com/v1/analyze"
                              value={aiConfig.customEndpoint || ''}
                              onChange={(e) => setAiConfig({ ...aiConfig, customEndpoint: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl text-sm outline-none focus:ring-4 focus:ring-indigo-100 font-mono"
                           />
                        </div>
                     )}
                   </div>
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
