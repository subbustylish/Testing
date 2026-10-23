import React, { useState, useEffect } from 'react';
import { Sidebar, NavigationPage } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { OverviewDashboard } from './components/dashboard/OverviewDashboard';
import { UploadTestResults } from './components/upload/UploadTestResults';
import { ScreenTestResults } from './components/screens/ScreenTestResults';
import { ReportsExports } from './components/reports/ReportsExports';
import { LoginForm } from './components/auth/LoginForm';
import { storageService } from './services/storage';
import { TestCaseExecution } from './types';

export default function App() {
  // Authentication state - check if authenticated in storage
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    storageService.isAuthenticated()
  );

  const [currentPage, setCurrentPage] = useState<NavigationPage>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Reactive data states
  const [testCases, setTestCases] = useState<TestCaseExecution[]>(() =>
    storageService.getTestCases()
  );

  // Deep link state for screen navigation
  const [targetScreenForResults, setTargetScreenForResults] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    // Subscribe to reactive storage changes
    const unsubscribe = storageService.subscribe(() => {
      setTestCases([...storageService.getTestCases()]);
    });
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (uname: string) => {
    storageService.login(uname);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    storageService.logout();
    setIsAuthenticated(false);
  };

  const handleNavigateToScreen = (screenName: string) => {
    setTargetScreenForResults(screenName);
    setCurrentPage('screens');
  };

  // If not logged in, render the login form
  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Dark Navy Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={(page) => {
          setCurrentPage(page);
          if (page !== 'screens') setTargetScreenForResults(undefined);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header with login name 'admin' and logout button */}
        <Header
          testCases={testCases}
          onNavigateToUpload={() => setCurrentPage('upload')}
          onLogout={handleLogout}
        />

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {currentPage === 'overview' && (
            <OverviewDashboard
              testCases={testCases}
              onNavigateToUpload={() => setCurrentPage('upload')}
              onNavigateToScreen={handleNavigateToScreen}
            />
          )}

          {currentPage === 'upload' && (
            <UploadTestResults
              onImportComplete={() => setCurrentPage('overview')}
            />
          )}

          {currentPage === 'screens' && (
            <ScreenTestResults
              testCases={testCases}
              initialScreen={targetScreenForResults}
              onNavigateToUpload={() => setCurrentPage('upload')}
            />
          )}

          {currentPage === 'reports' && (
            <ReportsExports testCases={testCases} />
          )}
        </main>
      </div>
    </div>
  );
}
