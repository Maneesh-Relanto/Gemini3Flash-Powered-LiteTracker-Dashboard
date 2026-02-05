
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { AnalyticsEvent, DailyStats, InsightReport, FunnelReport } from './types';
import { generateAnalyticsInsights } from './services/geminiService';
import StatCard from './components/StatCard';
import SnippetGenerator from './components/SnippetGenerator';

const MOCK_PAGES = ['/home', '/pricing', '/docs', '/blog/post-1', '/about', '/signup', '/checkout'];
const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

interface SentLog {
  id: string;
  type: string;
  timestamp: string;
  status: 'success' | 'error' | 'pending';
  payload?: any;
}

const SCENARIOS = {
  ecommerce: {
    event: "purchase_complete",
    path: "/checkout/success",
    transaction_id: "TXN_9921",
    amount: 124.50,
    items: ["Pro Subscription"],
    currency: "USD"
  },
  saas: {
    event: "signup_start",
    path: "/signup",
    source: "pricing_page",
    plan: "premium"
  },
  error: {
    event: "api_failure",
    endpoint: "/v1/auth",
    status_code: 500,
    error_msg: "Database connection timeout"
  }
};

const App: React.FC = () => {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [insights, setInsights] = useState<InsightReport | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'technical' | 'funnels' | 'install' | 'deploy'>('overview');
  
  const [customEndpoint, setCustomEndpoint] = useState(() => {
    return localStorage.getItem('litetrack_endpoint') || '';
  });

  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [sentLogs, setSentLogs] = useState<SentLog[]>([]);
  
  const [simMode, setSimMode] = useState<'quick' | 'advanced'>('quick');
  const [customJson, setCustomJson] = useState(JSON.stringify(SCENARIOS.ecommerce, null, 2));

  useEffect(() => {
    localStorage.setItem('litetrack_endpoint', customEndpoint);
  }, [customEndpoint]);

  useEffect(() => {
    const initialEvents: AnalyticsEvent[] = [];
    const now = Date.now();
    
    // Create a realistic base distribution for the funnel
    const seedFunnels = (count: number, path: string, type: any) => {
      for (let i = 0; i < count; i++) {
        initialEvents.push({
          id: Math.random().toString(36).substr(2, 9),
          type,
          path,
          referrer: 'direct',
          timestamp: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
          metadata: {
            browser: i % 5 === 0 ? 'Firefox' : i % 3 === 0 ? 'Safari' : 'Chrome',
            os: i % 4 === 0 ? 'Linux' : i % 2 === 0 ? 'Windows' : 'MacOS',
            device: i % 3 === 0 ? 'mobile' : 'desktop'
          }
        });
      }
    };

    seedFunnels(450, '/home', 'pageview');
    seedFunnels(280, '/pricing', 'pageview');
    seedFunnels(120, '/signup', 'signup_start');
    seedFunnels(65, '/checkout/success', 'purchase_complete');
    
    setEvents(initialEvents);
  }, []);

  const technicalStats = useMemo(() => {
    const browsers: Record<string, number> = {};
    const oss: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const paths: Record<string, number> = {};

    events.forEach(e => {
      browsers[e.metadata.browser] = (browsers[e.metadata.browser] || 0) + 1;
      oss[e.metadata.os] = (oss[e.metadata.os] || 0) + 1;
      devices[e.metadata.device] = (devices[e.metadata.device] || 0) + 1;
      paths[e.path] = (paths[e.path] || 0) + 1;
    });

    return {
      browsers: Object.entries(browsers).map(([name, value]) => ({ name, value })),
      oss: Object.entries(oss).map(([name, value]) => ({ name, value })),
      devices: Object.entries(devices).map(([name, value]) => ({ name, value })),
      paths: Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 5)
    };
  }, [events]);

  const funnelData: FunnelReport = useMemo(() => {
    // Dynamically calculate funnel steps based on actual events
    const steps = [
      { 
        label: 'Visited Home', 
        count: events.filter(e => e.path === '/home').length 
      },
      { 
        label: 'Viewed Pricing', 
        count: events.filter(e => e.path === '/pricing' || e.type.includes('pricing')).length 
      },
      { 
        label: 'Started Signup', 
        count: events.filter(e => e.path === '/signup' || e.type === 'signup_start').length 
      },
      { 
        label: 'Completed', 
        count: events.filter(e => e.path === '/checkout/success' || e.type === 'purchase_complete').length 
      }
    ];

    return {
      name: "Conversion Pipeline",
      steps: steps.map((s, i, arr) => {
        const prevCount = i === 0 ? s.count : arr[i - 1].count;
        const totalBase = arr[0].count || 1;
        return {
          ...s,
          dropoff: i === 0 ? 0 : Math.round((1 - (s.count / (prevCount || 1))) * 100),
          conversion: Math.round((s.count / totalBase) * 100)
        };
      })
    };
  }, [events]);

  const sendSimulatedEvent = async (payloadOverride?: any) => {
    if (!customEndpoint) {
      alert("Please enter your Worker URL first!");
      return;
    }

    const logId = Math.random().toString(36).substr(2, 5);
    setTestStatus('sending');
    
    let finalPayload = payloadOverride;
    if (!finalPayload) {
      try {
        finalPayload = JSON.parse(customJson);
      } catch (e) {
        alert("Invalid JSON in Advanced Designer");
        setTestStatus('error');
        return;
      }
    }

    const newLog: SentLog = {
      id: logId,
      type: finalPayload.event || 'unknown',
      timestamp: new Date().toLocaleTimeString(),
      status: 'pending',
      payload: finalPayload
    };
    setSentLogs(prev => [newLog, ...prev].slice(0, 10));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(customEndpoint, {
        method: 'POST',
        mode: 'cors',
        body: JSON.stringify(finalPayload),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setTestStatus('success');
        setSentLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'success' } : l));
        
        // Add to local state so charts update immediately
        const localEvent: AnalyticsEvent = {
          id: logId,
          type: finalPayload.event || 'click',
          path: finalPayload.path || '/simulator',
          referrer: 'LiteTrack Dashboard',
          timestamp: Date.now(),
          metadata: {
            browser: 'LiteTrack-Sim',
            os: 'Cloud',
            device: 'desktop'
          }
        };
        setEvents(prev => [...prev, localEvent]);

        setTimeout(() => setTestStatus('idle'), 3000);
      } else {
        setTestStatus('error');
        setSentLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'error' } : l));
        setTimeout(() => setTestStatus('idle'), 3000);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      setTestStatus('error');
      setSentLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'error' } : l));
      setTimeout(() => setTestStatus('idle'), 4000);
    }
  };

  const quickSend = (type: string) => {
    let path = '/simulator';
    if (type === 'pageview') path = '/home';
    if (type === 'view_pricing') { type = 'pageview'; path = '/pricing'; }
    if (type === 'purchase_complete') path = '/checkout/success';

    sendSimulatedEvent({
      event: type,
      path: path,
      timestamp: new Date().toISOString(),
      metadata: { source: 'quick_action' }
    });
  };

  const applyTemplate = (key: keyof typeof SCENARIOS) => {
    setCustomJson(JSON.stringify(SCENARIOS[key], null, 2));
    setSimMode('advanced');
  };

  const fetchInsights = useCallback(async () => {
    setIsLoadingInsights(true);
    const report = await generateAnalyticsInsights(events);
    setInsights(report);
    setIsLoadingInsights(false);
  }, [events]);

  const chartData = useMemo(() => {
    const statsMap: Record<string, number> = {};
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    sorted.slice(-30).forEach(e => {
      const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      statsMap[time] = (statsMap[time] || 0) + 1;
    });
    return Object.entries(statsMap).map(([name, views]) => ({ name, views }));
  }, [events]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 p-6 hidden md:block">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-200 shadow-lg">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-tight">LiteTrack</span>
        </div>

        <ul className="space-y-2">
          {['overview', 'technical', 'funnels', 'install', 'deploy'].map((tab) => (
            <li key={tab}>
              <button 
                onClick={() => setActiveTab(tab as any)} 
                className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-all capitalize flex items-center gap-3 ${activeTab === tab ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tab === 'funnels' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>}
                {tab === 'overview' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
                {tab === 'install' ? 'Integration' : tab === 'deploy' ? 'Deployment' : tab}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="md:ml-64 p-4 md:p-8 max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">LiteTrack Dashboard</h1>
            <p className="text-slate-500 text-sm">Privacy-Focused Web Intelligence</p>
          </div>
          <div className="flex items-center gap-3">
             {testStatus === 'success' && (
                <div className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg animate-in fade-in zoom-in">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Sync Success
                </div>
             )}
            <button 
              onClick={fetchInsights}
              disabled={isLoadingInsights}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md shadow-indigo-100"
            >
              {isLoadingInsights ? 'Analyzing...' : 'Generate AI Insights'}
            </button>
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard label="Live Connection" value={customEndpoint ? "CONNECTED" : "OFFLINE"} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
              <StatCard label="Total Events" value={events.length} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>} />
              <StatCard label="Conversion" value={`${funnelData.steps[funnelData.steps.length-1].conversion}%`} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
              <StatCard label="Last Status" value={sentLogs[0]?.status || "Idle"} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                  Real-time Traffic (Recent 30 min)
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Area type="monotone" dataKey="views" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorViews)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative border border-slate-800">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                   <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-400">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  Live Event Feed
                </h3>
                <div className="space-y-4">
                  {sentLogs.length === 0 ? (
                    <div className="py-20 text-center text-slate-500 text-sm">Waiting for simulator traffic...</div>
                  ) : (
                    sentLogs.map(log => (
                      <div key={log.id} className="animate-in slide-in-from-right duration-300">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                          <span>{log.id.toUpperCase()}</span>
                          <span>{log.timestamp}</span>
                        </div>
                        <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 font-mono text-[11px] text-indigo-200">
                           <span className="text-emerald-400">POST</span> / <span className="text-slate-400">{log.type}</span>
                           <pre className="mt-1 opacity-60 overflow-hidden text-ellipsis whitespace-nowrap">
                             {JSON.stringify(log.payload)}
                           </pre>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'funnels' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4">
             <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Conversion Funnel</h2>
                    <p className="text-sm text-slate-500">Calculated live from events sent via Integration tab or production.</p>
                  </div>
                  <div className="mt-4 md:mt-0 flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-sm">
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                     {funnelData.steps[funnelData.steps.length-1].conversion}% Total Conversion
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {funnelData.steps.map((step, idx) => (
                    <div key={step.label} className="relative">
                      <div className="flex items-center gap-6">
                        <div className="w-48 text-right hidden md:block">
                           <span className="text-sm font-bold text-slate-700">{step.label}</span>
                           <p className="text-xs text-slate-400 uppercase tracking-widest">{step.count} users</p>
                        </div>
                        <div className="flex-1 bg-slate-50 h-16 rounded-xl border border-slate-100 relative overflow-hidden">
                           <div 
                              className="h-full bg-indigo-500 transition-all duration-1000 ease-out flex items-center px-4"
                              style={{ width: `${(step.count / (funnelData.steps[0].count || 1)) * 100}%` }}
                           >
                              <span className="text-white font-bold text-xs whitespace-nowrap md:hidden">{step.label}</span>
                           </div>
                           <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400">{step.conversion}%</span>
                           </div>
                        </div>
                      </div>
                      
                      {idx < funnelData.steps.length - 1 && (
                        <div className="ml-0 md:ml-52 py-2 flex items-center gap-2 text-rose-500">
                           <div className="w-px h-6 bg-slate-200 ml-4"></div>
                           <span className="text-[10px] font-bold uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                             -{step.dropoff}% Drop-off
                           </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-900 rounded-2xl p-8 text-white border border-slate-800">
                  <h3 className="font-bold mb-4 flex items-center gap-2 text-indigo-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Pain Points Identified
                  </h3>
                  <div className="space-y-4">
                     <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                        <p className="text-xs text-slate-400 font-bold uppercase mb-1">Dynamic Analysis</p>
                        <p className="text-sm text-slate-200">The funnel is tracking {events.length} total events. Every simulated click updates these metrics.</p>
                     </div>
                     <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                        <p className="text-xs text-slate-400 font-bold uppercase mb-1">Real-time Check</p>
                        <p className="text-sm text-slate-200">Go to "Integration" and send a "Complete Purchase" action to see the final step increase.</p>
                     </div>
                  </div>
                </div>
                
                <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-100">
                   <h3 className="font-bold mb-4">Improve Retention</h3>
                   <p className="text-indigo-100 text-sm mb-6 leading-relaxed">Funnels help you find where users get stuck. LiteTrack uses privacy-preserving session hashing to calculate these without individual tracking.</p>
                   <button className="px-6 py-2.5 bg-white text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-all">
                      Create Custom Funnel
                   </button>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'technical' && (
          <div className="space-y-8 animate-in fade-in">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Browsers</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={technicalStats.browsers} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" fontSize={10} width={70} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: 'transparent'}} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {technicalStats.browsers.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Operating Systems</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={technicalStats.oss}
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
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
          </div>
        )}

        {activeTab === 'install' && (
          <div className="max-w-7xl space-y-8 animate-in slide-in-from-bottom-4">
            <div className="bg-indigo-600 rounded-2xl p-8 text-white shadow-xl shadow-indigo-100">
                <h2 className="text-xl font-bold mb-2">Connect Your Worker</h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input 
                    type="text" 
                    placeholder="https://your-worker.your-subdomain.workers.dev"
                    value={customEndpoint}
                    onChange={(e) => setCustomEndpoint(e.target.value)}
                    className="flex-1 bg-indigo-700 border-indigo-500 text-white placeholder-indigo-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <button 
                    onClick={() => quickSend('pageview')}
                    className="px-8 py-3 bg-white text-indigo-600 rounded-xl font-bold transition-all hover:bg-indigo-50"
                  >
                    Immediate Ping
                  </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-800">Event Simulator</h3>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setSimMode('quick')} className={`px-3 py-1 text-xs font-bold rounded ${simMode === 'quick' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Quick</button>
                    <button onClick={() => setSimMode('advanced')} className={`px-3 py-1 text-xs font-bold rounded ${simMode === 'advanced' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}>Advanced</button>
                  </div>
                </div>

                {simMode === 'quick' ? (
                  <div className="grid grid-cols-1 gap-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Funnel Triggers</p>
                    <button onClick={() => quickSend('pageview')} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                        <span className="text-sm font-bold text-slate-700">1. Visited Home (/home)</span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        </div>
                    </button>
                    <button onClick={() => quickSend('view_pricing')} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                        <span className="text-sm font-bold text-slate-700">2. Viewed Pricing (/pricing)</span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        </div>
                    </button>
                    <button onClick={() => quickSend('signup_start')} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                        <span className="text-sm font-bold text-slate-700">3. Started Signup</span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        </div>
                    </button>
                    <button onClick={() => quickSend('purchase_complete')} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all group">
                        <span className="text-sm font-bold text-slate-700">4. Complete Journey</span>
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                        </div>
                    </button>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                       <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Templates</p>
                       <div className="flex flex-wrap gap-2">
                          <button onClick={()=>applyTemplate('ecommerce')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">E-commerce</button>
                          <button onClick={()=>applyTemplate('saas')} className="px-3 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-xs font-bold border border-violet-100">SaaS Metrics</button>
                          <button onClick={()=>applyTemplate('error')} className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg text-xs font-bold border border-rose-100">Error State</button>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    <textarea 
                      value={customJson}
                      onChange={(e) => setCustomJson(e.target.value)}
                      className="flex-1 bg-slate-900 text-indigo-300 font-mono text-[11px] p-4 rounded-xl border border-slate-800 focus:ring-2 focus:ring-indigo-500 min-h-[200px] mb-4"
                    />
                    <button onClick={() => sendSimulatedEvent()} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">
                      Transmit Custom Event
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-800 text-white">
                <h3 className="font-bold mb-6 flex items-center justify-between">
                  Live Destination Log
                  <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] rounded border border-emerald-500/20 uppercase">Streaming</div>
                </h3>
                <div className="space-y-3 font-mono">
                  {sentLogs.length === 0 ? (
                    <div className="text-center py-10 text-slate-600 text-sm italic italic">Waiting for traffic...</div>
                  ) : (
                    sentLogs.map(log => (
                      <div key={log.id} className="flex flex-col p-3 bg-slate-950 rounded-lg border border-slate-800 animate-in fade-in">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${log.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {log.status === 'success' ? '200 OK' : 'FAILED'}
                          </span>
                          <span className="text-[9px] text-slate-600">{log.timestamp}</span>
                        </div>
                        <span className="text-[11px] text-indigo-400">{log.type}</span>
                        <div className="text-[10px] text-slate-500 truncate mt-1">{log.payload?.path}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-2xl font-bold mb-4 text-slate-800">Integration Snippets</h2>
              <SnippetGenerator endpoint={customEndpoint} />
            </div>
          </div>
        )}

        {activeTab === 'deploy' && (
          <div className="max-w-5xl space-y-8 animate-in fade-in">
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Cloudflare Receiver Setup</h2>
              <p className="text-slate-500 mb-8">Deploy this code to your Cloudflare Worker to handle incoming LiteTrack events.</p>
              
              <div className="bg-slate-900 rounded-2xl p-6 text-white">
                <pre className="text-indigo-200 text-[11px] overflow-x-auto bg-slate-950 p-4 rounded-lg border border-slate-800 leading-relaxed">
{`export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method === 'POST') {
      const data = await request.json();
      console.log('Event Received:', JSON.stringify(data, null, 2)); 
      return new Response('OK', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    return new Response('LiteTrack Endpoint Online', { status: 200 });
  }
};`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
