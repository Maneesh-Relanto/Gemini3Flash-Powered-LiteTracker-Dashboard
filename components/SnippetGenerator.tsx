
import React, { useState } from 'react';

type TransportMethod = 'sendBeacon' | 'fetch' | 'xhr';

interface SnippetGeneratorProps {
  endpoint?: string;
}

const SnippetGenerator: React.FC<SnippetGeneratorProps> = ({ endpoint }) => {
  const [method, setMethod] = useState<TransportMethod>('sendBeacon');
  const [copied, setCopied] = useState(false);

  const targetUrl = endpoint || `${window.location.origin}/api/collect`;

  const snippets: Record<TransportMethod, string> = {
    sendBeacon: `// Recommended: Reliable and non-blocking
const data = JSON.stringify({ 
  event: 'pageview', 
  url: window.location.pathname,
  ts: Date.now() 
});

navigator.sendBeacon('${targetUrl}', data);`,
    fetch: `// Standard: Modern and flexible
fetch('${targetUrl}', {
  method: 'POST',
  keepalive: true,
  body: JSON.stringify({ 
    event: 'pageview', 
    url: window.location.pathname 
  }),
  headers: { 'Content-Type': 'application/json' }
});`,
    xhr: `// Legacy: For older environments
var xhr = new XMLHttpRequest();
xhr.open('POST', '${targetUrl}', true);
xhr.setRequestHeader('Content-Type', 'application/json');

xhr.send(JSON.stringify({ 
  event: 'pageview', 
  url: window.location.pathname 
}));`
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(snippets[method]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 rounded-2xl p-8 shadow-2xl border border-slate-800">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div className="flex bg-slate-800 p-1.5 rounded-xl border border-slate-700">
          {(['sendBeacon', 'fetch', 'xhr'] as TransportMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
                method === m ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              {m === 'sendBeacon' ? 'Beacon API' : m.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="relative group/copy w-full md:w-auto">
          <button 
            onClick={copyToClipboard}
            className="w-full md:w-auto text-sm font-bold px-6 py-2.5 bg-slate-700 text-slate-200 rounded-xl hover:bg-indigo-600 hover:text-white transition-all border border-slate-600 active:scale-95 shadow-lg"
          >
            {copied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}
          </button>
          <div className="absolute bottom-full right-1/2 translate-x-1/2 md:right-0 md:translate-x-0 mb-3 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 invisible group-hover/copy:opacity-100 group-hover/copy:visible transition-all pointer-events-none z-20 text-center border border-white/5 shadow-2xl font-bold uppercase tracking-widest">
            Copies the optimized JS integration code to your clipboard.
            <div className="absolute top-full left-1/2 -translate-x-1/2 md:left-auto md:right-8 border-8 border-transparent border-t-slate-800"></div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <p className="text-sm text-slate-400 mb-4 font-medium flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {method === 'sendBeacon' && "Prioritizes page performance. Minimal overhead."}
          {method === 'fetch' && "Modern standard. The 'keepalive' flag is key for analytics."}
          {method === 'xhr' && "Supports environments without modern API access."}
        </p>
        <div className="relative group">
          <pre className="text-indigo-200 font-mono text-base overflow-x-auto whitespace-pre leading-relaxed bg-slate-950 p-8 rounded-xl border border-slate-800 min-h-[160px] scrollbar-thin scrollbar-thumb-slate-700">
            {snippets[method]}
          </pre>
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
              Target: {targetUrl.length > 30 ? targetUrl.substring(0, 30) + '...' : targetUrl}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-6 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-emerald-500/50 shadow-sm"></div>
          Async Execution
        </span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-indigo-500/50 shadow-sm"></div>
          Zero Dependencies
        </span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rose-500 shadow-rose-500/50 shadow-sm"></div>
          Core Web Vital Friendly
        </span>
      </div>
    </div>
  );
};

export default SnippetGenerator;
