
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, trend, icon }) => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <h3 className="text-3xl font-bold mt-1 text-slate-800">{value}</h3>
        {trend && (
          <p className={`text-sm mt-2 flex items-center ${trend.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
            <span>{trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
            <span className="text-slate-400 ml-1">vs last week</span>
          </p>
        )}
      </div>
      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
        {icon}
      </div>
    </div>
  );
};

export default StatCard;
