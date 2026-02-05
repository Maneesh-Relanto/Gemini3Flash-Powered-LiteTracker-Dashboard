
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { AnalyticsEvent, InsightReport, FunnelReport, AIConfig, FunnelStep, Alert } from './types';
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
}

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('litetrack_theme') as any) || 'light');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [insights, setInsights] = useState<InsightReport | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'technical' | 'funnels' | 'retention' | 'install' | 'settings'>('overview');
  
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    const saved = localStorage.getItem('litetrack_ai_config');
    return saved ? JSON.parse(saved) : { provider: 'gemini-builtin', model: 'gemini-3-flash-preview' };
  });

  const [customEndpoint, setCustomEndpoint] = useState(() => localStorage.getItem('litetrack_endpoint') || '');
  const [isVerified, setIsVerified] = useState(() => localStorage.getItem('litetrack_verified') === 'true');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [sentLogs, setSentLogs] = useState<SentLog[]>([]);
  const [customJson, setCustomJson] = useState(JSON.stringify({ event: "purchase_complete", path: "/checkout/success", amount: 124.50 }, null, 2));

  useEffect(() => {
    localStorage.setItem('litetrack_theme', theme);
    localStorage.setItem('litetrack_ai_config', JSON.stringify(aiConfig));
    localStorage.setItem('litetrack_endpoint', customEndpoint);
    localStorage.setItem('litetrack_verified', String(isVerified));
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme, aiConfig, customEndpoint, isVerified]);

  // Seeding initial data
  useEffect(() => {
    const initialEvents: AnalyticsEvent[] = [];
    const countries = ['🇺🇸 USA', '🇬🇧 UK', '🇩🇪 Germany', '🇮🇳 India', '🇯🇵 Japan', '🇨🇦 Canada'];
    const sessionIds = Array.from({length: 40}, (_, i) => `sess_${i}`);
    
    const seed = (count: number, path: string, type: string) => {
      for (let i = 0; i < count; i++) {
        const timestamp = Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000);
        initialEvents.push({
          id: Math.random().toString(36).substr(2, 9),
          type, path, 
          referrer: i % 5 === 0 ? 'google.com' : i % 8 === 0 ? 'twitter.com' : 'direct',
          timestamp,
          metadata: { 
            browser: i % 3 === 0 ? 'Chrome' : i % 3 === 1 ? 'Safari' : 'Firefox', 
            os: i % 2 === 0 ? 'MacOS' : 'Windows', 
            device: i % 4 === 0 ? 'mobile' : 'desktop',
            country: countries[Math.floor(Math.random() * countries.length)],
            sessionId: sessionIds[Math.floor(Math.random() * sessionIds.length)],
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

  const stats = useMemo(() => {
    const uniqueVisitors = new Set(events.map(e => e.metadata.sessionId)).size;
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const activeNow = events.filter(e => e.timestamp > fiveMinutesAgo).length;
    const avgLoadTime = events.length > 0 ? Math.round(events.reduce((acc, e) => acc + (e.metadata.loadTime || 0), 0) / events.length) : 0;
    
    return { totalEvents: events.length, uniqueVisitors, activeNow, avgLoadTime };
  }, [events]);

  const geoStats = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => { counts[e.metadata.country] = (counts[e.metadata.country] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
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
      { label: 'Viewed Pricing', count: events.filter(e => e.path === '/pricing').length, stepKey: 'pricing' },
      { label: 'Started Signup', count: events.filter(e => e.type === 'signup_start').length, stepKey: 'signup' },
      { label: 'Completed', count: events.filter(e => e.type === 'purchase_complete').length, stepKey: 'completed' }
    ];
    const totalBase = steps[0].count || 1;
    return {
      name: "Main Conversion",
      steps: steps.map((s, i, arr) => ({
        ...s,
        dropoff: i === 0 ? 0 : Math.round((1 - (s.count / (arr[i - 1].count || 1))) * 100),
        conversion: Math.round((s.count / totalBase) * 100)
      })) as FunnelStep[]
    };
  }, [events]);

  const retentionData = useMemo(() => {
    const cohorts = [100, 82, 65, 58, 42, 30, 25, 18];
    return cohorts.map((val, i) => ({ day: `Day ${i}`, rate: val }));
  }, []);

  const sendSimulatedEvent = async (payloadOverride?: any) => {
    const finalPayload = payloadOverride || JSON.parse(customJson);
    const localEvent: AnalyticsEvent = {
      id: Math.random().toString(36).substr(2, 5),
      type: finalPayload.event || 'click', 
      path: finalPayload.path || '/sim',
      referrer: 'LiteTrack Simulator', 
      timestamp: Date.now(),
      metadata: { 
        browser: 'Chrome', os: 'Cloud', device: 'desktop', country: '🇺🇸 USA', sessionId: 'sess_sim',
        duration: 45, loadTime: Math.floor(Math.random() * 500) + 100
      }
    };

    setEvents(prev => [localEvent, ...prev]);

    if (!isVerified || !customEndpoint) {
      // Mock success for local simulation
      // Fix: Cast status to 'success' as const to avoid type incompatibility with SentLog
      setSentLogs(prev => [{ id: localEvent.id, type: localEvent.type, timestamp: new Date().toLocaleTimeString(), status: 'success' as const, payload: finalPayload }, ...prev].slice(0, 10));
      return;
    }

    try {
      setTestStatus('sending');
      const response = await fetch(customEndpoint, {
        method: 'POST', mode: 'cors',
        body: JSON.stringify(finalPayload),
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        // Fix: Cast status to 'success' as const to avoid type incompatibility with SentLog
        setSentLogs(prev => [{ id: localEvent.id, type: localEvent.type, timestamp: new Date().toLocaleTimeString(), status: 'success' as const, payload: finalPayload }, ...prev].slice(0, 10));
        setTestStatus('success');
        setTimeout(() => setTestStatus('idle'), 1500);
      }
    } catch (e) { 
      setTestStatus('error');
      // Fix: Cast status to 'error' as const to avoid type incompatibility with SentLog
      setSentLogs(prev => [{ id: localEvent.id, type: localEvent.type, timestamp: new Date().toLocaleTimeString(), status: 'error' as const, payload: finalPayload }, ...prev].slice(0, 10));
    }
  };

  const fetchInsights = useCallback(async () => {
    setIsLoadingInsights(true);
    const report = await aiManager.getInsights(events, aiConfig);
    setInsights(report);
    if (report.anomalies) setAlerts(prev => [...report.anomalies!, ...prev].slice(0, 10));
    setIsLoadingInsights(false);
  }, [events, aiConfig]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `litetrack_export_${Date.now()}.json`;
    a.click();
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <nav className={`fixed top-0 left-0 h-full w-64 border-r p-6 hidden md:block transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} z-30`}>
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg"><svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg></div>
          <span className="text-xl font-bold tracking-tight">LiteTrack</span>
        </div>
        <ul className="space-y-1.5">
          {['overview', 'technical', 'funnels', 'retention', 'install', 'settings'].map(tab => (
            <li key={tab}>
              <button onClick={() => setActiveTab(tab as any)} className={`w-full text-left px-4 py-2.5 rounded-xl font-medium transition-all capitalize ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}>{tab}</button>
            </li>
          ))}
        </ul>
        <div className="absolute bottom-10 left-6 right-6">
          <button onClick={exportData} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-lg active:scale-95"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> Export Dataset</button>
        </div>
      </nav>

      <main className="md:ml-64 p-8 max-w-[1400px] mx-auto min-h-screen">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h1>
            <p className="text-slate-500 text-sm font-medium">Real-time session intelligence engine</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setShowAlerts(!showAlerts)} className={`p-2.5 rounded-xl border transition-all relative ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {alerts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] flex items-center justify-center rounded-full font-black animate-pulse">{alerts.length}</span>}
              </button>
              {showAlerts && (
                <div className="absolute top-full right-0 mt-3 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 p-4 max-h-96 overflow-y-auto animate-in fade-in slide-in-from-top-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Alert Center</h4>
                  {alerts.length === 0 ? <p className="text-xs text-slate-500 italic py-4 text-center">No anomalies detected.</p> : alerts.map(a => (
                    <div key={a.id} className="mb-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border-l-4 border-indigo-500">
                      <p className="font-bold text-xs mb-1">{a.title}</p>
                      <p className="text-[10px] leading-relaxed opacity-70">{a.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className={`p-2.5 rounded-xl border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-yellow-400' : 'bg-white border-slate-200 text-slate-600'}`}>{theme === 'light' ? '🌙' : '☀️'}</button>
            <button onClick={fetchInsights} disabled={isLoadingInsights} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-100 dark:shadow-none active:scale-95 disabled:opacity-50 flex items-center gap-2">{isLoadingInsights ? 'Thinking...' : 'Run AI Audit'}</button>
          </div>
        </header>

        {insights && (
          <div className="mb-10 p-8 rounded-3xl bg-slate-900 text-white border border-slate-800 animate-in fade-in zoom-in duration-500 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 text-indigo-400 uppercase tracking-[0.2em] text-[10px] font-black"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg> Strategic Pattern Analysis</div>
            <p className="text-xl font-medium mb-6 opacity-90 leading-relaxed max-w-4xl">{insights.summary}</p>
            <div className="flex flex-wrap gap-3">
              {insights.suggestions.map((s, i) => <span key={i} className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-full text-xs font-semibold hover:bg-white/10 transition-all cursor-default">{s}</span>)}
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard label="Active Now" value={stats.activeNow} description="Users active in the last 5 minutes." icon="🔥" />
              <StatCard label="Unique Visitors" value={stats.uniqueVisitors} description="Total unique sessions detected." icon="👥" />
              <StatCard label="Total Ingestion" value={stats.totalEvents} description="Raw events processed." icon="📦" />
              <StatCard label="Avg Load Time" value={`${stats.avgLoadTime}ms`} description="Network latency." icon="⚡" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className={`lg:col-span-2 p-8 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <h3 className="font-bold mb-8 flex items-center justify-between">
                  <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div> Event Velocity</div>
                  <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Last 7 Days</div>
                </h3>
                <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={retentionData.map(d => ({ ...d, val: Math.random() * 100 }))}><XAxis hide /><YAxis hide /><Tooltip /><Area type="monotone" dataKey="val" stroke="#6366f1" fill="#6366f120" strokeWidth={3} /></AreaChart></ResponsiveContainer></div>
              </div>
              
              <div className={`p-8 rounded-3xl border transition-colors overflow-hidden ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <h3 className="font-bold mb-6 flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div> Live Activity Feed</h3>
                <div className="space-y-3 h-[280px] overflow-y-auto scrollbar-hide pr-2">
                  {events.slice(0, 15).map(e => (
                    <div key={e.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between animate-in slide-in-from-right-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500">{e.type}</p>
                        <p className="text-[11px] font-medium opacity-70 truncate max-w-[120px]">{e.path}</p>
                      </div>
                      <span className="text-[9px] font-mono opacity-50">{new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className={`p-8 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <h3 className="font-bold mb-8 flex items-center gap-3"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div> Top Regions</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                  {geoStats.slice(0, 6).map(geo => (
                    <div key={geo.name} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-center">
                      <div className="text-xl mb-1">{geo.name.split(' ')[0]}</div>
                      <div className="text-[10px] font-black uppercase text-slate-400">{geo.name.split(' ')[1]}</div>
                      <div className="text-lg font-bold mt-2">{geo.value}</div>
                    </div>
                  ))}
                </div>
              </div>
          </div>
        )}

        {/* Technical, Funnels, Retention tabs remain functional as previously implemented */}
        {activeTab === 'technical' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
             <div className={`p-8 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <h3 className="text-lg font-bold mb-8">User Agent Distribution</h3>
                <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={technicalStats.browsers} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" fontSize={11} width={80} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={28}>{technicalStats.browsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
             </div>
             <div className={`p-8 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <h3 className="text-lg font-bold mb-8">OS Analytics</h3>
                <div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={technicalStats.oss} innerRadius={70} outerRadius={100} paddingAngle={8} dataKey="value" stroke="none">{technicalStats.oss.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
             </div>
          </div>
        )}

        {activeTab === 'funnels' && (
          <div className="animate-in fade-in duration-700">
            <div className={`p-10 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <h2 className="text-xl font-bold mb-10">Conversion Pipeline</h2>
              <div className="space-y-12 max-w-4xl">
                {funnelData.steps.map((step, idx) => (
                  <div key={idx} className="relative">
                    <div className="flex items-center gap-8">
                      <div className="w-32 text-right text-xs font-bold text-slate-500">{step.label}</div>
                      <div className="flex-1 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden relative">
                         <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${step.conversion}%` }}></div>
                         <div className="absolute inset-0 flex items-center justify-end px-4 text-[10px] font-black text-white mix-blend-difference">{step.count} ({step.conversion}%)</div>
                      </div>
                    </div>
                    {idx < funnelData.steps.length - 1 && (
                      <div className="ml-40 py-2 flex items-center gap-4 text-rose-500 text-[9px] font-black uppercase tracking-widest"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg> {step.dropoff}% drop-off</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'retention' && (
          <div className={`p-10 rounded-3xl border transition-colors animate-in fade-in duration-700 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <h2 className="text-xl font-bold mb-2">User Retention Cohorts</h2>
            <p className="text-sm text-slate-500 mb-10">Percentage of users who returned after their first visit.</p>
            <div className="grid grid-cols-8 gap-2">
              {retentionData.map((d, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <div className="text-[10px] text-center text-slate-400 font-bold">{d.day}</div>
                  <div className="h-20 rounded-xl flex items-center justify-center text-white font-bold transition-all hover:scale-105 cursor-help" style={{ backgroundColor: `rgba(99, 102, 241, ${d.rate / 100})` }}>{d.rate}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'install' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className={`p-8 rounded-3xl border transition-all duration-500 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isVerified ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30'}`}>
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Handshake Center</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${isVerified ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {isVerified ? 'Live' : 'Mock Mode'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex gap-3 max-w-2xl">
                  <input 
                    type="text" 
                    placeholder="https://your-worker.workers.dev" 
                    value={customEndpoint} 
                    onChange={(e) => setCustomEndpoint(e.target.value)} 
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-mono border-2 outline-none transition-all ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white focus:border-indigo-500' : 'bg-slate-50 border-slate-100 focus:border-indigo-600'}`} 
                  />
                  <button 
                    onClick={() => setIsVerified(!isVerified)} 
                    className={`px-8 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 ${isVerified ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                  >
                    {isVerified ? 'Disconnect' : 'Connect Pipeline'}
                  </button>
                </div>
              </div>
            </div>

            {/* Handshake Simulation Options - Always Visible */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className={`p-8 rounded-3xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <h3 className="font-bold mb-2">Simulation Triggers</h3>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mb-6">Verify tracking behavior in real-time</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { l: 'Home Visit', p: '/home', e: 'pageview' },
                    { l: 'Pricing View', p: '/pricing', e: 'pageview' },
                    { l: 'Signup Start', p: '/signup', e: 'signup_start' },
                    { l: 'Purchase Success', p: '/checkout/success', e: 'purchase_complete' }
                  ].map(t => (
                    <button 
                      key={t.l} 
                      onClick={() => sendSimulatedEvent({ event: t.e, path: t.p })} 
                      className="p-4 rounded-xl border-2 border-slate-50 dark:border-slate-800 dark:bg-slate-800 text-center hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all font-bold text-xs"
                    >
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`p-8 rounded-3xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <h3 className="font-bold mb-2">JSON Payload Dispatch</h3>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mb-6">Send raw metadata to your endpoint</p>
                  <textarea 
                    value={customJson} 
                    onChange={(e) => setCustomJson(e.target.value)} 
                    className="w-full h-32 p-4 rounded-xl font-mono text-xs dark:bg-slate-950 dark:border-slate-800 border-2 outline-none focus:border-indigo-500 mb-4 bg-slate-50" 
                  />
                  <button 
                    onClick={() => sendSimulatedEvent()} 
                    className="w-full py-4 bg-slate-800 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-xl active:scale-95"
                  >
                    Transmit Payload
                  </button>
              </div>
            </div>
            
            <SnippetGenerator endpoint={customEndpoint} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <div className={`p-10 rounded-3xl border transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <h2 className="text-xl font-bold mb-8">AI Strategy Engine</h2>
              <div className="space-y-8">
                <div>
                  <label className="text-xs font-black uppercase text-slate-400 mb-3 block">Inference Provider</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['gemini-builtin', 'custom-endpoint'].map(p => (
                      <button key={p} onClick={() => setAiConfig({ ...aiConfig, provider: p as any })} className={`p-4 rounded-xl border-2 font-bold text-sm transition-all ${aiConfig.provider === p ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-500' : 'border-slate-100 dark:border-slate-800'}`}>{p === 'gemini-builtin' ? 'Edge Gemini' : 'Internal API'}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-slate-400 mb-3 block">Intelligence Level</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['gemini-3-flash-preview', 'gemini-3-pro-preview'].map(m => (
                      <button key={m} onClick={() => setAiConfig({ ...aiConfig, model: m as any })} className={`p-4 rounded-xl border-2 font-bold text-sm transition-all ${aiConfig.model === m ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-500' : 'border-slate-100 dark:border-slate-800'}`}>{m.includes('pro') ? 'Reasoning Pro' : 'Real-time Flash'}</button>
                    ))}
                  </div>
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
