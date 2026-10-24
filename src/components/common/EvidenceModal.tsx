import React, { useState } from 'react';
import { TestCaseExecution, EvidenceAttachment } from '../../types';
import { storageService } from '../../services/storage';
import { X, Upload, Trash2, Camera, Smartphone, CheckCircle2, ShieldAlert } from 'lucide-react';

import { compressScreenshot } from '../../utils/imageCompressor';

interface EvidenceModalProps {
  testCase: TestCaseExecution;
  onClose: () => void;
  onSuccess: () => void;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  testCase,
  onClose,
  onSuccess,
}) => {
  const [evidence, setEvidence] = useState<EvidenceAttachment | undefined>(
    testCase.evidenceScreenshot
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid attachment format. Please upload a PNG, JPEG, or WEBP mobile screenshot.');
      return;
    }

    // Limit raw upload to 15MB
    const maxSizeBytes = 15 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError('Screenshot exceeds maximum allowed size of 15 MB.');
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      // Fast client-side optimization: shrinks 3MB-5MB full-res mobile screenshot to crisp ~60KB-120KB in milliseconds
      const { dataUrl, size } = await compressScreenshot(file, 1080, 1920, 0.82);

      const newEvidence: EvidenceAttachment = {
        name: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
        url: dataUrl,
        size,
        type: 'image/jpeg',
        uploadedAt: new Date().toISOString(),
      };

      setEvidence(newEvidence);

      // Save directly to cloud database
      await storageService.attachEvidence(testCase.id, newEvidence);
      onSuccess();
    } catch (err) {
      console.error(err);
      setError('Failed to process and save screenshot. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveEvidence = async () => {
    setIsSaving(true);
    await storageService.removeEvidence(testCase.id);
    setEvidence(undefined);
    setIsSaving(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {testCase.testId}
                </span>
                <span className="text-[11px] font-semibold text-slate-500">{testCase.screenName}</span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {testCase.status}
                </span>
              </div>
              <h2 className="text-sm font-bold text-slate-900 mt-0.5">Mobile Screenshot Evidence</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 shrink-0">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
            <span className="font-semibold text-slate-600 block mb-1">Scenario:</span>
            <p className="font-medium text-slate-800">{testCase.scenario}</p>
          </div>

          {evidence ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Evidence Uploaded</span>
                </span>
                <button
                  onClick={handleRemoveEvidence}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 p-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Evidence</span>
                </button>
              </div>

              <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 flex justify-center overflow-hidden">
                <img
                  src={evidence.url}
                  alt={evidence.name}
                  className="max-h-80 object-contain rounded-lg shadow-lg"
                />
              </div>

              <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                <span>{evidence.name}</span>
                <span>{(evidence.size / 1024).toFixed(1)} KB • {new Date(evidence.uploadedAt).toLocaleDateString()}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-slate-800">
                  Upload Mobile Screenshot Evidence
                </span>
                <span className="text-xs text-slate-400 mt-1 max-w-xs">
                  Attach phone screenshot (PNG, JPEG, WEBP - Max 5MB) verifying the mobile screen execution.
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0 mt-4">
          <div>
            {isSaving && (
              <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Saving to database...</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
