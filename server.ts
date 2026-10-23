import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware for parsing large JSON payloads (screenshots can be up to 10MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories for persistent storage
const DATA_DIR = path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_FILE = path.resolve(DATA_DIR, 'database.json');

// Ensure persistent storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface DatabaseSchema {
  testCases: any[];
  batches: any[];
  updatedAt: string;
}

// Initial DB template (no dummy data)
const initialDb: DatabaseSchema = {
  testCases: [],
  batches: [],
  updatedAt: new Date().toISOString(),
};

function readDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
      return initialDb;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      testCases: Array.isArray(parsed.testCases) ? parsed.testCases : [],
      batches: Array.isArray(parsed.batches) ? parsed.batches : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch (err) {
    console.error('Error reading database file:', err);
    return initialDb;
  }
}

function writeDb(data: DatabaseSchema): void {
  try {
    data.updatedAt = new Date().toISOString();
    // Atomic write via temp file
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Error writing database file:', err);
  }
}

// Ensure database file is initialized
readDb();

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// Serve uploaded screenshot files permanently
app.use('/api/uploads', express.static(UPLOADS_DIR));

// DB Health & Status
app.get('/api/status', (_req, res) => {
  const db = readDb();
  res.json({
    status: 'connected',
    persisted: true,
    totalTestCases: db.testCases.length,
    totalBatches: db.batches.length,
    storageLocation: DB_FILE,
    lastUpdated: db.updatedAt,
  });
});

// Get all test cases
app.get('/api/test-cases', (_req, res) => {
  const db = readDb();
  res.json(db.testCases);
});

// Import / Save test cases & batch
app.post('/api/test-cases/import', (req, res) => {
  try {
    const { batchInfo, rows, duplicateAction } = req.body;
    if (!batchInfo || !rows || !Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'Invalid payload structure' });
    }

    const db = readDb();
    const list = [...db.testCases];
    const timestamp = new Date().toISOString();
    const batchId = `batch-${Date.now()}`;
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    rows.forEach((row: any) => {
      const existingIdx = list.findIndex(
        (tc) =>
          (tc.projectName || '').toLowerCase() === (batchInfo.projectName || '').toLowerCase() &&
          (tc.applicationName || '').toLowerCase() === (batchInfo.applicationName || '').toLowerCase() &&
          (tc.screenName || '').toLowerCase() === (batchInfo.screenName || '').toLowerCase() &&
          (tc.subScreenName || '').toLowerCase() === (batchInfo.subScreenName || '').toLowerCase() &&
          (tc.testId || '').toLowerCase() === (row.testId || '').toLowerCase()
      );

      if (existingIdx !== -1) {
        if (duplicateAction === 'update') {
          const existing = list[existingIdx];
          list[existingIdx] = {
            ...existing,
            scenario: row.scenario,
            status: row.status,
            subScreenName: batchInfo.subScreenName || existing.subScreenName,
            executionDate: new Date().toISOString().slice(0, 10),
            testerName: batchInfo.uploader,
            updatedAt: timestamp,
            history: [
              ...(existing.history || []),
              {
                id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp,
                performedBy: batchInfo.uploader,
                action: 'Batch Import Update',
                previousValue: existing.status,
                newValue: row.status,
                notes: `Updated via Excel import "${batchInfo.filename}"`,
              },
            ],
          };
          updatedCount++;
        } else {
          skippedCount++;
        }
      } else {
        const newRecord = {
          id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          testId: row.testId,
          scenario: row.scenario,
          status: row.status,
          screenName: batchInfo.screenName,
          subScreenName: batchInfo.subScreenName || undefined,
          projectName: batchInfo.projectName,
          applicationName: batchInfo.applicationName,
          platform: batchInfo.platform || 'Android',
          buildVersion: batchInfo.buildVersion || 'v1.0.0',
          executionDate: new Date().toISOString().slice(0, 10),
          testerName: batchInfo.uploader,
          importBatchId: batchId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        list.push(newRecord);
        importedCount++;
      }
    });

    // Record batch
    const newBatch = {
      ...batchInfo,
      id: batchId,
      uploadedAt: timestamp,
      summary: `Imported ${importedCount} new, updated ${updatedCount}, skipped ${skippedCount} duplicates.`,
      status: 'Completed',
    };

    const batches = [newBatch, ...db.batches];
    writeDb({ testCases: list, batches, updatedAt: timestamp });

    return res.json({
      success: true,
      importedCount,
      updatedCount,
      skippedCount,
      batchId,
      testCases: list,
      batches,
    });
  } catch (err: any) {
    console.error('Import error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error during import' });
  }
});

// Update single test case status
app.put('/api/test-cases/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, notes, performedBy } = req.body;

  const db = readDb();
  const index = db.testCases.findIndex((tc) => tc.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Test case not found' });
  }

  const current = db.testCases[index];
  const prevStatus = current.status;
  const timestamp = new Date().toISOString();

  const audit = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp,
    performedBy: performedBy || 'admin',
    action: 'Status Change',
    previousValue: prevStatus,
    newValue: status,
    notes: notes || `Status changed from ${prevStatus} to ${status}`,
  };

  db.testCases[index] = {
    ...current,
    status,
    updatedAt: timestamp,
    history: [...(current.history || []), audit],
  };

  writeDb(db);
  return res.json({ success: true, testCase: db.testCases[index] });
});

// Helper to delete evidence file from disk
function deleteEvidenceFile(evidence: any) {
  if (evidence && typeof evidence.url === 'string' && evidence.url.startsWith('/api/uploads/')) {
    const filename = path.basename(evidence.url);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error deleting screenshot file from disk:', err);
      }
    }
  }
}

// Delete a single test case
app.delete('/api/test-cases/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const target = db.testCases.find((tc) => tc.id === id);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Test case not found' });
  }

  // Delete attached screenshot if any
  deleteEvidenceFile(target.evidenceScreenshot);

  db.testCases = db.testCases.filter((tc) => tc.id !== id);
  writeDb(db);
  return res.json({ success: true, deletedId: id });
});

// Bulk delete test cases
app.post('/api/test-cases/delete-multiple', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, error: 'Ids array is required' });
  }

  const db = readDb();
  const idSet = new Set(ids);
  const targets = db.testCases.filter((tc) => idSet.has(tc.id));
  targets.forEach((tc) => deleteEvidenceFile(tc.evidenceScreenshot));

  const beforeCount = db.testCases.length;
  db.testCases = db.testCases.filter((tc) => !idSet.has(tc.id));
  const deletedCount = beforeCount - db.testCases.length;

  writeDb(db);
  return res.json({ success: true, deletedCount });
});

// Delete all test cases for a specific screen
app.delete('/api/test-cases/screen/:screenName', (req, res) => {
  const { screenName } = req.params;
  const db = readDb();
  const decoded = decodeURIComponent(screenName);
  const targets = db.testCases.filter((tc) => tc.screenName === decoded);
  targets.forEach((tc) => deleteEvidenceFile(tc.evidenceScreenshot));

  const beforeCount = db.testCases.length;
  db.testCases = db.testCases.filter((tc) => tc.screenName !== decoded);
  const deletedCount = beforeCount - db.testCases.length;

  writeDb(db);
  return res.json({ success: true, deletedCount });
});

// Get all import batches
app.get('/api/batches', (_req, res) => {
  const db = readDb();
  res.json(db.batches);
});

// Delete an entire upload batch AND all its associated test cases
app.delete('/api/batches/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const batchIdx = db.batches.findIndex((b) => b.id === id);
  if (batchIdx === -1) {
    return res.status(404).json({ success: false, error: 'Batch not found' });
  }

  const batch = db.batches[batchIdx];
  db.batches.splice(batchIdx, 1);

  // Delete all test cases and screenshot files associated with this batch
  const batchCases = db.testCases.filter((tc) => tc.importBatchId === id);
  batchCases.forEach((tc) => deleteEvidenceFile(tc.evidenceScreenshot));

  const beforeCount = db.testCases.length;
  db.testCases = db.testCases.filter((tc) => tc.importBatchId !== id);
  const deletedTestCases = beforeCount - db.testCases.length;

  writeDb(db);
  return res.json({
    success: true,
    deletedBatchId: id,
    deletedTestCases,
    batchFilename: batch.filename,
  });
});

// Attach mobile screenshot evidence (stored on server disk + DB)
app.post('/api/evidence', (req, res) => {
  try {
    const { testCaseId, name, dataUrl, size, type } = req.body;
    if (!testCaseId || !dataUrl) {
      return res.status(400).json({ success: false, error: 'testCaseId and dataUrl are required' });
    }

    const db = readDb();
    const index = db.testCases.findIndex((tc) => tc.id === testCaseId);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Test case not found' });
    }

    // If an existing evidence screenshot file exists, delete the old file first
    deleteEvidenceFile(db.testCases[index].evidenceScreenshot);

    let fileUrl = dataUrl;
    // If it's a data URL, save file to disk
    if (dataUrl.startsWith('data:image/')) {
      const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const ext = matches[1].split('/')[1] || 'png';
        const safeName = (name || 'screenshot').replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `${testCaseId}_${Date.now()}_${safeName}.${ext}`;
        const filePath = path.join(UPLOADS_DIR, filename);
        const buffer = Buffer.from(matches[2], 'base64');
        fs.writeFileSync(filePath, buffer);
        fileUrl = `/api/uploads/${filename}`;
      }
    }

    const evidence = {
      name: name || 'screenshot.png',
      url: fileUrl,
      size: size || 0,
      type: type || 'image/png',
      uploadedAt: new Date().toISOString(),
    };

    db.testCases[index] = {
      ...db.testCases[index],
      evidenceScreenshot: evidence,
      updatedAt: new Date().toISOString(),
    };

    writeDb(db);
    return res.json({ success: true, evidence, testCase: db.testCases[index] });
  } catch (err: any) {
    console.error('Save evidence error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Error saving evidence' });
  }
});

// Remove evidence from a test case (deletes from disk and removes from DB)
app.delete('/api/evidence/:testCaseId', (req, res) => {
  const { testCaseId } = req.params;
  const db = readDb();
  const index = db.testCases.findIndex((tc) => tc.id === testCaseId);
  if (index !== -1) {
    const updated = { ...db.testCases[index] };
    deleteEvidenceFile(updated.evidenceScreenshot);
    delete updated.evidenceScreenshot;
    db.testCases[index] = updated;
    writeDb(db);
  }
  return res.json({ success: true });
});

// Clear all database records (complete reset - clears DB and all uploaded files)
app.post('/api/clear-all', (_req, res) => {
  try {
    if (fs.existsSync(UPLOADS_DIR)) {
      const files = fs.readdirSync(UPLOADS_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, file));
        } catch (e) {
          console.error('Error removing upload file on clear-all:', e);
        }
      }
    }
  } catch (err) {
    console.error('Error reading uploads dir on clear-all:', err);
  }

  writeDb({ testCases: [], batches: [], updatedAt: new Date().toISOString() });
  return res.json({ success: true, message: 'All database records and uploads cleared successfully' });
});

// -------------------------------------------------------------
// VITE / STATIC SERVING
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    // Production: serve built static files from dist
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    // Development: integrate Vite in middleware mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Mobile Fixee QA] Server running with persistent DB on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
