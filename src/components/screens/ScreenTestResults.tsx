import React, { useState, useMemo } from 'react';
import {
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Percent,
  Search,
  UploadCloud,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Camera,
  Trash2,
  AlertTriangle,
  CheckSquare,
  Square,
} from 'lucide-react';
import { TestCaseExecution, TestStatus } from '../../types';
import { storageService } from '../../services/storage';
import { EvidenceModal } from '../common/EvidenceModal';

interface ScreenTestResultsProps {
  testCases: TestCaseExecution[];
  initialScreen?: string;
  onNavigateToUpload: () => void;
}

export const ScreenTestResults: React.FC<ScreenTestResultsProps> = ({
  testCases,
  initialScreen,
  onNavigateToUpload,
}) => {
  // Dynamically populate screens from imported test executions
  const screensList = useMemo(() => {
    const set = new Set<string>();
    testCases.forEach((tc) => {
      if (tc.screenName) set.add(tc.screenName);
    });
    return Array.from(set).sort();
  }, [testCases]);

  const [activeScreen, setActiveScreen] = useState<string>(() => {
    if (initialScreen && screensList.includes(initialScreen)) return initialScreen;
    return screensList[0] || 'Login Screen';
  });

  // Local Filters
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterSubScreen, setFilterSubScreen] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Table Sort & Pagination
  const [sortField, setSortField] = useState<keyof TestCaseExecution>('testId');
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Evidence modal state
  const [evidenceTargetTestCase, setEvidenceTargetTestCase] = useState<TestCaseExecution | null>(null);

  // Deletion States
  const [testCaseToDelete, setTestCaseToDelete] = useState<TestCaseExecution | null>(null);
  const [showConfirmClearScreen, setShowConfirmClearScreen] = useState(false);
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<Set<string>>(new Set());
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  // Exact screen-level records
  const allScreenTestCases = useMemo(() => {
    return testCases.filter((tc) => tc.screenName === activeScreen);
  }, [testCases, activeScreen]);

  // Platform, Build, and QA Tester context for the active screen
  const screenPlatforms = useMemo(() => {
    const set = new Set<string>();
    allScreenTestCases.forEach((tc) => {
      if (tc.platform) set.add(tc.platform);
    });
    return Array.from(set);
  }, [allScreenTestCases]);

  const screenBuilds = useMemo(() => {
    const set = new Set<string>();
    allScreenTestCases.forEach((tc) => {
      if (tc.buildVersion) set.add(tc.buildVersion);
    });
    return Array.from(set);
  }, [allScreenTestCases]);

  const screenTesters = useMemo(() => {
    const set = new Set<string>();
    allScreenTestCases.forEach((tc) => {
      if (tc.testerName) set.add(tc.testerName);
    });
    return Array.from(set);
  }, [allScreenTestCases]);

  // Unique sub screens within the active screen
  const subScreensList = useMemo(() => {
    const set = new Set<string>();
    allScreenTestCases.forEach((tc) => {
      if (tc.subScreenName) set.add(tc.subScreenName);
    });
    return Array.from(set).sort();
  }, [allScreenTestCases]);

  // Screen-level metrics (Resolved is counted as Pass per requirement #4)
  const screenMetrics = useMemo(() => {
    return storageService.calculateMetrics(allScreenTestCases);
  }, [allScreenTestCases]);

  // Filtered rows for the table
  const filteredScreenRows = useMemo(() => {
    return allScreenTestCases.filter((tc) => {
      if (filterStatus !== 'All' && tc.status !== filterStatus) return false;
      if (filterSubScreen !== 'All' && (tc.subScreenName || '') !== filterSubScreen) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = tc.testId.toLowerCase().includes(q);
        const matchesScenario = tc.scenario.toLowerCase().includes(q);
        const matchesSubScreen = (tc.subScreenName || '').toLowerCase().includes(q);
        const matchesPlatform = (tc.platform || '').toLowerCase().includes(q);
        const matchesBuild = (tc.buildVersion || '').toLowerCase().includes(q);
        const matchesTester = (tc.testerName || '').toLowerCase().includes(q);
        if (
          !matchesId &&
          !matchesScenario &&
          !matchesSubScreen &&
          !matchesPlatform &&
          !matchesBuild &&
          !matchesTester
        )
          return false;
      }
      return true;
    });
  }, [allScreenTestCases, filterStatus, filterSubScreen, searchQuery]);

  const sortedRows = useMemo(() => {
    const list = [...filteredScreenRows];
    list.sort((a, b) => {
      const valA = String(a[sortField] || '').toLowerCase();
      const valB = String(b[sortField] || '').toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredScreenRows, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const paginatedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (field: keyof TestCaseExecution) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleInlineStatusChange = (id: string, newStatus: TestStatus) => {
    storageService.updateTestCaseStatus(id, newStatus);
  };

  // Selection Logic for Bulk Deletion
  const isAllVisibleSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every((tc) => selectedTestCaseIds.has(tc.id));

  const toggleSelectAllVisible = () => {
    const next = new Set(selectedTestCaseIds);
    if (isAllVisibleSelected) {
      paginatedRows.forEach((tc) => next.delete(tc.id));
    } else {
      paginatedRows.forEach((tc) => next.add(tc.id));
    }
    setSelectedTestCaseIds(next);
  };

  const toggleSelectTestCase = (id: string) => {
    const next = new Set(selectedTestCaseIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTestCaseIds(next);
  };

  const handleConfirmDeleteTestCase = async () => {
    if (!testCaseToDelete) return;
    await storageService.deleteTestCase(testCaseToDelete.id);
    const next = new Set(selectedTestCaseIds);
    next.delete(testCaseToDelete.id);
    setSelectedTestCaseIds(next);
    setTestCaseToDelete(null);
  };

  const handleConfirmBulkDelete = async () => {
    const ids = Array.from(selectedTestCaseIds);
    if (ids.length === 0) return;
    await storageService.bulkDeleteTestCases(ids);
    setSelectedTestCaseIds(new Set());
    setIsDeletingBulk(false);
  };

  const handleConfirmClearScreen = async () => {
    await storageService.clearScreenData(activeScreen);
    setShowConfirmClearScreen(false);
    setSelectedTestCaseIds(new Set());
  };

  const getStatusSelectStyle = (st: TestStatus) => {
    switch (st) {
      case 'Pass':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
      case 'Resolved':
        return 'bg-cyan-50 text-cyan-800 border-cyan-300 font-bold';
      case 'Fail':
        return 'bg-rose-50 text-rose-800 border-rose-300 font-bold';
      case 'Blocked':
        return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
      case 'UI Issue':
        return 'bg-purple-50 text-purple-800 border-purple-300 font-bold';
      case 'Verification':
        return 'bg-indigo-50 text-indigo-800 border-indigo-300 font-bold';
      case 'Not Run':
        return 'bg-slate-100 text-slate-700 border-slate-300 font-medium';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Screen Selector Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Test Results by Screen
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
            <span>Target Screen: <strong className="text-slate-800">{activeScreen}</strong></span>
            {(screenPlatforms.length > 0 || screenBuilds.length > 0 || screenTesters.length > 0) && (
              <>
                <span className="text-slate-300">•</span>
                {screenPlatforms.length > 0 && (
                  <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    Platform: {screenPlatforms.join(', ')}
                  </span>
                )}
                {screenBuilds.length > 0 && (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                    Build: {screenBuilds.join(', ')}
                  </span>
                )}
                {screenTesters.length > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                    QA: {screenTesters.join(', ')}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Dynamic Screen Dropdown & Screen Actions */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">

          {screensList.length > 0 && (
            <>
              <label className="text-xs font-bold text-slate-700">Target Screen:</label>
              <select
                value={activeScreen}
                onChange={(e) => {
                  setActiveScreen(e.target.value);
                  setFilterSubScreen('All');
                  setCurrentPage(1);
                  setSelectedTestCaseIds(new Set());
                }}
                className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                {screensList.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>

              {/* Clear Screen Data Button */}
              {allScreenTestCases.length > 0 && (
                <button
                  onClick={() => setShowConfirmClearScreen(true)}
                  className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  title="Delete all test cases for this screen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Screen Data</span>
                </button>
              )}
            </>
          )}

          <button
            onClick={onNavigateToUpload}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload For This Screen</span>
          </button>
        </div>
      </div>

      {allScreenTestCases.length > 0 ? (
        <>
          {/* Screen Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* Total */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-slate-500 block truncate">Total</span>
              <div className="mt-1.5 text-2xl font-bold text-slate-900">{screenMetrics.total}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{activeScreen}</div>
            </div>

            {/* Passed (Includes Resolved) */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-emerald-700 flex items-center justify-between">
                <span className="truncate">Passed</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              </span>
              <div className="mt-1.5 text-2xl font-bold text-emerald-600">{screenMetrics.passed}</div>
              <div className="text-[10px] text-emerald-600/80 mt-0.5 font-medium truncate">
                {screenMetrics.rawPass}P + {screenMetrics.resolved}R
              </div>
            </div>

            {/* Failed */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-rose-700 flex items-center justify-between">
                <span className="truncate">Failed</span>
                <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              </span>
              <div className="mt-1.5 text-2xl font-bold text-rose-600">{screenMetrics.failed}</div>
              <div className="text-[10px] text-rose-600/80 mt-0.5 font-medium truncate">Needs fix</div>
            </div>

            {/* Blocked */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-amber-700 flex items-center justify-between">
                <span className="truncate">Blocked</span>
                <HelpCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              </span>
              <div className="mt-1.5 text-2xl font-bold text-amber-600">{screenMetrics.blocked}</div>
              <div className="text-[10px] text-amber-600/80 mt-0.5 font-medium truncate">Impediments</div>
            </div>

            {/* UI Issue */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-purple-700 flex items-center justify-between">
                <span className="truncate">UI Issue</span>
                <AlertTriangle className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              </span>
              <div className="mt-1.5 text-2xl font-bold text-purple-600">{screenMetrics.uiIssue}</div>
              <div className="text-[10px] text-purple-600/80 mt-0.5 font-medium truncate">Visual defect</div>
            </div>

            {/* Verification */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-indigo-700 flex items-center justify-between">
                <span className="truncate">Verification</span>
                <CheckSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </span>
              <div className="mt-1.5 text-2xl font-bold text-indigo-600">{screenMetrics.verification}</div>
              <div className="text-[10px] text-indigo-600/80 mt-0.5 font-medium truncate">Awaiting check</div>
            </div>

            {/* Not Run */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-slate-600 flex items-center justify-between">
                <span className="truncate">Not Run</span>
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </span>
              <div className="mt-1.5 text-2xl font-bold text-slate-600">{screenMetrics.notRun}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">Pending</div>
            </div>

            {/* Pass Rate */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <span className="text-xs font-medium text-blue-700 flex items-center justify-between">
                <span className="truncate">Pass Rate</span>
                <Percent className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              </span>
              <div className="mt-1.5 text-2xl font-bold text-blue-600">{screenMetrics.passRateDisplay}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 truncate">P / (P + F)</div>
            </div>
          </div>

          {/* Table Filters & Bulk Action Area */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search Test ID, scenario, sub-screen..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Bulk actions trigger if items selected */}
              {selectedTestCaseIds.size > 0 && (
                <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-xl">
                  <span className="text-xs font-bold text-slate-800">
                    {selectedTestCaseIds.size} sel
                  </span>
                  <button
                    onClick={() => setIsDeletingBulk(true)}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              )}

              {/* Sub Screen filter */}
              {subScreensList.length > 0 && (
                <select
                  value={filterSubScreen}
                  onChange={(e) => {
                    setFilterSubScreen(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-pointer"
                >
                  <option value="All">All Sub Screens ({subScreensList.length})</option>
                  {subScreensList.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-pointer"
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

              {(filterStatus !== 'All' || filterSubScreen !== 'All' || searchQuery) && (
                <button
                  onClick={() => {
                    setFilterStatus('All');
                    setFilterSubScreen('All');
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Test Case Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>{activeScreen} Test Cases</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                    {filteredScreenRows.length} items
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Update execution status directly via dropdown. Click "Evidence" to attach mobile screenshots.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    {/* Bulk Selection Checkbox */}
                    <th className="py-3 px-3 w-8">
                      <button
                        onClick={toggleSelectAllVisible}
                        disabled={paginatedRows.length === 0}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-40"
                        title={isAllVisibleSelected ? 'Deselect all' : 'Select all visible'}
                      >
                        {isAllVisibleSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th
                      onClick={() => handleSort('testId')}
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center gap-1">
                        <span>Test ID</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('scenario')}
                      className="py-3 px-4 cursor-pointer hover:text-slate-800 min-w-[260px]"
                    >
                      <div className="flex items-center gap-1">
                        <span>Scenario</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('subScreenName')}
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center gap-1">
                        <span>Sub Screen</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('platform')}
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center gap-1">
                        <span>Platform</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('buildVersion')}
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center gap-1">
                        <span>Build Version</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('testerName')}
                      className="py-3 px-4 cursor-pointer hover:text-slate-800"
                    >
                      <div className="flex items-center gap-1">
                        <span>QA Tester</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4 min-w-[150px]">Execution Status</th>
                    <th className="py-3 px-4">Evidence Screenshot</th>
                    <th className="py-3 px-4">Execution Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.length > 0 ? (
                    paginatedRows.map((tc) => {
                      const isSelected = selectedTestCaseIds.has(tc.id);

                      return (
                        <tr
                          key={tc.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            isSelected ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <td className="py-3 px-3">
                            <button
                              onClick={() => toggleSelectTestCase(tc.id)}
                              className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {tc.testId}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">{tc.scenario}</td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {tc.subScreenName ? (
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium text-[11px] border border-blue-100">
                                {tc.subScreenName}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {tc.platform || 'Both'}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="font-mono text-[11px] font-medium text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                              {tc.buildVersion || 'v1.0.0'}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="text-[11px] font-medium text-slate-800">
                              {tc.testerName || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {/* INLINE STATUS DROPDOWN */}
                            <select
                              value={tc.status}
                              onChange={(e) =>
                                handleInlineStatusChange(tc.id, e.target.value as TestStatus)
                              }
                              className={`px-3 py-1.5 rounded-xl border text-xs cursor-pointer outline-none transition-all ${getStatusSelectStyle(
                                tc.status
                              )}`}
                            >
                              <option value="Pass">Pass</option>
                              <option value="Fail">Fail</option>
                              <option value="Blocked">Blocked</option>
                              <option value="Resolved">Resolved (Pass)</option>
                              <option value="UI Issue">UI Issue</option>
                              <option value="Verification">Verification</option>
                              <option value="Not Run">Not Run</option>
                            </select>
                          </td>

                          {/* Evidence preview / status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {tc.evidenceScreenshot ? (
                              <button
                                onClick={() => setEvidenceTargetTestCase(tc)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
                                title="Click to view full screenshot"
                              >
                                <img
                                  src={tc.evidenceScreenshot.url}
                                  alt="thumb"
                                  className="w-4 h-4 rounded object-cover"
                                />
                                <span>View Evidence</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">No screenshot</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {tc.executionDate}
                          </td>

                          {/* Action Buttons: Evidence & Delete */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setEvidenceTargetTestCase(tc)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                                  tc.evidenceScreenshot
                                    ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                }`}
                              >
                                <Camera className="w-3.5 h-3.5" />
                                <span>
                                  {tc.evidenceScreenshot ? 'Update Evidence' : 'Upload Evidence'}
                                </span>
                              </button>

                              {/* Delete Test Case */}
                              <button
                                onClick={() => setTestCaseToDelete(tc)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Delete this test case"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-slate-400">
                        No test cases found matching filters for {activeScreen}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <div>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, filteredScreenRows.length)} of{' '}
                  {filteredScreenRows.length} items
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-semibold px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Clean Empty State */
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center max-w-lg mx-auto shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Layers className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            {screensList.length === 0 ? 'No Screens in Database' : `No Tests Found for ${activeScreen}`}
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {screensList.length === 0
              ? 'Upload your 3-column Excel spreadsheet (Test ID, Scenario, Status) with your target screen name to populate tests.'
              : `There are currently no imported execution results associated with ${activeScreen}.`}
          </p>
          <button
            onClick={onNavigateToUpload}
            className="mt-5 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Test Results for this Screen</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal: Delete Single Test Case */}
      {testCaseToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Delete Test Case {testCaseToDelete.testId}?
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Are you sure you want to delete this test case from screen{' '}
              <strong className="text-slate-700">{testCaseToDelete.screenName}</strong>? All attached mobile screenshot evidence will be permanently deleted.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 mt-3">
              <span className="font-semibold block mb-0.5">{testCaseToDelete.testId}:</span>
              <p className="text-slate-600 text-[11px]">{testCaseToDelete.scenario}</p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setTestCaseToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteTestCase}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Delete Test Case
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Clear Entire Screen Data */}
      {showConfirmClearScreen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Clear All Data for "{activeScreen}"?
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              This will permanently delete all <strong className="text-rose-600">{allScreenTestCases.length} test cases</strong> and their mobile screenshots belonging to the <strong className="text-slate-800">{activeScreen}</strong> screen from the database.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowConfirmClearScreen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClearScreen}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Yes, Clear Screen Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Bulk Delete */}
      {isDeletingBulk && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Delete {selectedTestCaseIds.size} Selected Test Cases?
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Are you sure you want to delete these {selectedTestCaseIds.size} test cases from {activeScreen}? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsDeletingBulk(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Upload & Viewer Modal */}
      {evidenceTargetTestCase && (
        <EvidenceModal
          testCase={evidenceTargetTestCase}
          onClose={() => setEvidenceTargetTestCase(null)}
          onSuccess={() => {
            const fresh = storageService
              .getTestCases()
              .find((tc) => tc.id === evidenceTargetTestCase.id);
            setEvidenceTargetTestCase(fresh || null);
          }}
        />
      )}
    </div>
  );
};
