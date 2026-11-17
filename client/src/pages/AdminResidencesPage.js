import React from 'react';
import AdminPanel from '../components/AdminPanel';

const AdminResidencesPage = () => (
  <div>
    <div className="admin-page-header">
      <div>
        <h1>Résidences</h1>
        <p>Statuts, maintenance, ajout et suppression de résidences.</p>
      </div>
    </div>
    <AdminPanel />
  </div>
);

export default AdminResidencesPage;
