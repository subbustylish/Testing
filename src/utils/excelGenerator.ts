import * as XLSX from 'xlsx';
import { TestCaseExecution, TestStatus } from '../types';

export interface ParsedRowResult {
  rowNumber: number;
  testId: string;
  scenario: string;
  status: TestStatus | string;
  isValid: boolean;
  errors: string[];
}

export interface ParseExcelResult {
  success: boolean;
  totalRows: number;
  validRows: ParsedRowResult[];
  invalidRows: ParsedRowResult[];
  columnErrors: string[];
  sheetName: string;
}

// Required columns for upload: Test ID, Scenario, Status
export const REQUIRED_COLUMNS = ['Test ID', 'Scenario', 'Status'] as const;
export const TEMPLATE_COLUMNS = ['Test ID', 'Scenario', 'Status'] as const;

/**
 * Escapes formula characters (=, +, -, @) to prevent CSV/Excel formula injection vulnerabilities
 */
export function escapeExcelFormula(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Generates and triggers download of the reference sample Excel file (Test ID, Scenario, Status)
 */
export function downloadSampleExcelWorkbook(filename = 'Sample_Mobile_Test_Results.xlsx'): void {
  const sampleData = [
    {
      'Test ID': 'AUTO-001',
      'Scenario': 'Launch app cold boot and verify splash screen transition',
      'Status': 'Pass',
    },
    {
      'Test ID': 'AUTO-002',
      'Scenario': 'Verify login screen input fields, biometrics prompt, and submit button',
      'Status': 'Pass',
    },
    {
      'Test ID': 'AUTO-003',
      'Scenario': 'Submit invalid login credentials with wrong password',
      'Status': 'Fail',
    },
    {
      'Test ID': 'AUTO-004',
      'Scenario': 'Biometric FaceID / Fingerprint authentication unlocks home dashboard',
      'Status': 'Pass',
    },
    {
      'Test ID': 'AUTO-005',
      'Scenario': 'Password visibility toggle button alignment and font rendering',
      'Status': 'UI Issue',
    },
    {
      'Test ID': 'AUTO-006',
      'Scenario': 'Forgot password SMS verification code countdown timer',
      'Status': 'Verification',
    },
    {
      'Test ID': 'AUTO-007',
      'Scenario': 'App backgrounding and session restore after 3 minutes',
      'Status': 'Not Run',
    },
    {
      'Test ID': 'AUTO-008',
      'Scenario': 'Network loss offline fallback toast and cached balances',
      'Status': 'Resolved',
    },
    {
      'Test ID': 'AUTO-009',
      'Scenario': 'Camera permissions denial handles gracefully',
      'Status': 'Blocked',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData, {
    header: [...TEMPLATE_COLUMNS],
  });

  // Adjust column widths for readability
  worksheet['!cols'] = [
    { wch: 16 }, // Test ID
    { wch: 60 }, // Scenario
    { wch: 18 }, // Status
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Test Results');

  XLSX.writeFile(workbook, filename);
}

/**
 * Parses uploaded ArrayBuffer into row objects with rigorous 3-column validation
 */
export function parseAndValidateExcel(buffer: ArrayBuffer): ParseExcelResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    return {
      success: false,
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      columnErrors: ['Workbook contains no sheets.'],
      sheetName: '',
    };
  }

  const sheetName = sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to array of arrays to inspect headers directly
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawRows.length === 0) {
    return {
      success: false,
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      columnErrors: ['The selected worksheet is completely empty.'],
      sheetName,
    };
  }

  // Find header row (the first row containing candidate matching headers)
  let headerRowIndex = 0;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const candidate = (rawRows[i] || []).map((h) => String(h || '').trim());
    const matchesReq = REQUIRED_COLUMNS.filter((rc) =>
      candidate.some((c) => c.toLowerCase() === rc.toLowerCase())
    );
    if (matchesReq.length >= 2) {
      headerRowIndex = i;
      headers = candidate;
      break;
    }
  }

  if (headers.length === 0 && rawRows.length > 0) {
    headers = (rawRows[0] || []).map((h) => String(h || '').trim());
  }

  // Normalize column matching
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const testIdIdx = headers.findIndex((h) => normalize(h) === 'testid' || normalize(h) === 'id');
  const scenarioIdx = headers.findIndex((h) => normalize(h) === 'scenario' || normalize(h) === 'testcase' || normalize(h) === 'description');
  const statusIdx = headers.findIndex((h) => normalize(h) === 'status' || normalize(h) === 'executionstatus' || normalize(h) === 'result');

  const columnErrors: string[] = [];
  if (testIdIdx === -1) columnErrors.push('Missing required column: "Test ID"');
  if (scenarioIdx === -1) columnErrors.push('Missing required column: "Scenario"');
  if (statusIdx === -1) columnErrors.push('Missing required column: "Status"');

  if (columnErrors.length > 0) {
    return {
      success: false,
      totalRows: 0,
      validRows: [],
      invalidRows: [],
      columnErrors,
      sheetName,
    };
  }

  const validRows: ParsedRowResult[] = [];
  const invalidRows: ParsedRowResult[] = [];

  const dataRows = rawRows.slice(headerRowIndex + 1);

  dataRows.forEach((row, idx) => {
    const rowNumber = headerRowIndex + 2 + idx; // 1-based index in Excel

    const testId = String(row[testIdIdx] ?? '').trim();
    const scenario = String(row[scenarioIdx] ?? '').trim();
    const rawStatus = String(row[statusIdx] ?? '').trim();

    // Skip blank trailing rows
    if (!testId && !scenario && !rawStatus) {
      return;
    }

    const errors: string[] = [];

    if (!testId) {
      errors.push('Test ID cannot be empty');
    }

    if (!scenario) {
      errors.push('Scenario cannot be empty');
    }

    // Normalize Status (Pass, Fail, Blocked, Resolved, Not Run, UI Issue, Verification)
    let matchedStatus: TestStatus | null = null;
    const lowerStatus = rawStatus.toLowerCase().trim();
    const cleanStatus = lowerStatus.replace(/[^a-z0-9]/g, '');

    if (lowerStatus === 'pass' || lowerStatus === 'passed' || lowerStatus === 'p') {
      matchedStatus = 'Pass';
    } else if (lowerStatus === 'fail' || lowerStatus === 'failed' || lowerStatus === 'f') {
      matchedStatus = 'Fail';
    } else if (lowerStatus === 'resolved' || lowerStatus === 'resolve' || lowerStatus === 'fixed') {
      matchedStatus = 'Resolved';
    } else if (lowerStatus === 'blocked' || lowerStatus === 'block') {
      matchedStatus = 'Blocked';
    } else if (
      lowerStatus === 'not run' ||
      cleanStatus === 'notrun' ||
      lowerStatus === 'pending' ||
      lowerStatus === 'unexecuted'
    ) {
      matchedStatus = 'Not Run';
    } else if (
      lowerStatus === 'ui issue' ||
      cleanStatus === 'uiissue' ||
      lowerStatus === 'ui defect' ||
      lowerStatus === 'ui error' ||
      lowerStatus === 'ui problem'
    ) {
      matchedStatus = 'UI Issue';
    } else if (
      lowerStatus === 'verification' ||
      cleanStatus === 'verification' ||
      lowerStatus === 'verify' ||
      lowerStatus === 'verified' ||
      lowerStatus === 'verif' ||
      cleanStatus === 'reverification'
    ) {
      matchedStatus = 'Verification';
    } else {
      errors.push(`Invalid Status "${rawStatus}". Must be "Pass", "Fail", "Blocked", "Resolved", "Not Run", "UI Issue", or "Verification".`);
    }

    const rowObj: ParsedRowResult = {
      rowNumber,
      testId,
      scenario,
      status: matchedStatus || rawStatus,
      isValid: errors.length === 0,
      errors,
    };

    if (rowObj.isValid) {
      validRows.push(rowObj);
    } else {
      invalidRows.push(rowObj);
    }
  });

  return {
    success: columnErrors.length === 0,
    totalRows: validRows.length + invalidRows.length,
    validRows,
    invalidRows,
    columnErrors,
    sheetName,
  };
}

/**
 * Downloads an Excel report of rows that failed validation
 */
export function downloadValidationErrorReport(invalidRows: ParsedRowResult[]): void {
  const exportData = invalidRows.map((r) => ({
    'Excel Row #': r.rowNumber,
    'Test ID': escapeExcelFormula(r.testId),
    'Scenario': escapeExcelFormula(r.scenario),
    'Status In File': escapeExcelFormula(r.status),
    'Validation Errors': r.errors.join('; '),
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Validation Errors');
}

/**
 * General Export to Excel utility
 */
export function exportToExcel(sheets: { sheetName: string; data: Record<string, unknown>[] }[], filename: string): void {
  const workbook = XLSX.utils.book_new();

  sheets.forEach(({ sheetName, data }) => {
    // Escape formula characters on all string fields
    const sanitized = data.map((row) => {
      const cleanRow: Record<string, unknown> = {};
      Object.keys(row).forEach((k) => {
        const val = row[k];
        if (typeof val === 'string') {
          cleanRow[k] = escapeExcelFormula(val);
        } else {
          cleanRow[k] = val;
        }
      });
      return cleanRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(sanitized);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
