import React, { useState } from 'react';
import {
  Download,
  UploadCloud,
  Trash2,
  Smartphone,
  CheckCircle2,
  Database,
  LogOut,
} from 'lucide-react';
import { TestCaseExecution } from '../../types';
import { storageService } from '../../services/storage';
import { downloadSampleExcelWorkbook } from '../../utils/excelGenerator';

interface HeaderProps {
  testCases?: TestCaseExecution[];
  onNavigateToUpload: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ testCases = [], onNavigateToUpload, onLogout }) => {
  const currentUser = storageService.getCurrentUser();
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const handleClearAllData = async () => {
    await storageService.clearAllData();
    setShowConfirmClear(false);
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-6 flex items-center justify-between sticky top-0 z-10 shadow-xs">
      {/* Brand & Database Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
          <Smartphone className="w-4 h-4 text-blue-600" />
          <span>Mobile Fixee QA Workspace</span>
        </div>

        {/* Live Persistent Database Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <Database className="w-3 h-3 text-emerald-600" />
          <span>Live Database Active</span>
        </div>
      </div>

      {/* Right Actions & User Area */}
      <div className="flex items-center gap-3">
        {/* Download 3-Column Template */}
        <button
          onClick={() => downloadSampleExcelWorkbook()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50/70 border border-slate-200 rounded-xl transition-colors cursor-pointer"
          title="Download 3-column reference template (Test ID, Scenario, Status)"
        >
          <Download className="w-3.5 h-3.5 text-blue-600" />
          <span className="hidden sm:inline">3-Col Excel Template</span>
        </button>

        {/* Quick Upload Button */}
        <button
          onClick={onNavigateToUpload}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload Results</span>
        </button>

        {/* Clear Database Button */}
        <button
          onClick={() => setShowConfirmClear(true)}
          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          title="Clear all stored test cases and uploaded batches from the database"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        {/* User indicator: Shows login name 'admin' and Logout action */}
        <div className="flex items-center gap-2 pl-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
              {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <span className="text-xs font-bold text-slate-800">
              {currentUser.name || 'admin'}
            </span>
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Resetting / Clearing Database */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Clear All Database Records?</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              This will permanently delete all uploaded test cases, screenshot evidence, and batch records from the database. This action cannot be reversed.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAllData}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Yes, Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
