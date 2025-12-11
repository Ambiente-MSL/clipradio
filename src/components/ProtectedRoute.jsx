
import React from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-900">
        <Loader className="w-10 h-10 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    // Sem usu?rio autenticado: redireciona para o login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
