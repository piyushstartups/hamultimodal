import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MyDeployments from "./pages/MyDeployments";
import Deployments from "./pages/Deployments";
import BnbDayView from "./pages/BnbDayView";
import LiveDashboard from "./pages/LiveDashboard";
import Analytics from "./pages/Analytics";
import Inventory from "./pages/Inventory";
import Requests from "./pages/Requests";
import AdminPanel from "./pages/AdminPanel";
import HardwareDashboard from "./pages/HardwareDashboard";
import OffloadManagement from "./pages/OffloadManagement";

import "./App.css";

// Hide Emergent badge (injected by platform infrastructure)
function useHideEmergentBadge() {
  useEffect(() => {
    const hideBadge = () => {
      const badge = document.getElementById('emergent-badge');
      if (badge) {
        badge.style.display = 'none';
        badge.style.visibility = 'hidden';
        badge.style.opacity = '0';
        badge.remove(); // Remove from DOM entirely
      }
    };
    
    // Run immediately
    hideBadge();
    
    // Also run after a delay (badge might be injected after initial load)
    const timeouts = [100, 500, 1000, 2000, 5000].map(delay => 
      setTimeout(hideBadge, delay)
    );
    
    // Also use MutationObserver to catch dynamically injected badge
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.id === 'emergent-badge' || (node.querySelector && node.querySelector('#emergent-badge'))) {
            hideBadge();
          }
        }
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      timeouts.forEach(clearTimeout);
      observer.disconnect();
    };
  }, []);
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" />;
  
  return children;
}

function App() {
  // Hide Emergent badge on all pages
  useHideEmergentBadge();
  
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/my-deployments" element={<ProtectedRoute><MyDeployments /></ProtectedRoute>} />
          <Route path="/deployments" element={<ProtectedRoute><Deployments /></ProtectedRoute>} />
          <Route path="/deployments/:deploymentId/day-view" element={<ProtectedRoute><BnbDayView /></ProtectedRoute>} />
          <Route path="/live" element={<ProtectedRoute><LiveDashboard /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
          <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
          <Route path="/hardware" element={<ProtectedRoute><HardwareDashboard /></ProtectedRoute>} />
          <Route path="/offload" element={<ProtectedRoute><OffloadManagement /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
