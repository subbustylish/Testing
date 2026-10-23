import {
  TestCaseExecution,
  ExcelImportBatch,
  UserProfile,
  TestStatus,
  EvidenceAttachment,
} from '../types';

const STORAGE_KEYS = {
  TEST_CASES: 'mobile_fixee_test_cases_v3',
  IMPORT_BATCHES: 'mobile_fixee_import_batches_v3',
  CURRENT_USER: 'mobile_fixee_current_user_v3',
  AUTH_SESSION: 'mobile_fixee_auth_session_v3',
};

export const DEFAULT_USER: UserProfile = {
  id: 'usr-admin',
  email: '',
  name: 'admin',
};

// Known legacy mock IDs to purge if detected in browser cache
const LEGACY_DUMMY_IDS = new Set([
  'tc-001', 'tc-002', 'tc-003', 'tc-004', 'tc-005',
  'tc-006', 'tc-007', 'tc-008', 'tc-009', 'tc-010',
  'tc-011', 'tc-012', 'tc-013', 'tc-014', 'tc-015',
]);

class StorageService {
  private listeners: Set<() => void> = new Set();
  private dbConnected: boolean = true;
  private isSyncing: boolean = false;

  constructor() {
    this.purgeLegacyDummyData();
    this.syncWithBackend();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('Storage notify error', err);
      }
    });
  }

  /**
   * Purge any old dummy records from prior sessions
   */
  private purgeLegacyDummyData(): void {
    if (typeof window === 'undefined') return;

    try {
      // Remove any v1/v2 storage keys that had dummy records
      localStorage.removeItem('mobile_fixee_test_cases_v2');
      localStorage.removeItem('mobile_fixee_import_batches_v2');
      localStorage.removeItem('mobile_fixee_test_cases_v1');
      localStorage.removeItem('mobile_fixee_import_batches_v1');

      // Check current v3 store
      const existing = localStorage.getItem(STORAGE_KEYS.TEST_CASES);
      if (existing) {
        const parsed: TestCaseExecution[] = JSON.parse(existing);
        const filtered = parsed.filter(
          (tc) => !LEGACY_DUMMY_IDS.has(tc.id) && tc.projectName !== 'FinPay Mobile'
        );
        if (filtered.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(filtered));
        }
      }

      const existingBatches = localStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
      if (existingBatches) {
        const parsedBatches: ExcelImportBatch[] = JSON.parse(existingBatches);
        const filteredBatches = parsedBatches.filter(
          (b) => !b.id.startsWith('batch-init-') && b.projectName !== 'FinPay Mobile'
        );
        if (filteredBatches.length !== parsedBatches.length) {
          localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(filteredBatches));
        }
      }
    } catch (e) {
      console.warn('Purge error:', e);
    }
  }

  /**
   * Syncs latest live database records from server DB
   */
  public async syncWithBackend(): Promise<void> {
    if (typeof window === 'undefined' || this.isSyncing) return;
    this.isSyncing = true;

    try {
      const [tcRes, batchRes] = await Promise.all([
        fetch('/api/test-cases'),
        fetch('/api/batches'),
      ]);

      if (tcRes.ok && batchRes.ok) {
        const serverTestCases: TestCaseExecution[] = await tcRes.json();
        const serverBatches: ExcelImportBatch[] = await batchRes.json();

        // Filter out any legacy dummy records from server response just in case
        const cleanCases = serverTestCases.filter(
          (tc) => !LEGACY_DUMMY_IDS.has(tc.id) && tc.projectName !== 'FinPay Mobile'
        );
        const cleanBatches = serverBatches.filter(
          (b) => !b.id.startsWith('batch-init-') && b.projectName !== 'FinPay Mobile'
        );

        localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(cleanCases));
        localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(cleanBatches));
        this.dbConnected = true;
        this.notify();
      } else {
        this.dbConnected = false;
      }
    } catch {
      // Backend may be starting or offline, use local storage fallback
      this.dbConnected = false;
    } finally {
      this.isSyncing = false;
    }
  }

  public isConnectedToDb(): boolean {
    return this.dbConnected;
  }

  public isAuthenticated(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.AUTH_SESSION) === 'true';
    } catch {
      return false;
    }
  }

  public login(username: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, 'true');
      localStorage.setItem(
        STORAGE_KEYS.CURRENT_USER,
        JSON.stringify({ id: 'usr-admin', email: '', name: username })
      );
      this.notify();
    } catch (e) {
      console.error(e);
    }
  }

  public logout(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      this.notify();
    } catch (e) {
      console.error(e);
    }
  }

  public getCurrentUser(): UserProfile {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return data ? JSON.parse(data) : DEFAULT_USER;
    } catch {
      return DEFAULT_USER;
    }
  }

  // --- Test Cases Getters ---
  public getTestCases(): TestCaseExecution[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TEST_CASES);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  public getImportBatches(): ExcelImportBatch[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Direct status update from inline dropdown (Pass, Fail, Blocked, Resolved)
   * Note: Resolved is considered as Pass in metrics!
   */
  public async updateTestCaseStatus(
    id: string,
    newStatus: TestStatus,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const list = this.getTestCases();
    const index = list.findIndex((tc) => tc.id === id);
    if (index === -1) {
      return { success: false, error: 'Test execution record not found.' };
    }

    const current = list[index];
    const prevStatus = current.status;
    const user = this.getCurrentUser();
    const timestamp = new Date().toISOString();

    const audit = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      performedBy: user.name,
      action: 'Status Change',
      previousValue: prevStatus,
      newValue: newStatus,
      notes: notes || `Status changed from ${prevStatus} to ${newStatus}`,
    };

    const updated: TestCaseExecution = {
      ...current,
      status: newStatus,
      updatedAt: timestamp,
      history: [...(current.history || []), audit],
    };

    list[index] = updated;
    localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(list));
    this.notify();

    // Persist to server DB
    try {
      fetch(`/api/test-cases/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          notes,
          performedBy: user.name,
        }),
      }).catch((e) => console.warn('Server sync failed:', e));
    } catch {
      // offline fallback
    }

    return { success: true };
  }


  /**
   * Attach mobile screenshot evidence to a specific test case (hits server DB disk + local cache)
   */
  public async attachEvidence(
    testCaseId: string,
    evidence: EvidenceAttachment
  ): Promise<{ success: boolean; error?: string }> {
    const list = this.getTestCases();
    const index = list.findIndex((tc) => tc.id === testCaseId);
    if (index === -1) {
      return { success: false, error: 'Test case not found.' };
    }

    list[index] = {
      ...list[index],
      evidenceScreenshot: evidence,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(list));
    this.notify();

    // Send to server DB to store permanently on server disk
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCaseId,
          name: evidence.name,
          dataUrl: evidence.url,
          size: evidence.size,
          type: evidence.type,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.evidence && data.evidence.url) {
          // If server saved to /api/uploads/..., update local URL
          list[index].evidenceScreenshot = data.evidence;
          localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(list));
          this.notify();
        }
      }
    } catch (err) {
      console.warn('Could not upload evidence to server DB, kept locally:', err);
    }

    return { success: true };
  }

  /**
   * Remove evidence from a test case
   */
  public async removeEvidence(testCaseId: string): Promise<{ success: boolean }> {
    const list = this.getTestCases();
    const index = list.findIndex((tc) => tc.id === testCaseId);
    if (index !== -1) {
      const updated = { ...list[index] };
      delete updated.evidenceScreenshot;
      list[index] = updated;
      localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(list));
      this.notify();
    }

    try {
      fetch(`/api/evidence/${testCaseId}`, { method: 'DELETE' }).catch(() => {});
    } catch {
      // ignore
    }

    return { success: true };
  }

  /**
   * Imports batch of rows into persistent store
   */
  public async importTestCases(params: {
    batchInfo: Omit<ExcelImportBatch, 'id' | 'uploadedAt' | 'summary' | 'status'>;
    rows: Array<{ testId: string; scenario: string; status: TestStatus }>;
    duplicateAction: 'skip' | 'update';
  }): Promise<{
    success: boolean;
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    batchId: string;
    error?: string;
  }> {
    const list = [...this.getTestCases()];
    const timestamp = new Date().toISOString();
    const batchId = `batch-${Date.now()}`;
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    params.rows.forEach((row) => {
      const existingIdx = list.findIndex(
        (tc) =>
          tc.projectName.toLowerCase() === params.batchInfo.projectName.toLowerCase() &&
          tc.applicationName.toLowerCase() === params.batchInfo.applicationName.toLowerCase() &&
          tc.screenName.toLowerCase() === params.batchInfo.screenName.toLowerCase() &&
          (tc.subScreenName || '').toLowerCase() === (params.batchInfo.subScreenName || '').toLowerCase() &&
          tc.testId.toLowerCase() === row.testId.toLowerCase()
      );

      if (existingIdx !== -1) {
        if (params.duplicateAction === 'update') {
          const existing = list[existingIdx];
          list[existingIdx] = {
            ...existing,
            scenario: row.scenario,
            status: row.status,
            subScreenName: params.batchInfo.subScreenName || existing.subScreenName,
            executionDate: new Date().toISOString().slice(0, 10),
            testerName: params.batchInfo.uploader,
            updatedAt: timestamp,
            history: [
              ...(existing.history || []),
              {
                id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp,
                performedBy: params.batchInfo.uploader,
                action: 'Batch Import Update',
                previousValue: existing.status,
                newValue: row.status,
                notes: `Updated via Excel import "${params.batchInfo.filename}"`,
              },
            ],
          };
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        const newRecord: TestCaseExecution = {
          id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          testId: row.testId,
          scenario: row.scenario,
          status: row.status,
          screenName: params.batchInfo.screenName,
          subScreenName: params.batchInfo.subScreenName || undefined,
          projectName: params.batchInfo.projectName,
          applicationName: params.batchInfo.applicationName,
          platform: params.batchInfo.platform,
          buildVersion: params.batchInfo.buildVersion || 'v1.0.0',
          executionDate: new Date().toISOString().slice(0, 10),
          testerName: params.batchInfo.uploader,
          importBatchId: batchId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        list.push(newRecord);
        importedCount++;
      }
    });

    localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(list));

    // Record import batch
    const batches = this.getImportBatches();
    const batchSummary = `Imported ${importedCount} new, updated ${updatedCount}, skipped ${skippedCount} duplicates.`;
    const newBatch: ExcelImportBatch = {
      ...params.batchInfo,
      id: batchId,
      uploadedAt: timestamp,
      summary: batchSummary,
      status: 'Completed',
    };
    batches.unshift(newBatch);
    localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(batches));

    this.notify();

    // Send to Server DB for full persistence
    try {
      fetch('/api/test-cases/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      }).catch((e) => console.warn('Async server import save failed:', e));
    } catch {
      // offline
    }

    return {
      success: true,
      importedCount,
      updatedCount,
      skippedCount,
      batchId,
    };
  }

  // -------------------------------------------------------------
  // DELETION OPERATIONS (for removing irrelevant Excel data)
  // -------------------------------------------------------------

  /**
   * Delete an entire uploaded batch AND all test cases imported with it
   */
  public async deleteBatch(batchId: string): Promise<{ success: boolean; deletedCount: number }> {
    const batches = this.getImportBatches().filter((b) => b.id !== batchId);
    localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(batches));

    const list = this.getTestCases();
    const beforeCount = list.length;
    const remaining = list.filter((tc) => tc.importBatchId !== batchId);
    const deletedCount = beforeCount - remaining.length;
    localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(remaining));

    this.notify();

    // Server DB sync
    try {
      fetch(`/api/batches/${batchId}`, { method: 'DELETE' }).catch(() => {});
    } catch {
      // ignore
    }

    return { success: true, deletedCount };
  }

  /**
   * Delete a single test case
   */
  public async deleteTestCase(testCaseId: string): Promise<{ success: boolean }> {
    const list = this.getTestCases().filter((tc) => tc.id !== testCaseId);
    localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(list));
    this.notify();

    try {
      fetch(`/api/test-cases/${testCaseId}`, { method: 'DELETE' }).catch(() => {});
    } catch {
      // ignore
    }

    return { success: true };
  }

  /**
   * Bulk delete multiple test cases (e.g. user selects irrelevant rows)
   */
  public async bulkDeleteTestCases(
    testCaseIds: string[]
  ): Promise<{ success: boolean; deletedCount: number }> {
    const idSet = new Set(testCaseIds);
    const list = this.getTestCases();
    const beforeCount = list.length;
    const remaining = list.filter((tc) => !idSet.has(tc.id));
    const deletedCount = beforeCount - remaining.length;

    localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(remaining));
    this.notify();

    try {
      fetch('/api/test-cases/delete-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: testCaseIds }),
      }).catch(() => {});
    } catch {
      // ignore
    }

    return { success: true, deletedCount };
  }

  /**
   * Clear all test cases for a specific screen (if wrong screen uploaded)
   */
  public async clearScreenData(
    screenName: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    const list = this.getTestCases();
    const beforeCount = list.length;
    const remaining = list.filter((tc) => tc.screenName !== screenName);
    const deletedCount = beforeCount - remaining.length;

    localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(remaining));
    this.notify();

    try {
      fetch(`/api/test-cases/screen/${encodeURIComponent(screenName)}`, {
        method: 'DELETE',
      }).catch(() => {});
    } catch {
      // ignore
    }

    return { success: true, deletedCount };
  }

  /**
   * Reset all database records to completely clean state
   */
  public async clearAllData(): Promise<{ success: boolean }> {
    localStorage.removeItem(STORAGE_KEYS.TEST_CASES);
    localStorage.removeItem(STORAGE_KEYS.IMPORT_BATCHES);
    this.notify();

    try {
      fetch('/api/clear-all', { method: 'POST' }).catch(() => {});
    } catch {
      // ignore
    }

    return { success: true };
  }

  /**
   * Calculation Rules:
   * - "if it resolved it should be consider as pass" -> Passed count includes Pass and Resolved!
   * - Total = Passed (inc. Resolved) + Failed + Not Run + Blocked
   * - Pass rate = Passed / (Passed + Failed) * 100
   * - Exclude Not Run from pass rate denominator
   * - If no cases have been executed, display N/A
   */
  public calculateMetrics(testCases: TestCaseExecution[]) {
    const rawPass = testCases.filter((tc) => tc.status === 'Pass').length;
    const resolved = testCases.filter((tc) => tc.status === 'Resolved').length;

    // Per user requirement: "if it resolved it should be consider as pass"
    const passed = rawPass + resolved;

    const failed = testCases.filter((tc) => tc.status === 'Fail').length;
    const blocked = testCases.filter((tc) => tc.status === 'Blocked').length;
    const notRun = testCases.filter((tc) => tc.status === 'Not Run').length;
    const uiIssue = testCases.filter((tc) => tc.status === 'UI Issue').length;
    const verification = testCases.filter((tc) => tc.status === 'Verification').length;

    const total = testCases.length;
    const executed = passed + failed; // Excludes Not Run

    let passRateDisplay = 'N/A';
    let passRateNum = 0;

    if (executed > 0) {
      passRateNum = (passed / executed) * 100;
      passRateDisplay = `${passRateNum.toFixed(1)}%`;
    }

    const withEvidenceCount = testCases.filter((tc) => !!tc.evidenceScreenshot).length;

    return {
      total,
      passed, // Includes Pass + Resolved
      rawPass,
      resolved,
      failed,
      blocked,
      notRun,
      uiIssue,
      verification,
      executed,
      passRateNum,
      passRateDisplay,
      withEvidenceCount,
    };
  }
}

export const storageService = new StorageService();
