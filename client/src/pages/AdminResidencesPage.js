import React from 'react';
import AdminPanel from '../components/AdminPanel';

const AdminResidencesPage = () => (
  <div>
    <div className="admin-page-header">
      <div>
        <h1>Résidences</h1>
        <p>Vos logements, leur disponibilité, la maintenance et la durée des séjours.</p>
      </div>
    </div>
    <AdminPanel />
  </div>
);

export default AdminResidencesPage;
