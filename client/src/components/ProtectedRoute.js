import React from 'react';
import { Navigate } from 'react-router-dom';
import { useResidences } from '../context/ResidencesContext';

const ProtectedRoute = ({ children }) => {
  const { isAdmin } = useResidences();

  if (!isAdmin) {
    // Rediriger vers la page de connexion si pas connecté
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
