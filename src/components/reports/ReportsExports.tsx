import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { TestCaseExecution } from '../../types';
import { storageService } from '../../services/storage';
import { exportToExcel } from '../../utils/excelGenerator';

interface ReportsExportsProps {
  testCases: TestCaseExecution[];
}

export const ReportsExports: React.FC<ReportsExportsProps> = ({ testCases }) => {
  const [filterPlatform, setFilterPlatform] = useState('All');
  const [filterTester, setFilterTester] = useState('All');
  const [filterScreen, setFilterScreen] = useState('All');
  const [filterSubScreen, setFilterSubScreen] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [downloadSuccessMsg, setDownloadSuccessMsg] = useState<string | null>(null);

  // Available platforms
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    testCases.forEach((tc) => {
      if (tc.platform) set.add(tc.platform);
    });
    return Array.from(set).sort();
  }, [testCases]);

  // Available testers
  const availableTesters = useMemo(() => {
    const set = new Set<string>();
    testCases.forEach((tc) => {
      if (tc.testerName) set.add(tc.testerName);
    });
    return Array.from(set).sort();
  }, [testCases]);

  // Available screens
  const availableScreens = useMemo(() => {
    const set = new Set<string>();
    testCases.forEach((tc) => {
      if (filterPlatform !== 'All' && tc.platform !== filterPlatform) return;
      if (filterTester !== 'All' && tc.testerName !== filterTester) return;
      if (tc.screenName) set.add(tc.screenName);
    });
    return Array.from(set).sort();
  }, [testCases, filterPlatform, filterTester]);

  // Available sub-screens
  const availableSubScreens = useMemo(() => {
    const set = new Set<string>();
    testCases.forEach((tc) => {
      if (filterPlatform !== 'All' && tc.platform !== filterPlatform) return;
      if (filterTester !== 'All' && tc.testerName !== filterTester) return;
      if (tc.subScreenName && (filterScreen === 'All' || tc.screenName === filterScreen)) {
        set.add(tc.subScreenName);
      }
    });
    return Array.from(set).sort();
  }, [testCases, filterPlatform, filterTester, filterScreen]);

  // Filtered Test Cases
  const filteredTestCases = useMemo(() => {
    return testCases.filter((tc) => {
      if (filterPlatform !== 'All' && tc.platform !== filterPlatform) return false;
      if (filterTester !== 'All' && tc.testerName !== filterTester) return false;
      if (filterScreen !== 'All' && tc.screenName !== filterScreen) return false;
      if (filterSubScreen !== 'All' && (tc.subScreenName || '') !== filterSubScreen) return false;
      if (filterStatus !== 'All' && tc.status !== filterStatus) return false;
      if (startDate && tc.executionDate < startDate) return false;
      if (endDate && tc.executionDate > endDate) return false;
      return true;
    });
  }, [testCases, filterPlatform, filterTester, filterScreen, filterSubScreen, filterStatus, startDate, endDate]);

  // Calculated Metrics (Resolved is considered as Pass per Requirement #4)
  const metrics = useMemo(() => {
    return storageService.calculateMetrics(filteredTestCases);
  }, [filteredTestCases]);

  const timestamp = new Date().toLocaleString();

  // Export 1: Test Cases to Excel (with Platform, Build Version, QA Tester)
  const handleExportTestCases = () => {
    const data = filteredTestCases.map((tc) => ({
      'Test ID': tc.testId,
      'Scenario': tc.scenario,
      'Status': tc.status,
      'Platform': tc.platform || 'Both',
      'Build Version': tc.buildVersion || 'v1.0.0',
      'QA Tester Name': tc.testerName || '—',
      'Target Screen': tc.screenName,
      'Sub Screen': tc.subScreenName || '',
      'Has Evidence Screenshot': tc.evidenceScreenshot ? 'Yes (Attached)' : 'No',
      'Execution Date': tc.executionDate,
    }));

    exportToExcel(
      [{ sheetName: 'Test Execution Results', data }],
      `MobileFixee_Test_Cases_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    setDownloadSuccessMsg(`Exported ${data.length} test case records to Excel.`);
  };

  // Export 2: Screen-wise Test Results (Grouped with Platform, Build, QA Testers)
  const handleExportScreenSummary = () => {
    const screenMap: Record<
      string,
      {
        screenName: string;
        platforms: Set<string>;
        buildVersions: Set<string>;
        testers: Set<string>;
        total: number;
        pass: number;
        resolved: number;
        fail: number;
        blocked: number;
        uiIssue: number;
        verification: number;
        notRun: number;
      }
    > = {};

    filteredTestCases.forEach((tc) => {
      const key = tc.screenName;
      if (!screenMap[key]) {
        screenMap[key] = {
          screenName: tc.screenName,
          platforms: new Set(),
          buildVersions: new Set(),
          testers: new Set(),
          total: 0,
          pass: 0,
          resolved: 0,
          fail: 0,
          blocked: 0,
          uiIssue: 0,
          verification: 0,
          notRun: 0,
        };
      }
      if (tc.platform) screenMap[key].platforms.add(tc.platform);
      if (tc.buildVersion) screenMap[key].buildVersions.add(tc.buildVersion);
      if (tc.testerName) screenMap[key].testers.add(tc.testerName);

      screenMap[key].total++;
      if (tc.status === 'Pass') screenMap[key].pass++;
      if (tc.status === 'Resolved') screenMap[key].resolved++;
      if (tc.status === 'Fail') screenMap[key].fail++;
      if (tc.status === 'Blocked') screenMap[key].blocked++;
      if (tc.status === 'UI Issue') screenMap[key].uiIssue++;
      if (tc.status === 'Verification') screenMap[key].verification++;
      if (tc.status === 'Not Run') screenMap[key].notRun++;
    });

    const data = Object.values(screenMap).map((s) => {
      const totalPassed = s.pass + s.resolved; // Resolved counts as pass!
      const executed = totalPassed + s.fail;
      const passRate = executed > 0 ? `${((totalPassed / executed) * 100).toFixed(1)}%` : 'N/A';
      return {
        'Screen Name': s.screenName,
        'Platforms Tested': Array.from(s.platforms).join(', ') || 'Both',
        'Build Versions': Array.from(s.buildVersions).join(', ') || 'v1.0.0',
        'QA Testers': Array.from(s.testers).join(', ') || '—',
        'Total Test Cases': s.total,
        'Passed': s.pass,
        'Resolved (Pass)': s.resolved,
        'Total Passed': totalPassed,
        'Failed': s.fail,
        'Blocked': s.blocked,
        'UI Issue': s.uiIssue,
        'Verification': s.verification,
        'Not Run': s.notRun,
        'Pass Rate (%)': passRate,
      };
    });

    exportToExcel(
      [{ sheetName: 'Screen-wise QA Results', data }],
      `MobileFixee_Screen_Summary_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    setDownloadSuccessMsg(`Exported ${data.length} screen summary records.`);
  };

  // Export 3: Executive Summary
  const handleExportDashboardSummary = () => {
    const summarySheet = [
      { Metric: 'Suite Scope', Value: 'MobileFixee QA Execution Suite' },
      { Metric: 'Platform Filter Scope', Value: filterPlatform },
      { Metric: 'QA Tester Filter Scope', Value: filterTester },
      { Metric: 'Target Screen Scope', Value: filterScreen },
      { Metric: 'Sub Screen Scope', Value: filterSubScreen },
      { Metric: 'Status Filter', Value: filterStatus },
      { Metric: 'Report Generated At', Value: timestamp },
      { Metric: 'Total Test Cases', Value: metrics.total },
      { Metric: 'Passed Count (raw)', Value: metrics.rawPass },
      { Metric: 'Resolved Count (counts as Pass)', Value: metrics.resolved },
      { Metric: 'Total Passed Count', Value: metrics.passed },
      { Metric: 'Fail Count', Value: metrics.failed },
      { Metric: 'Blocked Count', Value: metrics.blocked },
      { Metric: 'UI Issue Count', Value: metrics.uiIssue },
      { Metric: 'Verification Count', Value: metrics.verification },
      { Metric: 'Not Run Count', Value: metrics.notRun },
      { Metric: 'Calculated Pass Rate', Value: metrics.passRateDisplay },
      { Metric: 'Tests with Evidence Screenshots', Value: metrics.withEvidenceCount },
      { Metric: 'Formula Injection Protection', Value: 'Enabled (OWASP compliant)' },
    ];

    const testCasesSheet = filteredTestCases.map((tc) => ({
      'Test ID': tc.testId,
      'Scenario': tc.scenario,
      'Status': tc.status,
      'Platform': tc.platform || 'Both',
      'Build Version': tc.buildVersion || 'v1.0.0',
      'QA Tester Name': tc.testerName || '—',
      'Screen': tc.screenName,
      'Sub Screen': tc.subScreenName || '',
      'Evidence Attached': tc.evidenceScreenshot ? 'Yes' : 'No',
      'Execution Date': tc.executionDate,
    }));

    exportToExcel(
      [
        { sheetName: 'Executive Summary', data: summarySheet },
        { sheetName: 'Test Cases', data: testCasesSheet },
      ],
      `MobileFixee_Executive_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    setDownloadSuccessMsg('Comprehensive QA Report generated successfully.');
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Reports & Excel Exports</h1>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Generate clean 3-column test case registers and screen scorecards in Microsoft Excel (.xlsx).
        </p>
      </div>

      {downloadSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{downloadSuccessMsg}</span>
          </div>
          <button
            onClick={() => setDownloadSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Parameters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Configure Export Scope & Filter Rules</span>
          </div>
          {(filterPlatform !== 'All' || filterTester !== 'All' || filterScreen !== 'All' || filterSubScreen !== 'All' || filterStatus !== 'All' || startDate || endDate) && (
            <button
              onClick={() => {
                setFilterPlatform('All');
                setFilterTester('All');
                setFilterScreen('All');
                setFilterSubScreen('All');
                setFilterStatus('All');
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 text-xs">
          {/* Platform Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Platform</label>
            <select
              value={filterPlatform}
              onChange={(e) => {
                setFilterPlatform(e.target.value);
                setFilterScreen('All');
                setFilterSubScreen('All');
              }}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="All">All Platforms</option>
              <option value="Android">Android</option>
              <option value="iOS">iOS</option>
              <option value="Both">Both (Hybrid)</option>
              {availablePlatforms.filter((p) => !['Android', 'iOS', 'Both'].includes(p)).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* QA Tester Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">QA Tester</label>
            <select
              value={filterTester}
              onChange={(e) => {
                setFilterTester(e.target.value);
                setFilterScreen('All');
                setFilterSubScreen('All');
              }}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="All">All Testers ({availableTesters.length})</option>
              {availableTesters.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Screen Name</label>
            <select
              value={filterScreen}
              onChange={(e) => {
                setFilterScreen(e.target.value);
                setFilterSubScreen('All');
              }}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="All">All Screens ({availableScreens.length})</option>
              {availableScreens.map((sc) => (
                <option key={sc} value={sc}>
                  {sc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sub Screen</label>
            <select
              value={filterSubScreen}
              onChange={(e) => setFilterSubScreen(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="All">All Sub Screens ({availableSubScreens.length})</option>
              {availableSubScreens.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Execution Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-xl"
            >
              <option value="All">All Statuses</option>
              <option value="Pass">Pass</option>
              <option value="Resolved">Resolved (Counts as Pass)</option>
              <option value="Fail">Fail</option>
              <option value="Blocked">Blocked</option>
              <option value="UI Issue">UI Issue</option>
              <option value="Verification">Verification</option>
              <option value="Not Run">Not Run</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* Live Metrics Summary Strip */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Live Report Metrics Summary</h2>
            <p className="text-[11px] text-slate-400">
              Computed in real time. 'Resolved' is counted as Pass.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Generated: {timestamp}</span>
          </div>
        </div>

        {/* Status Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-500 block truncate">Total</span>
            <span className="text-base font-bold text-slate-900">{metrics.total}</span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <span className="text-[10px] text-emerald-700 block truncate">Passed</span>
            <span className="text-base font-bold text-emerald-700">{metrics.passed}</span>
          </div>
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
            <span className="text-[10px] text-rose-700 block truncate">Fail</span>
            <span className="text-base font-bold text-rose-700">{metrics.failed}</span>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
            <span className="text-[10px] text-amber-700 block truncate">Blocked</span>
            <span className="text-base font-bold text-amber-700">{metrics.blocked}</span>
          </div>
          <div className="p-3 bg-purple-50 rounded-xl border border-purple-200">
            <span className="text-[10px] text-purple-700 block truncate">UI Issue</span>
            <span className="text-base font-bold text-purple-700">{metrics.uiIssue}</span>
          </div>
          <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
            <span className="text-[10px] text-indigo-700 block truncate">Verification</span>
            <span className="text-base font-bold text-indigo-700">{metrics.verification}</span>
          </div>
          <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
            <span className="text-[10px] text-slate-600 block truncate">Not Run</span>
            <span className="text-base font-bold text-slate-700">{metrics.notRun}</span>
          </div>
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
            <span className="text-[10px] text-blue-700 block truncate">Pass Rate</span>
            <span className="text-base font-bold text-blue-700">{metrics.passRateDisplay}</span>
          </div>
        </div>
      </div>

      {/* 3 Dedicated Export Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Export 1: Test Cases */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-blue-400 transition-all">
          <div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Export 3-Col Test Cases</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Export all {filteredTestCases.length} filtered test executions with Test ID, Scenario, Status, and Screen details.
            </p>
          </div>
          <button
            onClick={handleExportTestCases}
            disabled={filteredTestCases.length === 0}
            className="mt-4 w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Test Cases (.xlsx)</span>
          </button>
        </div>

        {/* Export 2: Screen-wise Summary */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-blue-400 transition-all">
          <div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Screen-wise QA Results</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Aggregated screen scorecard with Pass/Fail/Blocked totals and screen pass rates (Resolved counted as Pass).
            </p>
          </div>
          <button
            onClick={handleExportScreenSummary}
            disabled={filteredTestCases.length === 0}
            className="mt-4 w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Screen Summary (.xlsx)</span>
          </button>
        </div>

        {/* Export 3: Executive Summary */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between hover:border-emerald-400 transition-all">
          <div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Executive Summary</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Multi-tab workbook consolidating high-level health cards, pass rates, and individual screen suites.
            </p>
          </div>
          <button
            onClick={handleExportDashboardSummary}
            className="mt-4 w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Executive Suite (.xlsx)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
