import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Chat from './pages/Chat';
import InvitePage from './pages/InvitePage';
import { ToastContainer } from './components/Common/Toast';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
      className="flex-center" style={{height: '100vh', color: 'var(--accent-primary)'}}
    >
      <div className="skeleton" style={{width: '100vw', height: '100vh', borderRadius: 0}}></div>
    </motion.div>
  );
  if (!user) return <Navigate to="/login" />;
  return children;
};

const PageWrapper = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.98 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 1.02 }}
    transition={{ duration: 0.3, ease: 'easeOut' }}
    style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
  >
    {children}
  </motion.div>
);

const AppContent = () => {
  const location = useLocation();
  return (
    <>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
          <Route path="/register" element={<PageWrapper><Register /></PageWrapper>} />
          <Route path="/invite/:username" element={<PageWrapper><InvitePage /></PageWrapper>} />
          <Route path="/" element={
            <ProtectedRoute>
              <SocketProvider>
                <PageWrapper><Chat /></PageWrapper>
              </SocketProvider>
            </ProtectedRoute>
          } />
        </Routes>
      </AnimatePresence>
      <ToastContainer />
    </>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
