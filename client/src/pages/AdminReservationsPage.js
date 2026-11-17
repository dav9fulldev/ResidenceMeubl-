import React from 'react';
import AdminReservations from '../components/AdminReservations';

const AdminReservationsPage = () => (
  <div>
    <div className="admin-page-header">
      <div>
        <h1>Réservations</h1>
        <p>Confirmez, annulez et traitez les demandes d'annulation des clients.</p>
      </div>
    </div>
    <AdminReservations />
  </div>
);

export default AdminReservationsPage;
