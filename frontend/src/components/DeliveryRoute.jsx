import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DeliveryRoute = ({ children }) => {
  const { user, loading, isDelivery, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-12 text-center text-slate-500">Loading delivery workspace...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isDelivery && !isAdmin) return <Navigate to="/delivery/apply" replace />;
  return children;
};

export default DeliveryRoute;
