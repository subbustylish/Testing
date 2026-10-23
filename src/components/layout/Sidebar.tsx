import React from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  Layers,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { storageService } from '../../services/storage';

export type NavigationPage = 'overview' | 'upload' | 'screens' | 'reports';

interface SidebarProps {
  currentPage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
}) => {
  const testCases = storageService.getTestCases();
  const failedCount = testCases.filter((tc) => tc.status === 'Fail').length;
  const metrics = storageService.calculateMetrics(testCases);

  const navItems = [
    {
      id: 'overview' as NavigationPage,
      label: 'Overview Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'upload' as NavigationPage,
      label: 'Upload Test Results',
      icon: UploadCloud,
      badge: '3-Col Excel',
      badgeColor: 'bg-blue-900/90 text-blue-200 border border-blue-700/50',
    },
    {
      id: 'screens' as NavigationPage,
      label: 'Test Results by Screen',
      icon: Layers,
      badge: null,
    },
    {
      id: 'reports' as NavigationPage,
      label: 'Reports & Exports',
      icon: FileSpreadsheet,
      badge: null,
    },
  ];

  return (
    <aside
      className={`relative flex flex-col bg-[#0B1528] text-slate-300 transition-all duration-300 ease-in-out border-r border-slate-800 select-none z-20 ${
        isCollapsed ? 'w-20' : 'w-72'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-[#08101E]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="text-sm font-bold text-white tracking-wide truncate">
                Mobile Fixee QA
              </span>
              <span className="text-[11px] text-slate-400 font-medium truncate flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Mobile Testing Suite
              </span>
            </div>
          )}
        </div>

        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          {!isCollapsed ? 'Main Navigation' : '•••'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-105 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                }`}
              />
              {!isCollapsed && (
                <span className="truncate flex-1 text-left">{item.label}</span>
              )}
              {!isCollapsed && item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    isActive ? 'bg-blue-700 text-blue-100' : item.badgeColor || 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Summary in Footer */}
      {!isCollapsed && (
        <div className="p-3.5 m-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="font-medium text-slate-300">Suite Health</span>
            <span className="text-[11px] text-emerald-400 font-semibold">{metrics.passRateDisplay} Pass</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
            <div className="p-1.5 rounded-lg bg-slate-800/80">
              <span className="block text-slate-400">Passed</span>
              <span className="font-bold text-emerald-400">{metrics.passed}</span>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-800/80">
              <span className="block text-slate-400">Failed</span>
              <span className={`font-bold ${failedCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {failedCount}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
