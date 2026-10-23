import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Percent,
  Filter,
  Search,
  X,
  Layers,
  ArrowUpDown,
  UploadCloud,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertTriangle,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TestCaseExecution, TestStatus, ExcelImportBatch } from '../../types';
import { storageService } from '../../services/storage';
import { EvidenceModal } from '../common/EvidenceModal';

interface OverviewDashboardProps {
  testCases: TestCaseExecution[];
  onNavigateToUpload: () => void;
  onNavigateToScreen: (screenName: string) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  testCases,
  onNavigateToUpload,
  onNavigateToScreen,
}) => {
  // Local Filter States
  const [filterPlatform, setFilterPlatform] = useState('All');
  const [filterScreen, setFilterScreen] = useState('All');
  const [filterSubScreen, setFilterSubScreen] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Table Sorting & Pagination
  const [sortField, setSortField] = useState<keyof TestCaseExecution>('testId');
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Evidence Modal
  const [evidenceTargetTestCase, setEvidenceTargetTestCase] = useState<TestCaseExecution | null>(null);

  // Deletion States
  const [selectedTestCaseIds, setSelectedTestCaseIds] = useState<Set<string>>(new Set());
  const [batchToDelete, setBatchToDelete] = useState<ExcelImportBatch | null>(null);
  const [testCaseToDelete, setTestCaseToDelete] = useState<TestCaseExecution | null>(null);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);

  const importBatches = storageService.getImportBatches();

  // Dynamic Screens List
  const availableScreens = useMemo(() => {
    const set = new Set<string>();
    testCases.forEach((tc) => {
      if (filterPlatform !== 'All' && tc.platform !== filterPlatform) return;
      if (tc.screenName) set.add(tc.screenName);
    });
    return Array.from(set).sort();
  }, [testCases, filterPlatform]);

  // Dynamic Sub Screens List
  const availableSubScreens = useMemo(() => {
    const set = new Set<string>();
    testCases.forEach((tc) => {
      if (filterPlatform !== 'All' && tc.platform !== filterPlatform) return;
      if (tc.subScreenName && (filterScreen === 'All' || tc.screenName === filterScreen)) {
        set.add(tc.subScreenName);
      }
    });
    return Array.from(set).sort();
  }, [testCases, filterPlatform, filterScreen]);

  // Unified Filtered Dataset
  const filteredTestCases = useMemo(() => {
    return testCases.filter((tc) => {
      if (filterPlatform !== 'All' && tc.platform !== filterPlatform) return false;
      if (filterScreen !== 'All' && tc.screenName !== filterScreen) return false;
      if (filterSubScreen !== 'All' && tc.subScreenName !== filterSubScreen) return false;
      if (filterStatus !== 'All' && tc.status !== filterStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = tc.testId.toLowerCase().includes(q);
        const matchesScenario = tc.scenario.toLowerCase().includes(q);
        const matchesScreen = tc.screenName.toLowerCase().includes(q);
        const matchesSubScreen = (tc.subScreenName || '').toLowerCase().includes(q);
        const matchesPlatform = (tc.platform || '').toLowerCase().includes(q);
        const matchesBuild = (tc.buildVersion || '').toLowerCase().includes(q);
        const matchesTester = (tc.testerName || '').toLowerCase().includes(q);
        if (
          !matchesId &&
          !matchesScenario &&
          !matchesScreen &&
          !matchesSubScreen &&
          !matchesPlatform &&
          !matchesBuild &&
          !matchesTester
        )
          return false;
      }

      if (startDate && tc.executionDate < startDate) return false;
      if (endDate && tc.executionDate > endDate) return false;

      return true;
    });
  }, [testCases, filterPlatform, filterScreen, filterSubScreen, filterStatus, searchQuery, startDate, endDate]);

  // Metrics calculated strictly using calculation rules (Resolved is considered Pass)
  const metrics = useMemo(() => {
    return storageService.calculateMetrics(filteredTestCases);
  }, [filteredTestCases]);

  // Sorted and Paginated Table Rows
  const sortedTestCases = useMemo(() => {
    const list = [...filteredTestCases];
    list.sort((a, b) => {
      const valA = String(a[sortField] || '').toLowerCase();
      const valB = String(b[sortField] || '').toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredTestCases, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedTestCases.length / pageSize));
  const paginatedTestCases = sortedTestCases.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (field: keyof TestCaseExecution) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleClearFilters = () => {
    setFilterPlatform('All');
    setFilterScreen('All');
    setFilterSubScreen('All');
    setFilterStatus('All');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const isFilterActive =
    filterPlatform !== 'All' ||
    filterScreen !== 'All' ||
    filterSubScreen !== 'All' ||
    filterStatus !== 'All' ||
    searchQuery !== '' ||
    startDate !== '' ||
    endDate !== '';

  // Selection Logic for Bulk Deletion
  const isAllVisibleSelected =
    paginatedTestCases.length > 0 &&
    paginatedTestCases.every((tc) => selectedTestCaseIds.has(tc.id));

  const toggleSelectAllVisible = () => {
    const next = new Set(selectedTestCaseIds);
    if (isAllVisibleSelected) {
      paginatedTestCases.forEach((tc) => next.delete(tc.id));
    } else {
      paginatedTestCases.forEach((tc) => next.add(tc.id));
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

  const handleConfirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    await storageService.deleteBatch(batchToDelete.id);
    setBatchToDelete(null);
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

  // Chart 1: Status Distribution
  const pieData = [
    { name: 'Pass', value: metrics.rawPass, color: '#10B981' },
    { name: 'Resolved (Pass)', value: metrics.resolved, color: '#06B6D4' },
    { name: 'Fail', value: metrics.failed, color: '#EF4444' },
    { name: 'Blocked', value: metrics.blocked, color: '#F59E0B' },
    { name: 'UI Issue', value: metrics.uiIssue, color: '#A855F7' },
    { name: 'Verification', value: metrics.verification, color: '#6366F1' },
    { name: 'Not Run', value: metrics.notRun, color: '#9CA3AF' },
  ].filter((d) => d.value > 0);

  // Chart 2: Screen-wise Pass/Fail
  const screenChartData = useMemo(() => {
    const map: Record<string, { screen: string; Pass: number; Fail: number; Blocked: number; UIIssue: number; Verification: number; NotRun: number; Total: number }> = {};
    filteredTestCases.forEach((tc) => {
      if (!map[tc.screenName]) {
        map[tc.screenName] = {
          screen: tc.screenName.length > 15 ? `${tc.screenName.slice(0, 13)}…` : tc.screenName,
          Pass: 0,
          Fail: 0,
          Blocked: 0,
          UIIssue: 0,
          Verification: 0,
          NotRun: 0,
          Total: 0,
        };
      }
      map[tc.screenName].Total++;
      if (tc.status === 'Pass' || tc.status === 'Resolved') map[tc.screenName].Pass++;
      else if (tc.status === 'Fail') map[tc.screenName].Fail++;
      else if (tc.status === 'Blocked') map[tc.screenName].Blocked++;
      else if (tc.status === 'UI Issue') map[tc.screenName].UIIssue++;
      else if (tc.status === 'Verification') map[tc.screenName].Verification++;
      else if (tc.status === 'Not Run') map[tc.screenName].NotRun++;
    });
    return Object.values(map);
  }, [filteredTestCases]);

  // Screen-wise Summary Cards
  const screenSummaryList = useMemo(() => {
    const map: Record<string, { screen: string; total: number; pass: number; fail: number; uiIssue: number; verification: number; notRun: number }> = {};
    filteredTestCases.forEach((tc) => {
      if (!map[tc.screenName]) {
        map[tc.screenName] = { screen: tc.screenName, total: 0, pass: 0, fail: 0, uiIssue: 0, verification: 0, notRun: 0 };
      }
      map[tc.screenName].total++;
      if (tc.status === 'Pass' || tc.status === 'Resolved') map[tc.screenName].pass++;
      if (tc.status === 'Fail') map[tc.screenName].fail++;
      if (tc.status === 'UI Issue') map[tc.screenName].uiIssue++;
      if (tc.status === 'Verification') map[tc.screenName].verification++;
      if (tc.status === 'Not Run') map[tc.screenName].notRun++;
    });
    return Object.values(map);
  }, [filteredTestCases]);

  const handleInlineStatusChange = (id: string, newStatus: TestStatus) => {
    storageService.updateTestCaseStatus(id, newStatus);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Overview Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time mobile QA metrics, pass rates (with Resolved counted as Pass), and live persistent storage.
          </p>
        </div>

        <button
          onClick={onNavigateToUpload}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Import Excel Results</span>
        </button>
      </div>

      {/* Core Metric Cards: Status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Total Cases */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span className="truncate">Total</span>
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900">{metrics.total}</div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">All test cases</div>
        </div>

        {/* Passed (Includes Resolved) */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between text-emerald-700 text-xs font-medium">
            <span className="truncate">Passed</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-600">{metrics.passed}</div>
          <div className="mt-0.5 text-[10px] text-emerald-600/80 font-medium truncate">
            {metrics.rawPass}P + {metrics.resolved}R
          </div>
        </div>

        {/* Failed */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-rose-200 transition-all">
          <div className="flex items-center justify-between text-rose-700 text-xs font-medium">
            <span className="truncate">Failed</span>
            <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-rose-600">{metrics.failed}</div>
          <div className="mt-0.5 text-[10px] text-rose-600/80 font-medium truncate">Requires fix</div>
        </div>

        {/* Blocked */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-amber-200 transition-all">
          <div className="flex items-center justify-between text-amber-700 text-xs font-medium">
            <span className="truncate">Blocked</span>
            <HelpCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-amber-600">{metrics.blocked}</div>
          <div className="mt-0.5 text-[10px] text-amber-600/80 font-medium truncate">Impediments</div>
        </div>

        {/* UI Issue */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-purple-200 transition-all">
          <div className="flex items-center justify-between text-purple-700 text-xs font-medium">
            <span className="truncate">UI Issue</span>
            <AlertTriangle className="w-3.5 h-3.5 text-purple-500 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-purple-600">{metrics.uiIssue}</div>
          <div className="mt-0.5 text-[10px] text-purple-600/80 font-medium truncate">Visual defect</div>
        </div>

        {/* Verification */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-indigo-200 transition-all">
          <div className="flex items-center justify-between text-indigo-700 text-xs font-medium">
            <span className="truncate">Verification</span>
            <CheckSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-indigo-600">{metrics.verification}</div>
          <div className="mt-0.5 text-[10px] text-indigo-600/80 font-medium truncate">Awaiting check</div>
        </div>

        {/* Not Run */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-slate-600 text-xs font-medium">
            <span className="truncate">Not Run</span>
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-600">{metrics.notRun}</div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">Pending</div>
        </div>

        {/* Pass Rate */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs hover:border-blue-200 transition-all">
          <div className="flex items-center justify-between text-blue-700 text-xs font-medium">
            <span className="truncate">Pass Rate</span>
            <Percent className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-blue-600">{metrics.passRateDisplay}</div>
          <div className="mt-0.5 text-[10px] text-slate-400 truncate">P / (P + F)</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Filter Test Results</span>
          </div>

          {isFilterActive && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search Test ID, tester, build..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Platform Filter */}
          <div>
            <select
              value={filterPlatform}
              onChange={(e) => {
                setFilterPlatform(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-pointer"
            >
              <option value="All">All Platforms</option>
              <option value="Android">Android</option>
              <option value="iOS">iOS</option>
              <option value="Both">Both</option>
            </select>
          </div>

          {/* Screen Filter */}
          <div>
            <select
              value={filterScreen}
              onChange={(e) => {
                setFilterScreen(e.target.value);
                setFilterSubScreen('All');
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-pointer"
            >
              <option value="All">All Screens ({availableScreens.length})</option>
              {availableScreens.map((sc) => (
                <option key={sc} value={sc}>
                  {sc}
                </option>
              ))}
            </select>
          </div>

          {/* Sub Screen Filter */}
          <div>
            <select
              value={filterSubScreen}
              onChange={(e) => {
                setFilterSubScreen(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-pointer"
            >
              <option value="All">All Sub Screens ({availableSubScreens.length})</option>
              {availableSubScreens.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium cursor-pointer"
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

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-xl">
            <span className="text-[10px] text-slate-400 font-medium shrink-0">Date:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-xs text-slate-700 outline-none w-full"
            />
          </div>
        </div>
      </div>

      {/* Analytics Charts Row */}
      {testCases.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Status Distribution Pie Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Execution Distribution</h2>
                <p className="text-[11px] text-slate-400">Status breakdown across test suites</p>
              </div>
              <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                {metrics.passRateDisplay} Pass Rate
              </div>
            </div>

            <div className="h-56 w-full mt-2">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No matching test cases to visualize
                </div>
              )}
            </div>

            <div className="grid grid-cols-6 gap-1 pt-3 border-t border-slate-100 text-center text-xs">
              <div>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                <span className="text-slate-500 text-[10px]">Pass</span>
                <div className="font-bold text-emerald-600 text-xs">{metrics.rawPass}</div>
              </div>
              <div>
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-500 mr-1" />
                <span className="text-slate-500 text-[10px]">Resolved</span>
                <div className="font-bold text-cyan-600 text-xs">{metrics.resolved}</div>
              </div>
              <div>
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1" />
                <span className="text-slate-500 text-[10px]">Fail</span>
                <div className="font-bold text-rose-600 text-xs">{metrics.failed}</div>
              </div>
              <div>
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
                <span className="text-slate-500 text-[10px]">Blocked</span>
                <div className="font-bold text-amber-600 text-xs">{metrics.blocked}</div>
              </div>
              <div>
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1" />
                <span className="text-slate-500 text-[10px]">UI Issue</span>
                <div className="font-bold text-purple-600 text-xs">{metrics.uiIssue}</div>
              </div>
              <div>
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1" />
                <span className="text-slate-500 text-[10px]">Verification</span>
                <div className="font-bold text-indigo-600 text-xs">{metrics.verification}</div>
              </div>
            </div>
          </div>

          {/* Screen-wise Pass / Fail Bar Chart */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Screen-wise Pass / Fail Breakdown</h2>
                <p className="text-[11px] text-slate-400">Quality health across mobile screens (Resolved counted as Pass)</p>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {screenChartData.length} Screens
              </span>
            </div>

            <div className="h-56 w-full mt-2">
              {screenChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={screenChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="screen" tick={{ fontSize: 10, fill: '#64748B' }} angle={-15} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                    <RechartsTooltip />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Bar dataKey="Pass" fill="#10B981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Fail" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Blocked" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="UIIssue" name="UI Issue" fill="#A855F7" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Verification" name="Verification" fill="#6366F1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="NotRun" name="Not Run" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No screen data found for current filters
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Screen-wise Execution Cards */}
      {screenSummaryList.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Screen Test Execution Summary</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Click any screen to open screen results, update status, or attach mobile screenshots
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {screenSummaryList.map((sc) => {
              const scPassRate =
                sc.pass + sc.fail > 0 ? ((sc.pass / (sc.pass + sc.fail)) * 100).toFixed(0) + '%' : 'N/A';

              return (
                <div
                  key={sc.screen}
                  onClick={() => onNavigateToScreen(sc.screen)}
                  className="p-3.5 rounded-xl border border-slate-200/90 hover:border-blue-400 hover:shadow-sm bg-slate-50/50 hover:bg-white transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                      {sc.screen}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                      {scPassRate}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-center text-[10px]">
                    <div className="bg-white p-1 rounded border border-slate-200/70">
                      <span className="text-slate-400 block">Total</span>
                      <span className="font-bold text-slate-800">{sc.total}</span>
                    </div>
                    <div className="bg-emerald-50 p-1 rounded border border-emerald-100">
                      <span className="text-emerald-700 block">Pass</span>
                      <span className="font-bold text-emerald-700">{sc.pass}</span>
                    </div>
                    <div className="bg-rose-50 p-1 rounded border border-rose-100">
                      <span className="text-rose-700 block">Fail</span>
                      <span className="font-bold text-rose-700">{sc.fail}</span>
                    </div>
                    <div className="bg-slate-100 p-1 rounded border border-slate-200">
                      <span className="text-slate-600 block">Not Run</span>
                      <span className="font-bold text-slate-700">{sc.notRun}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive 3-Column Test Cases Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Table Header & Bulk Actions */}
        <div className="p-4 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>Test Case Execution Register (3 Columns)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                {filteredTestCases.length} items
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Showing Test ID, Scenario, Status, Screen Name, Sub Screen, and Evidence
            </p>
          </div>

          {/* Bulk Selection Action Bar */}
          {selectedTestCaseIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl">
              <span className="text-xs font-bold text-slate-800">
                {selectedTestCaseIds.size} selected
              </span>
              <button
                onClick={() => setIsDeletingBulk(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
              <button
                onClick={() => setSelectedTestCaseIds(new Set())}
                className="text-xs text-slate-500 hover:text-slate-700 px-1.5 py-1"
              >
                Deselect
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200/80">
              <tr>
                {/* Select All Checkbox */}
                <th className="py-3 px-3 w-8">
                  <button
                    onClick={toggleSelectAllVisible}
                    disabled={paginatedTestCases.length === 0}
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
                  className="py-3 px-4 cursor-pointer hover:text-slate-800 min-w-[280px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Scenario</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('status')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Status</span>
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
                  onClick={() => handleSort('screenName')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Screen Name</span>
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
                  onClick={() => handleSort('testerName')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>QA Tester</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Evidence</th>
                <th
                  onClick={() => handleSort('executionDate')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-800"
                >
                  <div className="flex items-center gap-1">
                    <span>Date</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTestCases.length > 0 ? (
                paginatedTestCases.map((tc) => {
                  const isSelected = selectedTestCaseIds.has(tc.id);

                  return (
                    <tr
                      key={tc.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
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
                        <select
                          value={tc.status}
                          onChange={(e) =>
                            handleInlineStatusChange(tc.id, e.target.value as TestStatus)
                          }
                          className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer font-bold ${
                            tc.status === 'Pass'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : tc.status === 'Resolved'
                              ? 'bg-cyan-50 text-cyan-800 border-cyan-300'
                              : tc.status === 'Fail'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : tc.status === 'Blocked'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : tc.status === 'UI Issue'
                              ? 'bg-purple-50 text-purple-800 border-purple-300'
                              : tc.status === 'Verification'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300 font-medium'
                          }`}
                        >
                          <option value="Pass">Pass</option>
                          <option value="Resolved">Resolved (Pass)</option>
                          <option value="Fail">Fail</option>
                          <option value="Blocked">Blocked</option>
                          <option value="UI Issue">UI Issue</option>
                          <option value="Verification">Verification</option>
                          <option value="Not Run">Not Run</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            tc.platform === 'iOS'
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : tc.platform === 'Both'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {tc.platform || 'Android'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {tc.buildVersion || 'v1.0.0'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        {tc.screenName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {tc.subScreenName ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium text-[11px] border border-blue-100">
                            {tc.subScreenName}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                        {tc.testerName || 'admin'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {tc.evidenceScreenshot ? (
                          <button
                            onClick={() => setEvidenceTargetTestCase(tc)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold hover:bg-emerald-100 cursor-pointer"
                          >
                            <img
                              src={tc.evidenceScreenshot.url}
                              alt=""
                              className="w-3.5 h-3.5 rounded object-cover"
                            />
                            <span>View Evidence</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {tc.executionDate}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEvidenceTargetTestCase(tc)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                          >
                            {tc.evidenceScreenshot ? 'Update Evidence' : 'Upload Evidence'}
                          </button>

                          {/* Delete individual test case button */}
                          <button
                            onClick={() => setTestCaseToDelete(tc)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete this test case from database"
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
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="font-semibold text-slate-600">
                      {testCases.length === 0
                        ? 'No test cases in the database yet'
                        : 'No test cases match filter conditions'}
                    </p>
                    <p className="text-[11px] mt-1 text-slate-400">
                      {testCases.length === 0
                        ? 'Upload your first 3-column Excel spreadsheet to start testing.'
                        : 'Try clearing filters or search query.'}
                    </p>
                    {testCases.length === 0 ? (
                      <button
                        onClick={onNavigateToUpload}
                        className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Upload 3-Col Excel Now</span>
                      </button>
                    ) : (
                      isFilterActive && (
                        <button
                          onClick={handleClearFilters}
                          className="mt-3 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-200/90 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, filteredTestCases.length)} of{' '}
              {filteredTestCases.length} items
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

      {/* Recent Excel Uploads with DELETE BATCH option */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-blue-600" />
              <span>Uploaded Excel Batches</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Delete any irrelevant or accidental uploads to remove their test cases completely.
            </p>
          </div>
          <button
            onClick={onNavigateToUpload}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            Upload New
          </button>
        </div>

        <div className="space-y-2.5">
          {importBatches.length > 0 ? (
            importBatches.map((batch) => (
              <div
                key={batch.id}
                className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="truncate flex-1">
                  <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{batch.filename}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      Screen: <strong className="text-slate-700">{batch.screenName}</strong>
                    </span>
                    {batch.subScreenName && (
                      <span className="text-blue-600 font-semibold">› {batch.subScreenName}</span>
                    )}
                    <span>• {batch.totalRows} rows</span>
                    <span>• Project: {batch.projectName}</span>
                    <span>• By {batch.uploader}</span>
                    <span>• {new Date(batch.uploadedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {batch.status}
                  </span>

                  {/* DELETE BATCH BUTTON */}
                  <button
                    onClick={() => setBatchToDelete(batch)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-medium"
                    title="Delete this batch and all its test cases"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-rose-600 font-semibold">Delete Batch</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-xs text-slate-400">
              No Excel batches uploaded yet.
            </div>
          )}
        </div>
      </div>

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
              <strong className="text-slate-700">{testCaseToDelete.screenName}</strong>? Any attached mobile screenshot evidence will also be removed from the database.
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

      {/* Confirmation Modal: Delete Entire Upload Batch */}
      {batchToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Delete Upload Batch "{batchToDelete.filename}"?
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              This will permanently delete this upload record and{' '}
              <strong className="text-rose-600">
                all test cases and screenshot evidence
              </strong>{' '}
              imported in this batch for screen{' '}
              <strong className="text-slate-700">{batchToDelete.screenName}</strong>.
            </p>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 mt-3">
              This action cannot be undone. Any irrelevant rows will be cleared out immediately.
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setBatchToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteBatch}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Yes, Delete Batch
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
              Are you sure you want to delete these {selectedTestCaseIds.size} test cases from the database? All associated statuses and mobile screenshot evidence will be permanently deleted.
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

      {/* Evidence Modal */}
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
