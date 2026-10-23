import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  Smartphone,
  Layers,
  Calendar,
  User,
  Info,
  Copy,
  Trash2,
} from 'lucide-react';
import { storageService } from '../../services/storage';
import { TestStatus } from '../../types';
import {
  parseAndValidateExcel,
  ParseExcelResult,
  ParsedRowResult,
  downloadSampleExcelWorkbook,
  downloadValidationErrorReport,
} from '../../utils/excelGenerator';

interface UploadTestResultsProps {
  onImportComplete: () => void;
}

export const UploadTestResults: React.FC<UploadTestResultsProps> = ({ onImportComplete }) => {
  const currentUser = storageService.getCurrentUser();
  const existingTestCases = storageService.getTestCases();
  const existingScreens = Array.from(new Set(existingTestCases.map((tc) => tc.screenName).filter(Boolean)));

  // Inputs as text boxes as requested (starts blank with helpful placeholders)
  const [screenName, setScreenName] = useState('');
  const [subScreenName, setSubScreenName] = useState('');

  const [platform, setPlatform] = useState<'Android' | 'iOS' | 'Both'>('Android');
  const [buildVersion, setBuildVersion] = useState('v1.0.0');
  const [executionDate, setExecutionDate] = useState(new Date().toISOString().slice(0, 10));
  const [testerName, setTesterName] = useState(currentUser.name || 'admin');

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseExcelResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Duplicate detection state
  const [duplicatesCount, setDuplicatesCount] = useState<number>(0);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');

  // Import outcome state
  const [importSummary, setImportSummary] = useState<{
    success: boolean;
    imported: number;
    updated: number;
    skipped: number;
    batchId: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process File
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const filename = selectedFile.name;
    if (!filename.endsWith('.xlsx')) {
      setFileError(
        'Unsupported file format. Please upload a Microsoft Excel (.xlsx) file with the 3 required columns (Test ID, Scenario, Status).'
      );
      setFile(null);
      setParseResult(null);
      return;
    }

    setFile(selectedFile);
    setFileError(null);
    setIsParsing(true);
    setImportSummary(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const result = parseAndValidateExcel(buffer);
      setParseResult(result);

      if (!result.success) {
        setFileError(result.columnErrors.join(' '));
      } else {
        // Detect duplicates in target screen
        const existingList = storageService.getTestCases();
        const detectedDupes: string[] = [];

        result.validRows.forEach((r) => {
          const isDupe = existingList.some(
            (tc) =>
              tc.screenName.toLowerCase() === screenName.trim().toLowerCase() &&
              (tc.subScreenName || '').toLowerCase() === (subScreenName.trim() || '').toLowerCase() &&
              tc.testId.toLowerCase() === r.testId.toLowerCase()
          );
          if (isDupe) {
            detectedDupes.push(r.testId);
          }
        });

        setDuplicatesCount(detectedDupes.length);
        setDuplicateIds(detectedDupes);
      }
    } catch (err) {
      console.error(err);
      setFileError('Failed to parse Excel file. Ensure the workbook is not corrupted or password-protected.');
    } finally {
      setIsParsing(false);
    }
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;

    if (!screenName.trim()) {
      setFileError('Target Screen Name is required.');
      return;
    }

    const rowsToImport = parseResult.validRows.map((r) => ({
      testId: r.testId,
      scenario: r.scenario,
      status: r.status as TestStatus,
    }));

    const result = await storageService.importTestCases({
      batchInfo: {
        filename: file?.name || 'Uploaded_Tests.xlsx',
        uploader: testerName.trim() || currentUser.name,
        projectName: '',
        applicationName: '',
        buildVersion: buildVersion.trim() || 'v1.0.0',
        screenName: screenName.trim(),
        subScreenName: subScreenName.trim() || undefined,
        platform,
        totalRows: parseResult.totalRows,
        validRows: parseResult.validRows.length,
        invalidRows: parseResult.invalidRows.length,
        duplicatesDetected: duplicatesCount,
      },
      rows: rowsToImport,
      duplicateAction,
    });

    if (result.success) {
      setImportSummary({
        success: true,
        imported: result.importedCount,
        updated: result.updatedCount,
        skipped: result.skippedCount,
        batchId: result.batchId,
      });
      setFile(null);
      setParseResult(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      setFileError(result.error || 'Failed to complete import.');
    }
  };

  const handleResetForm = () => {
    setFile(null);
    setParseResult(null);
    setFileError(null);
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteCurrentBatch = async () => {
    if (!importSummary?.batchId) return;
    await storageService.deleteBatch(importSummary.batchId);
    setImportSummary(null);
    handleResetForm();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Upload Test Results
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Import Excel test executions (Test ID, Scenario, Status: Pass, Fail, Blocked, Resolved, UI Issue, Verification, Not Run) directly into your target mobile screen.
          </p>
        </div>

        <button
          onClick={() => downloadSampleExcelWorkbook()}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4 text-blue-600" />
          <span>Download Sample Template (.xlsx)</span>
        </button>
      </div>

      {/* 3-Column Specification Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white shadow-md">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
            <Info className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <h2 className="font-bold text-white text-sm">Required 3-Column Excel Structure (.xlsx)</h2>
            <p className="text-slate-300 mt-1 leading-relaxed">
              Your Excel sheet must contain exactly these 3 columns in order:{' '}
              <span className="font-mono bg-blue-950/80 px-1.5 py-0.5 rounded text-blue-300 font-bold">Test ID</span>,{' '}
              <span className="font-mono bg-blue-950/80 px-1.5 py-0.5 rounded text-blue-300 font-bold">Scenario</span>, and{' '}
              <span className="font-mono bg-blue-950/80 px-1.5 py-0.5 rounded text-blue-300 font-bold">Status</span>.
            </p>
            <div className="mt-2 text-[11px] text-slate-400">
              Accepted status values: <span className="text-emerald-400 font-semibold">Pass</span>,{' '}
              <span className="text-rose-400 font-semibold">Fail</span>,{' '}
              <span className="text-amber-400 font-semibold">Blocked</span>,{' '}
              <span className="text-cyan-400 font-semibold">Resolved</span> (counts as Pass),{' '}
              <span className="text-purple-400 font-semibold">UI Issue</span>,{' '}
              <span className="text-indigo-400 font-semibold">Verification</span>, and{' '}
              <span className="text-slate-300 font-semibold">Not Run</span>.
            </div>
          </div>
        </div>
      </div>

      {/* Target Scope Inputs (Screen, Sub Screen, Platform, Build Version, QA Tester) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>Execution Target Information</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          {/* Target Screen Name (Text Box) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Screen Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              list="existing-screens"
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
              placeholder="e.g. Login Screen, Payment Screen"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white"
              required
            />
            <datalist id="existing-screens">
              {existingScreens.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Sub Screen Name (Text Box) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sub Screen Name
            </label>
            <input
              type="text"
              value={subScreenName}
              onChange={(e) => setSubScreenName(e.target.value)}
              placeholder="e.g. Form Inputs, Biometrics, QR Scanner"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>

          {/* Platform */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Platform</label>
            <div className="flex gap-2">
              {(['Android', 'iOS', 'Both'] as const).map((plat) => (
                <button
                  key={plat}
                  type="button"
                  onClick={() => setPlatform(plat)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    platform === plat
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {plat}
                </button>
              ))}
            </div>
          </div>

          {/* Build Version */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Build / Version</label>
            <input
              type="text"
              value={buildVersion}
              onChange={(e) => setBuildVersion(e.target.value)}
              placeholder="e.g. v3.2.0"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Test Execution Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Execution Date</label>
            <input
              type="date"
              value={executionDate}
              onChange={(e) => setExecutionDate(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>

          {/* Tester Name */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">QA Tester Name</label>
            <input
              type="text"
              value={testerName}
              onChange={(e) => setTesterName(e.target.value)}
              placeholder="Full name of tester"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>
      </div>

      {/* File Dropzone */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <UploadCloud className="w-4 h-4 text-blue-600" />
          <span>Upload 3-Column Excel Spreadsheet (.xlsx)</span>
        </h2>

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
        >
          <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <FileSpreadsheet className="w-6 h-6" />
          </div>

          <span className="text-sm font-bold text-slate-800">
            {file ? file.name : 'Choose an Excel results workbook to import'}
          </span>
          <span className="text-xs text-slate-400 mt-1 max-w-sm">
            Drag & drop here or click to browse. File must be .xlsx with headers: <strong>Test ID</strong>, <strong>Scenario</strong>, <strong>Status</strong>.
          </span>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Parsing state spinner */}
        {isParsing && (
          <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Validating Excel structure for the 3 required columns...</span>
          </div>
        )}

        {/* File Error Alert */}
        {fileError && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Validation Error</span>
              <p className="leading-relaxed">{fileError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Parse Preview & Stats Area */}
      {parseResult && parseResult.success && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-5 animate-in fade-in duration-200">
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 block">Total Rows In File</span>
              <span className="text-xl font-bold text-slate-900">{parseResult.totalRows}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[11px] text-emerald-700 block">Valid Test Cases</span>
              <span className="text-xl font-bold text-emerald-700">{parseResult.validRows.length}</span>
            </div>
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
              <span className="text-[11px] text-rose-700 block">Invalid Rows</span>
              <span className="text-xl font-bold text-rose-700">{parseResult.invalidRows.length}</span>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-[11px] text-amber-700 block">Duplicate IDs Detected</span>
              <span className="text-xl font-bold text-amber-700">{duplicatesCount}</span>
            </div>
          </div>

          {/* Invalid Rows Warning & Download Error Report */}
          {parseResult.invalidRows.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    {parseResult.invalidRows.length} row(s) failed strict 3-column validation.
                  </span>
                  <p className="mt-0.5 text-amber-800">
                    Invalid rows will not be imported silently. Download the error report to correct them.
                  </p>
                </div>
              </div>
              <button
                onClick={() => downloadValidationErrorReport(parseResult.invalidRows)}
                className="px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Error Report</span>
              </button>
            </div>
          )}

          {/* Duplicate Action Selector */}
          {duplicatesCount > 0 && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-blue-900">
                <Copy className="w-4 h-4 text-blue-600" />
                <span>Duplicate Handling for {screenName}</span>
              </div>
              <p className="text-blue-800 leading-relaxed">
                Found {duplicatesCount} Test ID(s) that already have execution records in this screen ({duplicateIds.slice(0, 5).join(', ')}{duplicatesCount > 5 ? '…' : ''}). How would you like to handle duplicates?
              </p>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="dupeAction"
                    checked={duplicateAction === 'skip'}
                    onChange={() => setDuplicateAction('skip')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>Skip duplicates (Keep existing records untouched)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="radio"
                    name="dupeAction"
                    checked={duplicateAction === 'update'}
                    onChange={() => setDuplicateAction('update')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>Explicitly update existing records with new status</span>
                </label>
              </div>
            </div>
          )}

          {/* Preview Table of Rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Parsed Rows Preview ({parseResult.validRows.length} valid)
              </h2>
              <span className="text-[11px] text-slate-400">
                Screen: <strong className="text-slate-700">{screenName}</strong>
                {subScreenName && (
                  <span className="ml-1 text-blue-600 font-semibold">› {subScreenName}</span>
                )}{' '}
                • Platform: <strong className="text-slate-700">{platform}</strong> • Build: <strong className="text-slate-700">{buildVersion || 'v1.0.0'}</strong>
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[10px] uppercase font-semibold text-slate-500 sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Row #</th>
                    <th className="py-2.5 px-3">Test ID</th>
                    <th className="py-2.5 px-3">Scenario</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parseResult.validRows.slice(0, 15).map((row) => (
                    <tr key={row.rowNumber} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{row.rowNumber}</td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">{row.testId}</td>
                      <td className="py-2 px-3 text-slate-800">{row.scenario}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === 'Pass'
                              ? 'bg-emerald-100 text-emerald-800'
                              : row.status === 'Resolved'
                              ? 'bg-cyan-100 text-cyan-800'
                              : row.status === 'Fail'
                              ? 'bg-rose-100 text-rose-800'
                              : row.status === 'Blocked'
                              ? 'bg-amber-100 text-amber-800'
                              : row.status === 'UI Issue'
                              ? 'bg-purple-100 text-purple-800'
                              : row.status === 'Verification'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-emerald-600 font-semibold text-[11px]">Valid</td>
                    </tr>
                  ))}
                  {parseResult.invalidRows.map((row) => (
                    <tr key={row.rowNumber} className="bg-rose-50/50 text-rose-900">
                      <td className="py-2 px-3 font-mono text-[11px] text-rose-500">{row.rowNumber}</td>
                      <td className="py-2 px-3 font-mono font-bold text-rose-900">{row.testId || '[Empty]'}</td>
                      <td className="py-2 px-3">{row.scenario || '[Empty]'}</td>
                      <td className="py-2 px-3">
                        <span className="font-bold">{row.status || '[Empty]'}</span>
                      </td>
                      <td className="py-2 px-3 text-rose-600 text-[11px] font-medium">
                        {row.errors.join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parseResult.validRows.length > 15 && (
              <div className="text-center text-[11px] text-slate-400 mt-2">
                ...and {parseResult.validRows.length - 15} more valid rows will be imported.
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={handleResetForm}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel Import
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={parseResult.validRows.length === 0}
              className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Save {parseResult.validRows.length} Valid Records</span>
            </button>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {importSummary && (
        <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-2xs space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-emerald-900">Test Results Imported Successfully!</h2>
              <p className="text-xs text-emerald-800">
                Test execution records for <span className="font-bold">{screenName}</span> have been saved to the database.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 bg-white/80 rounded-xl border border-emerald-200 text-center text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">New Records Added</span>
              <span className="font-bold text-emerald-700 text-base">{importSummary.imported}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Existing Records Updated</span>
              <span className="font-bold text-blue-700 text-base">{importSummary.updated}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Duplicates Skipped</span>
              <span className="font-bold text-slate-700 text-base">{importSummary.skipped}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              onClick={handleDeleteCurrentBatch}
              className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100/70 border border-rose-300 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="Accidentally uploaded the wrong file? Remove all imported records immediately"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete / Undo This Batch</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleResetForm}
                className="px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/60 rounded-xl transition-colors cursor-pointer"
              >
                Import Another File
              </button>
              <button
                onClick={onImportComplete}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>View Overview Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
