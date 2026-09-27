import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Requires any logged-in user
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-12 text-center text-ink-soft">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

export default PrivateRoute;
