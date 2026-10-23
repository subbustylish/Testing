import React, { useState } from 'react';
import { Smartphone, Lock, User, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';

interface LoginFormProps {
  onLoginSuccess: (username: string) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Validate credentials: username === 'admin' and password === 'admin@123'
    setTimeout(() => {
      if (username.trim().toLowerCase() === 'admin' && password === 'admin@123') {
        onLoginSuccess('admin');
      } else {
        setError('Invalid username or password.');
        setIsLoading(false);
      }
    }, 300);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Subtle Gradient Blobs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 sm:p-10 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-500/25 mb-4">
            <Smartphone className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Mobile Fixee QA</h1>
          <p className="text-xs text-slate-500 mt-1">
            Mobile Application Testing & Quality Assurance Suite
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>


          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Mobile Fixee QA Secure Access</span>
        </div>
      </div>
    </div>
  );
};
