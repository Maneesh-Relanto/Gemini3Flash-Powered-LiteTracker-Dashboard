
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { AnalyticsEvent, DailyStats, InsightReport, FunnelReport, AIConfig } from './types';
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
  const [simMode, setSimMode] = useState<'quick' | 'advanced'>('quick');
  const [customJson, setCustomJson] = useState(JSON.stringify(SCENARIOS.ecommerce, null, 2));

  useEffect(() => {
    localStorage.setItem('litetrack_ai_config', JSON.stringify(aiConfig));
    localStorage.setItem('litetrack_endpoint', customEndpoint);
    localStorage.setItem('litetrack_verified', String(isVerified));
  }, [aiConfig, customEndpoint, isVerified]);

  useEffect(() => {
    const initialEvents: AnalyticsEvent[] = [];
    const now = Date.now();
    const seed = (count: number, path: string, type: string) => {
      for (let i = 0; i < count; i++) {
        initialEvents.push({
          id: Math.random().toString(36).substr(2, 9),
          type, path, referrer: 'direct',
          timestamp: now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
          metadata: { browser: 'Chrome', os: 'Windows', device: 'desktop' }
        });
      }
    };
    seed(450, '/home', 'pageview');
    seed(280, '/pricing', 'pageview');
    seed(120, '/signup', 'signup_start');
    seed(65, '/checkout/success', 'purchase_complete');
    setEvents(initialEvents);
  }, []);

  const funnelData: FunnelReport = useMemo(() => {
    const steps = [
      { label: 'Visited Home', count: events.filter(e => e.path === '/home').length, stepKey: 'home' },
      { label: 'Viewed Pricing', count: events.filter(e => e.path === '/pricing' || e.type.includes('pricing')).length, stepKey: 'pricing' },
      { label: 'Started Signup', count: events.filter(e => e.path === '/signup' || e.type === 'signup_start').length, stepKey: 'signup' },
      { label: 'Completed', count: events.filter(e => e.path === '/checkout/success' || e.type === 'purchase_complete').length, stepKey: 'completed' }
    ];
    return {
      name: "Conversion Pipeline",
      steps: steps.map((s, i, arr) => ({
        ...s,
        dropoff: i === 0 ? 0 : Math.round((1 - (s.count / (arr[i - 1].count || 1))) * 100),
        conversion: Math.round((s.count / (arr[0].count || 1)) * 100)
      }))
    };
  }, [events]);

  const verifyConnection = async () => {
    setTestStatus('sending');
    try {
      const response = await fetch(customEndpoint, {
        method: 'POST', mode: 'cors',
        body: JSON.stringify({ event: 'ping' }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) { setIsVerified(true); setTestStatus('success'); }
      else throw new Error("Worker Error");
    } catch (e: any) { setTestStatus('error'); setErrorMessage(e.message); }
  };

  const sendSimulatedEvent = async (payloadOverride?: any) => {
    if (!isVerified) return;
    const finalPayload = payloadOverride || JSON.parse(customJson);
    try {
      await fetch(customEndpoint, {
        method: 'POST', mode: 'cors',
        body: JSON.stringify(finalPayload),
        headers: { 'Content-Type': 'application/json' }
      });
      const localEvent: AnalyticsEvent = {
        id: Math.random().toString(36).substr(2, 5),
        type: finalPayload.event || 'click', path: finalPayload.path || '/simulator',
        referrer: 'LiteTrack Sim', timestamp: Date.now(),
        metadata: { browser: 'LiteTrack-Sim', os: 'Cloud', device: 'desktop' }
      };
      setEvents(prev => [...prev, localEvent]);
      // Fix: Use explicit type for the new log entry to satisfy SentLog interface requirements for the 'status' property
      const newLog: SentLog = {
        id: localEvent.id,
        type: localEvent.type,
        timestamp: new Date().toLocaleTimeString(),
        status: 'success',
        payload: finalPayload
      };
      setSentLogs(prev => [newLog, ...prev].slice(0, 10));
    } catch (e) { /* error logic */ }
  };

  const quickSend = (type: string) => {
    let path = '/simulator';
    if (type === 'pageview') path = '/home';
    if (type === 'view_pricing') { type = 'pageview'; path = '/pricing'; }
    if (type === 'signup_start') path = '/signup';
    if (type === 'purchase_complete') path = '/checkout/success';
    sendSimulatedEvent({ event: type, path });
  };

  const fetchInsights = useCallback(async () => {
    setIsLoadingInsights(true);
    const report = await aiManager.getInsights(events, aiConfig);
    setInsights(report);
    setIsLoadingInsights(false);
  }, [events, aiConfig]);

  const openKeyManager = async () => {
    // Calling the environment-specific key selector
    if (typeof (window as any).aistudio?.openSelectKey === 'function') {
      await (window as any).aistudio.openSelectKey();
      // After selection, we assume success as per guidelines
    }
  };

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
          {['overview', 'funnels', 'install', 'deploy', 'settings'].map((tab) => (
            <li key={tab}>
              <button 
                onClick={() => setActiveTab(tab as any)} 
                className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-all capitalize flex items-center gap-3 ${activeTab === tab ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tab === 'settings' ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> : null}
                {tab === 'install' ? 'Integration' : tab === 'deploy' ? 'Deployment' : tab}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="md:ml-64 p-4 md:p-8 max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">LiteTrack Dashboard</h1>
            <p className="text-slate-500 text-sm">Flexible AI Insights & Analytics</p>
          </div>
          <button 
            onClick={fetchInsights}
            disabled={isLoadingInsights}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {isLoadingInsights ? 'Analyzing...' : 'Generate AI Insights'}
          </button>
        </header>

        {insights && (
          <div className="mb-8 bg-indigo-900 text-white p-6 rounded-2xl shadow-xl animate-in fade-in zoom-in">
             <div className="flex items-center gap-2 mb-2 text-indigo-300 uppercase tracking-widest text-[10px] font-bold">
               <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
               AI Intelligence Report ({aiConfig.provider})
             </div>
             <p className="text-lg font-medium mb-4">{insights.summary}</p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/10 p-4 rounded-xl">
                   <h4 className="font-bold text-sm mb-2 text-indigo-200">Action Items</h4>
                   <ul className="text-sm space-y-1">
                      {insights.suggestions.map((s, i) => <li key={i}>• {s}</li>)}
                   </ul>
                </div>
                <div className="flex flex-col justify-center items-center bg-white/10 p-4 rounded-xl">
                   <span className="text-4xl font-bold">{insights.performanceScore}</span>
                   <span className="text-[10px] uppercase font-bold text-indigo-300">Performance Score</span>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Live Connection" value={isVerified ? "ONLINE" : "OFFLINE"} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} />
            <StatCard label="Total Events" value={events.length} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>} />
            <StatCard label="Engine" value={aiConfig.provider === 'gemini-builtin' ? 'Gemini' : 'Custom'} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.543-.543" /></svg>} />
            <StatCard label="Last Log" value={sentLogs[0]?.status || "Idle"} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl space-y-8 animate-in slide-in-from-bottom-4">
             <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-800 mb-6">AI Configuration</h2>
                <div className="space-y-6">
                   <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-3">Insights Engine Provider</label>
                      <div className="grid grid-cols-2 gap-4">
                         <button 
                            onClick={() => setAiConfig({ ...aiConfig, provider: 'gemini-builtin' })}
                            className={`p-4 rounded-xl border text-left transition-all ${aiConfig.provider === 'gemini-builtin' ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'}`}
                         >
                            <span className="block font-bold text-slate-800">Built-in (Gemini)</span>
                            <span className="text-xs text-slate-500">Low-latency insights using system keys.</span>
                         </button>
                         <button 
                            onClick={() => setAiConfig({ ...aiConfig, provider: 'custom-endpoint' })}
                            className={`p-4 rounded-xl border text-left transition-all ${aiConfig.provider === 'custom-endpoint' ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'}`}
                         >
                            <span className="block font-bold text-slate-800">Custom Endpoint</span>
                            <span className="text-xs text-slate-500">Connect your own OpenAI/Anthropic wrapper.</span>
                         </button>
                      </div>
                   </div>

                   {aiConfig.provider === 'gemini-builtin' && (
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                         <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Analysis Quality</label>
                            <select 
                               value={aiConfig.model}
                               onChange={(e: any) => setAiConfig({ ...aiConfig, model: e.target.value })}
                               className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm"
                            >
                               <option value="gemini-3-flash-preview">Flash (Fast & Efficient)</option>
                               <option value="gemini-3-pro-preview">Pro (Deep Analysis - Requires Paid Key)</option>
                            </select>
                         </div>
                         <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
                            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-xs text-amber-800">To use <b>Gemini Pro</b> or ensure higher rate limits for your project, select your paid Google Cloud API key below.</p>
                         </div>
                         <button 
                            onClick={openKeyManager}
                            className="w-full py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all shadow-sm"
                         >
                            Select Custom API Project / Key
                         </button>
                      </div>
                   )}

                   {aiConfig.provider === 'custom-endpoint' && (
                      <div className="pt-4 border-t border-slate-100">
                         <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Endpoint URL</label>
                         <input 
                            type="text" 
                            placeholder="https://api.yourdomain.com/insights"
                            value={aiConfig.customEndpoint || ''}
                            onChange={(e) => setAiConfig({ ...aiConfig, customEndpoint: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-sm"
                         />
                         <p className="text-[10px] text-slate-500 mt-2">Expects a POST request returning InsightReport JSON schema.</p>
                      </div>
                   )}
                </div>
             </div>
          </div>
        )}

        {/* Existing Tab Logic for Funnels, Integration, Deployment... */}
        {activeTab === 'funnels' && <div className="space-y-8 animate-in fade-in">
           <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
                  <h2 className="text-xl font-bold text-slate-800">Conversion Funnel</h2>
                  <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-bold text-sm">
                     {funnelData.steps[funnelData.steps.length-1].conversion}% Conversion
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {funnelData.steps.map((step, idx) => (
                    <div key={idx} className="relative">
                      <div className="flex items-center gap-6">
                        <div className="w-48 text-right hidden md:block">
                           <span className="text-sm font-bold text-slate-700">{step.label}</span>
                           <p className="text-xs text-slate-400">{step.count} users</p>
                        </div>
                        <div className="flex-1 bg-slate-50 h-16 rounded-xl border border-slate-100 overflow-hidden relative">
                           <div className="h-full bg-indigo-500" style={{ width: `${step.conversion}%` }}></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
           </div>
        </div>}
        
        {activeTab === 'install' && <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
           {!isVerified ? (
             <div className="bg-white p-10 rounded-2xl border shadow-xl">
               <h2 className="text-2xl font-bold mb-4">Connect Worker</h2>
               <input 
                 value={customEndpoint} onChange={e => setCustomEndpoint(e.target.value)}
                 className="w-full p-4 bg-slate-50 border rounded-xl mb-4" placeholder="URL..."
               />
               <button onClick={verifyConnection} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold">Connect</button>
             </div>
           ) : (
             <div className="text-center space-y-4">
               <p className="font-bold text-emerald-600">CONNECTED TO {customEndpoint}</p>
               <div className="flex gap-2 justify-center">
                 <button onClick={() => quickSend('pageview')} className="px-6 py-2 bg-indigo-600 text-white rounded-lg">Simulate Home Visit</button>
                 <button onClick={() => quickSend('purchase_complete')} className="px-6 py-2 bg-emerald-600 text-white rounded-lg">Simulate Sale</button>
               </div>
             </div>
           )}
        </div>}
      </main>
    </div>
  );
};

export default App;
