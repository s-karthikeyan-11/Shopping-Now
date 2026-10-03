import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SellerRoute = ({ children }) => {
  const { user, loading, isSeller, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-12 text-center text-slate-500">Loading seller dashboard...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isSeller && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default SellerRoute;
