import React from 'react';
import AdminReservations from '../components/AdminReservations';

const AdminReservationsPage = () => (
  <div>
    <div className="admin-page-header">
      <div>
        <h1>Réservations</h1>
        <p>Confirmez les demandes, suivez les acomptes et traitez les annulations.</p>
      </div>
    </div>
    <AdminReservations />
  </div>
);

export default AdminReservationsPage;
