export type TestStatus = 'Pass' | 'Fail' | 'Blocked' | 'Resolved' | 'Not Run' | 'UI Issue' | 'Verification';

export interface AuditRecord {
  id: string;
  timestamp: string;
  performedBy: string;
  action: string;
  previousValue?: string;
  newValue?: string;
  notes?: string;
}

export interface EvidenceAttachment {
  name: string;
  url: string; // Base64 image data URL
  size: number;
  type: string;
  uploadedAt: string;
}

export interface TestCaseExecution {
  id: string;
  testId: string;
  scenario: string;
  status: TestStatus;
  screenName: string;
  subScreenName?: string;
  projectName: string;
  applicationName: string;
  platform: 'Android' | 'iOS' | 'Both';
  buildVersion: string;
  executionDate: string;
  testerName: string;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
  evidenceScreenshot?: EvidenceAttachment;
  history?: AuditRecord[];
}

export interface ExcelImportBatch {
  id: string;
  filename: string;
  uploadedAt: string;
  uploader: string;
  projectName: string;
  applicationName: string;
  buildVersion: string;
  screenName: string;
  subScreenName?: string;
  platform: 'Android' | 'iOS' | 'Both';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicatesDetected: number;
  summary: string;
  status: 'Completed' | 'Partially Completed' | 'Failed';
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
}
