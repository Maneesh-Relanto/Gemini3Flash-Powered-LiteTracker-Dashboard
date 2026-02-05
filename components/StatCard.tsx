
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon: React.ReactNode;
  description?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, trend, icon, description }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm dark:shadow-none border border-slate-200 dark:border-slate-800 flex items-start justify-between group relative transition-colors duration-500">
      <div className="flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</p>
          {description && (
            <div className="relative group/tooltip">
              <svg className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 hover:text-indigo-500 cursor-help transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-slate-900 text-white text-[10px] font-medium rounded-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none shadow-xl border border-white/10 leading-relaxed">
                {description}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900"></div>
              </div>
            </div>
          )}
        </div>
        <h3 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tighter transition-colors">{value}</h3>
        {trend && (
          <p className={`text-[11px] mt-2 font-bold flex items-center ${trend.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span className="mr-1">{trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
            <span className="text-slate-400 dark:text-slate-500 font-medium">momentum</span>
          </p>
        )}
      </div>
      <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl shadow-sm shadow-indigo-50 dark:shadow-none group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
        {icon}
      </div>
    </div>
  );
};

export default StatCard;
