import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  query,
  where,
  deleteField,
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from './firebase';
import {
  TestCaseExecution,
  ExcelImportBatch,
  UserProfile,
  TestStatus,
  EvidenceAttachment,
} from '../types';

const STORAGE_KEYS = {
  TEST_CASES: 'mobile_fixee_test_cases_v4',
  IMPORT_BATCHES: 'mobile_fixee_import_batches_v4',
  CURRENT_USER: 'mobile_fixee_current_user_v4',
  AUTH_SESSION: 'mobile_fixee_auth_session_v4',
};

export const DEFAULT_USER: UserProfile = {
  id: 'usr-admin',
  email: '',
  name: 'admin',
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore notice:', JSON.stringify(errInfo));
}

class StorageService {
  private listeners: Set<() => void> = new Set();
  private dbConnected: boolean = true;
  private memoryTestCases: TestCaseExecution[] = [];
  private memoryBatches: ExcelImportBatch[] = [];
  private unsubscribeCases?: () => void;
  private unsubscribeBatches?: () => void;

  constructor() {
    this.loadFromLocal();
    this.initFirestoreListeners();
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

  private loadFromLocal(): void {
    if (typeof window === 'undefined') return;
    try {
      const tcRaw = localStorage.getItem(STORAGE_KEYS.TEST_CASES);
      if (tcRaw) {
        this.memoryTestCases = JSON.parse(tcRaw);
      }
      const bRaw = localStorage.getItem(STORAGE_KEYS.IMPORT_BATCHES);
      if (bRaw) {
        this.memoryBatches = JSON.parse(bRaw);
      }
    } catch (e) {
      console.warn('Error loading local cache:', e);
    }
  }

  private saveToLocal(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.TEST_CASES, JSON.stringify(this.memoryTestCases));
      localStorage.setItem(STORAGE_KEYS.IMPORT_BATCHES, JSON.stringify(this.memoryBatches));
    } catch (e) {
      console.warn('Error saving local cache:', e);
    }
  }

  /**
   * Connects real-time Firestore listeners for multi-device sync
   */
  private initFirestoreListeners(): void {
    try {
      // 1. Test Cases Live Listener
      const tcRef = collection(db, 'testCases');
      this.unsubscribeCases = onSnapshot(
        tcRef,
        (snapshot) => {
          const list: TestCaseExecution[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as TestCaseExecution;
            list.push({ ...data, id: docSnap.id });
          });
          this.memoryTestCases = list;
          this.saveToLocal();
          this.dbConnected = true;
          this.notify();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'testCases');
          this.dbConnected = false;
        }
      );

      // 2. Import Batches Live Listener
      const bRef = collection(db, 'importBatches');
      this.unsubscribeBatches = onSnapshot(
        bRef,
        (snapshot) => {
          const batches: ExcelImportBatch[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as ExcelImportBatch;
            batches.push({ ...data, id: docSnap.id });
          });
          // Sort by uploadedAt descending
          batches.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
          this.memoryBatches = batches;
          this.saveToLocal();
          this.notify();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'importBatches');
        }
      );
    } catch (err) {
      console.warn('Firestore listener setup fallback:', err);
    }
  }

  /**
   * Check if this browser has test cases in local storage from prior sessions
   */
  public getRecoverableLocalCount(): number {
    if (typeof window === 'undefined') return 0;
    const candidateKeys = [
      'mobile_fixee_test_cases_v3',
      'mobile_fixee_test_cases_v2',
      'mobile_fixee_test_cases_v1',
    ];
    let count = 0;
    for (const key of candidateKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) count += parsed.length;
        }
      } catch {}
    }
    return count;
  }

  /**
   * Scans local browser memory for previous uploads and syncs them directly into Cloud Firestore
   */
  public async recoverPreviousLocalUploads(): Promise<{ recoveredCount: number }> {
    if (typeof window === 'undefined') return { recoveredCount: 0 };

    const candidateKeys = [
      'mobile_fixee_test_cases_v3',
      'mobile_fixee_test_cases_v2',
      'mobile_fixee_test_cases_v1',
      'mobile_fixee_test_cases_v4',
    ];

    const foundCases: TestCaseExecution[] = [];
    for (const key of candidateKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed: TestCaseExecution[] = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach((tc) => {
              if (
                tc.testId &&
                tc.scenario &&
                !foundCases.some(
                  (c) => c.id === tc.id || (c.testId === tc.testId && c.screenName === tc.screenName)
                )
              ) {
                foundCases.push(tc);
              }
            });
          }
        }
      } catch (e) {
        console.warn('Error reading key', key, e);
      }
    }

    if (foundCases.length === 0) return { recoveredCount: 0 };

    const candidateBatchKeys = [
      'mobile_fixee_import_batches_v3',
      'mobile_fixee_import_batches_v2',
      'mobile_fixee_import_batches_v4',
    ];
    const foundBatches: ExcelImportBatch[] = [];
    for (const bKey of candidateBatchKeys) {
      try {
        const raw = localStorage.getItem(bKey);
        if (raw) {
          const parsed: ExcelImportBatch[] = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((b) => {
              if (b.id && !foundBatches.some((existing) => existing.id === b.id)) {
                foundBatches.push(b);
              }
            });
          }
        }
      } catch (e) {
        console.warn('Error checking batch key', bKey, e);
      }
    }

    // Persist into Firebase Cloud Firestore
    try {
      const chunkSize = 200;
      for (let i = 0; i < foundCases.length; i += chunkSize) {
        const chunk = foundCases.slice(i, i + chunkSize);
        const fbBatch = writeBatch(db);
        chunk.forEach((tc) => {
          fbBatch.set(doc(db, 'testCases', tc.id), tc);
        });
        await fbBatch.commit();
      }

      for (const b of foundBatches) {
        await setDoc(doc(db, 'importBatches', b.id), b);
      }

      this.memoryTestCases = foundCases;
      this.memoryBatches = foundBatches;
      this.saveToLocal();
      this.notify();
    } catch (err) {
      console.error('Failed to sync recovered cases to Firestore:', err);
    }

    return { recoveredCount: foundCases.length };
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

  public getTestCases(): TestCaseExecution[] {
    return this.memoryTestCases;
  }

  public getImportBatches(): ExcelImportBatch[] {
    return this.memoryBatches;
  }

  /**
   * Direct status update from inline dropdown (Pass, Fail, Blocked, Resolved, etc.)
   */
  public async updateTestCaseStatus(
    id: string,
    newStatus: TestStatus,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const index = this.memoryTestCases.findIndex((tc) => tc.id === id);
    if (index === -1) {
      return { success: false, error: 'Test execution record not found.' };
    }

    const current = this.memoryTestCases[index];
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

    // Update locally for instant responsiveness
    this.memoryTestCases[index] = updated;
    this.saveToLocal();
    this.notify();

    // Persist to Cloud Firestore
    try {
      await setDoc(doc(db, 'testCases', id), updated);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `testCases/${id}`);
    }

    return { success: true };
  }

  /**
   * Attach mobile screenshot evidence to a test case (Uploads to Cloud Storage + Firestore)
   */
  public async attachEvidence(
    testCaseId: string,
    evidence: EvidenceAttachment
  ): Promise<{ success: boolean; error?: string }> {
    const index = this.memoryTestCases.findIndex((tc) => tc.id === testCaseId);
    if (index === -1) {
      return { success: false, error: 'Test case not found.' };
    }

    let finalUrl = evidence.url;

    // If it's a base64 data URL, attempt upload to Firebase Cloud Storage for permanent public URL
    if (evidence.url.startsWith('data:')) {
      try {
        const fileExt = evidence.type?.includes('png') ? 'png' : 'jpg';
        const fileRef = ref(storage, `evidence/${testCaseId}_${Date.now()}.${fileExt}`);
        await uploadString(fileRef, evidence.url, 'data_url');
        finalUrl = await getDownloadURL(fileRef);
      } catch (uploadErr) {
        console.warn('Firebase Storage direct upload skipped, retaining inline storage:', uploadErr);
        // Retain inline data URL if storage upload is constrained
      }
    }

    const updatedEvidence: EvidenceAttachment = {
      ...evidence,
      url: finalUrl,
    };

    const updatedTc: TestCaseExecution = {
      ...this.memoryTestCases[index],
      evidenceScreenshot: updatedEvidence,
      updatedAt: new Date().toISOString(),
    };

    this.memoryTestCases[index] = updatedTc;
    this.saveToLocal();
    this.notify();

    try {
      await setDoc(doc(db, 'testCases', testCaseId), updatedTc, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `testCases/${testCaseId}`);
    }

    return { success: true };
  }

  /**
   * Remove evidence from a test case
   */
  public async removeEvidence(testCaseId: string): Promise<{ success: boolean }> {
    const index = this.memoryTestCases.findIndex((tc) => tc.id === testCaseId);
    if (index !== -1) {
      const updated = { ...this.memoryTestCases[index] };
      delete updated.evidenceScreenshot;
      this.memoryTestCases[index] = updated;
      this.saveToLocal();
      this.notify();
    }

    try {
      await updateDoc(doc(db, 'testCases', testCaseId), {
        evidenceScreenshot: deleteField(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `testCases/${testCaseId}`);
    }

    return { success: true };
  }

  /**
   * Imports batch of rows into persistent cloud store
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
    const timestamp = new Date().toISOString();
    const batchId = `batch-${Date.now()}`;
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const casesToSave: TestCaseExecution[] = [];

    params.rows.forEach((row) => {
      const existingIdx = this.memoryTestCases.findIndex(
        (tc) =>
          tc.screenName.toLowerCase() === params.batchInfo.screenName.toLowerCase() &&
          (tc.subScreenName || '').toLowerCase() === (params.batchInfo.subScreenName || '').toLowerCase() &&
          tc.testId.toLowerCase() === row.testId.toLowerCase()
      );

      if (existingIdx !== -1) {
        if (params.duplicateAction === 'update') {
          const existing = this.memoryTestCases[existingIdx];
          const updated: TestCaseExecution = {
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
          this.memoryTestCases[existingIdx] = updated;
          casesToSave.push(updated);
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
          projectName: '',
          applicationName: '',
          platform: params.batchInfo.platform,
          buildVersion: params.batchInfo.buildVersion || 'v1.0.0',
          executionDate: new Date().toISOString().slice(0, 10),
          testerName: params.batchInfo.uploader,
          importBatchId: batchId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        this.memoryTestCases.push(newRecord);
        casesToSave.push(newRecord);
        importedCount++;
      }
    });

    const batchSummary = `Imported ${importedCount} new, updated ${updatedCount}, skipped ${skippedCount} duplicates.`;
    const newBatch: ExcelImportBatch = {
      ...params.batchInfo,
      id: batchId,
      uploadedAt: timestamp,
      summary: batchSummary,
      status: 'Completed',
    };
    this.memoryBatches.unshift(newBatch);

    this.saveToLocal();
    this.notify();

    // Persist batch and test cases to Cloud Firestore in chunks
    try {
      await setDoc(doc(db, 'importBatches', batchId), newBatch);

      const chunkSize = 200;
      for (let i = 0; i < casesToSave.length; i += chunkSize) {
        const chunk = casesToSave.slice(i, i + chunkSize);
        const fbBatch = writeBatch(db);
        chunk.forEach((tc) => {
          fbBatch.set(doc(db, 'testCases', tc.id), tc);
        });
        await fbBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'testCases');
    }

    return {
      success: true,
      importedCount,
      updatedCount,
      skippedCount,
      batchId,
    };
  }

  /**
   * Delete an entire uploaded batch AND all test cases imported with it
   */
  public async deleteBatch(batchId: string): Promise<{ success: boolean; deletedCount: number }> {
    this.memoryBatches = this.memoryBatches.filter((b) => b.id !== batchId);
    const beforeCount = this.memoryTestCases.length;
    const toDelete = this.memoryTestCases.filter((tc) => tc.importBatchId === batchId);
    this.memoryTestCases = this.memoryTestCases.filter((tc) => tc.importBatchId !== batchId);
    const deletedCount = beforeCount - this.memoryTestCases.length;

    this.saveToLocal();
    this.notify();

    try {
      await deleteDoc(doc(db, 'importBatches', batchId));

      const chunkSize = 200;
      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        const fbBatch = writeBatch(db);
        chunk.forEach((tc) => {
          fbBatch.delete(doc(db, 'testCases', tc.id));
        });
        await fbBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `importBatches/${batchId}`);
    }

    return { success: true, deletedCount };
  }

  /**
   * Delete a single test case
   */
  public async deleteTestCase(testCaseId: string): Promise<{ success: boolean }> {
    this.memoryTestCases = this.memoryTestCases.filter((tc) => tc.id !== testCaseId);
    this.saveToLocal();
    this.notify();

    try {
      await deleteDoc(doc(db, 'testCases', testCaseId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `testCases/${testCaseId}`);
    }

    return { success: true };
  }

  /**
   * Bulk delete multiple test cases
   */
  public async bulkDeleteTestCases(
    testCaseIds: string[]
  ): Promise<{ success: boolean; deletedCount: number }> {
    const idSet = new Set(testCaseIds);
    const beforeCount = this.memoryTestCases.length;
    this.memoryTestCases = this.memoryTestCases.filter((tc) => !idSet.has(tc.id));
    const deletedCount = beforeCount - this.memoryTestCases.length;

    this.saveToLocal();
    this.notify();

    try {
      const chunkSize = 200;
      for (let i = 0; i < testCaseIds.length; i += chunkSize) {
        const chunk = testCaseIds.slice(i, i + chunkSize);
        const fbBatch = writeBatch(db);
        chunk.forEach((id) => {
          fbBatch.delete(doc(db, 'testCases', id));
        });
        await fbBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'testCases');
    }

    return { success: true, deletedCount };
  }

  /**
   * Clear all test cases for a specific screen
   */
  public async clearScreenData(
    screenName: string
  ): Promise<{ success: boolean; deletedCount: number }> {
    const beforeCount = this.memoryTestCases.length;
    const toDelete = this.memoryTestCases.filter((tc) => tc.screenName === screenName);
    this.memoryTestCases = this.memoryTestCases.filter((tc) => tc.screenName !== screenName);
    const deletedCount = beforeCount - this.memoryTestCases.length;

    this.saveToLocal();
    this.notify();

    try {
      const chunkSize = 200;
      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        const fbBatch = writeBatch(db);
        chunk.forEach((tc) => {
          fbBatch.delete(doc(db, 'testCases', tc.id));
        });
        await fbBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'testCases');
    }

    return { success: true, deletedCount };
  }

  /**
   * Reset all database records across the team
   */
  public async clearAllData(): Promise<{ success: boolean }> {
    const casesToDelete = [...this.memoryTestCases];
    const batchesToDelete = [...this.memoryBatches];

    this.memoryTestCases = [];
    this.memoryBatches = [];
    this.saveToLocal();
    this.notify();

    try {
      const chunkSize = 200;
      for (let i = 0; i < casesToDelete.length; i += chunkSize) {
        const chunk = casesToDelete.slice(i, i + chunkSize);
        const fbBatch = writeBatch(db);
        chunk.forEach((tc) => {
          fbBatch.delete(doc(db, 'testCases', tc.id));
        });
        await fbBatch.commit();
      }

      for (let i = 0; i < batchesToDelete.length; i += chunkSize) {
        const chunk = batchesToDelete.slice(i, i + chunkSize);
        const fbBatch = writeBatch(db);
        chunk.forEach((b) => {
          fbBatch.delete(doc(db, 'importBatches', b.id));
        });
        await fbBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'all');
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
