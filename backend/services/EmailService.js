const nodemailer = require('nodemailer');

// Adresse publique du site (première valeur de FRONTEND_URL), pour les liens et images des emails
const urlSite = () => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '');
const urlAbsolue = (chemin) => (/^https?:\/\//.test(chemin) ? chemin : `${urlSite()}${chemin}`);

// Échapper les données saisies par le client avant de les insérer dans le HTML
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Service de gestion des emails
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  // Initialiser le transporteur email
  initTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS, // App Password Gmail
        },
      });
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du transporteur email:', error);
    }
  }

  // Envoyer un email de réservation
  async sendReservationEmail(reservation) {
    if (!this.transporter) {
      throw new Error('Transporteur email non initialisé');
    }

    try {
      const info = reservation.getInfoEmail();
      
      // Email pour l'administrateur
      await this.transporter.sendMail({
        from: `"Sankofart Résidence" <${process.env.EMAIL_USER}>`,
        replyTo: info.client.email,
        to: process.env.EMAIL_USER,
        subject: `🆕 Nouvelle réservation - ${info.residence.nom}`,
        html: this.generateAdminEmailHTML(info),
      });

      // Email de confirmation pour le client
      await this.transporter.sendMail({
        from: `"Sankofart Résidence" <${process.env.EMAIL_USER}>`,
        to: info.client.email,
        subject: `✅ Confirmation de votre réservation - ${info.residence.nom}`,
        html: this.generateClientEmailHTML(info),
      });

      console.log('✅ Emails de réservation envoyés avec succès');
      return true;

    } catch (error) {
      console.error('❌ Erreur lors de l\'envoi des emails:', error);
      throw error;
    }
  }

  // Générer le HTML pour l'email admin
  generateAdminEmailHTML(info) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .section { margin: 20px 0; padding: 15px; border-left: 4px solid #1e3c72; background: #f9f9f9; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
          .info-item { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .label { font-weight: bold; color: #1e3c72; }
          .value { margin-top: 5px; }
          .residence-photo { max-width: 200px; border-radius: 8px; margin: 10px 0; }
          .status { display: inline-block; padding: 5px 15px; background: #ff9800; color: white; border-radius: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏠 Nouvelle Réservation Sankofart Résidence</h1>
          <p>Référence: ${info.id}</p>
        </div>
        
        <div class="content">
          <div class="section">
            <h2>📋 Informations de la Résidence</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Nom</div>
                <div class="value">${info.residence.nom}</div>
              </div>
              <div class="info-item">
                <div class="label">Référence</div>
                <div class="value">${info.residence.reference}</div>
              </div>
              <div class="info-item">
                <div class="label">Localisation</div>
                <div class="value">${info.residence.localisation}</div>
              </div>
              <div class="info-item">
                <div class="label">Prix Total</div>
                <div class="value">${info.prixTotal.toLocaleString('fr-FR')} FCFA</div>
              </div>
            </div>
            ${info.residence.photos && info.residence.photos.length > 0 ? 
              `<img src="${esc(urlAbsolue(info.residence.photos[0]))}" alt="Photo de la résidence" class="residence-photo">` : ''}
          </div>

          <div class="section">
            <h2>👤 Informations du Client</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Nom Complet</div>
                <div class="value">${esc(info.client.prenom)} ${esc(info.client.nom)}</div>
              </div>
              <div class="info-item">
                <div class="label">Email</div>
                <div class="value">${esc(info.client.email)}</div>
              </div>
              <div class="info-item">
                <div class="label">Téléphone</div>
                <div class="value">${esc(info.client.telephone)}</div>
              </div>
              <div class="info-item">
                <div class="label">Nombre de Personnes</div>
                <div class="value">${esc(info.details.nombrePersonnes)}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>📅 Détails du Séjour</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Date d'Arrivée</div>
                <div class="value">${new Date(info.dates.arrivee).toLocaleDateString('fr-FR')}</div>
              </div>
              <div class="info-item">
                <div class="label">Date de Départ</div>
                <div class="value">${new Date(info.dates.depart).toLocaleDateString('fr-FR')}</div>
              </div>
              <div class="info-item">
                <div class="label">Statut</div>
                <div class="value"><span class="status">${info.statut}</span></div>
              </div>
              <div class="info-item">
                <div class="label">Date de Réservation</div>
                <div class="value">${new Date(info.dateCreation).toLocaleDateString('fr-FR')}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>📝 Actions Requises</h2>
            <p>Veuillez traiter cette réservation et contacter le client pour confirmer la disponibilité.</p>
            <p><strong>Email du client:</strong> ${esc(info.client.email)}</p>
            <p><strong>Téléphone:</strong> ${esc(info.client.telephone)}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Générer le HTML pour l'email client
  generateClientEmailHTML(info) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .section { margin: 20px 0; padding: 15px; border-left: 4px solid #1e3c72; background: #f9f9f9; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
          .info-item { background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .label { font-weight: bold; color: #1e3c72; }
          .value { margin-top: 5px; }
          .residence-photo { max-width: 200px; border-radius: 8px; margin: 10px 0; }
          .status { display: inline-block; padding: 5px 15px; background: #4caf50; color: white; border-radius: 20px; font-size: 12px; }
          .footer { text-align: center; margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏠 Confirmation de Réservation</h1>
          <p>Sankofart Résidence</p>
        </div>
        
        <div class="content">
          <p>Bonjour ${esc(info.client.prenom)},</p>
          
          <p>Nous avons bien reçu votre réservation. Voici un récapitulatif :</p>

          <div class="section">
            <h2>📋 Détails de votre Réservation</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Référence</div>
                <div class="value">${info.id}</div>
              </div>
              <div class="info-item">
                <div class="label">Statut</div>
                <div class="value"><span class="status">En attente de confirmation</span></div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>🏠 Résidence Réservée</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Nom</div>
                <div class="value">${info.residence.nom}</div>
              </div>
              <div class="info-item">
                <div class="label">Localisation</div>
                <div class="value">${info.residence.localisation}</div>
              </div>
              <div class="info-item">
                <div class="label">Prix Total</div>
                <div class="value">${info.prixTotal.toLocaleString('fr-FR')} FCFA</div>
              </div>
            </div>
            ${info.residence.photos && info.residence.photos.length > 0 ? 
              `<img src="${esc(urlAbsolue(info.residence.photos[0]))}" alt="Photo de la résidence" class="residence-photo">` : ''}
          </div>

          <div class="section">
            <h2>📅 Votre Séjour</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Date d'Arrivée</div>
                <div class="value">${new Date(info.dates.arrivee).toLocaleDateString('fr-FR')}</div>
              </div>
              <div class="info-item">
                <div class="label">Date de Départ</div>
                <div class="value">${new Date(info.dates.depart).toLocaleDateString('fr-FR')}</div>
              </div>
              <div class="info-item">
                <div class="label">Nombre de Personnes</div>
                <div class="value">${esc(info.details.nombrePersonnes)}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>⏳ Prochaines Étapes</h2>
            <p>Notre équipe va examiner votre réservation et vous contacter dans les plus brefs délais pour confirmer la disponibilité et finaliser les détails.</p>
          </div>

          <div class="footer">
            <p><strong>Contact Sankofart Résidence</strong></p>
            <p>📧 ${process.env.EMAIL_USER}</p>
            <p>Merci de votre confiance !</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Informer le client d'un changement de statut (confirmée ou annulée)
  async sendStatusEmail(reservation) {
    if (!this.transporter) {
      throw new Error('Transporteur email non initialisé');
    }
    const confirmee = reservation.statut === 'confirmee';
    const nomResidence = reservation.residenceInfo?.nom || 'votre résidence';

    await this.transporter.sendMail({
      from: `"Sankofart Résidence" <${process.env.EMAIL_USER}>`,
      to: reservation.client.email,
      replyTo: process.env.EMAIL_USER,
      subject: confirmee
        ? `✅ Réservation confirmée - ${nomResidence}`
        : `❌ Réservation annulée - ${nomResidence}`,
      html: this.generateStatusEmailHTML(reservation),
    });
  }

  generateStatusEmailHTML(reservation) {
    const confirmee = reservation.statut === 'confirmee';
    const couleur = confirmee ? '#2e7d32' : '#c62828';
    const date = (d) => new Date(d).toLocaleDateString('fr-FR');
    const residence = reservation.residenceInfo || {};
    const photo = residence.photos && residence.photos[0];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background: ${couleur}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .section { margin: 20px 0; padding: 15px; border-left: 4px solid ${couleur}; background: #f9f9f9; }
          .label { font-weight: bold; color: #1e3c72; }
          .residence-photo { max-width: 200px; border-radius: 8px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${confirmee ? '✅ Réservation confirmée' : '❌ Réservation annulée'}</h1>
          <p>Sankofart Résidence</p>
        </div>

        <div class="content">
          <p>Bonjour ${esc(reservation.client.prenom)},</p>

          ${confirmee
            ? `<p>Bonne nouvelle : votre réservation est <strong>confirmée</strong>. Nous avons hâte de vous accueillir !</p>`
            : `<p>Nous sommes désolés : votre réservation a été <strong>annulée</strong>. N'hésitez pas à nous contacter ou à choisir d'autres dates.</p>`}

          <div class="section">
            <p><span class="label">Référence :</span> ${esc(reservation.id)}</p>
            <p><span class="label">Résidence :</span> ${esc(residence.nom)} — ${esc(residence.localisation)}</p>
            <p><span class="label">Arrivée :</span> ${date(reservation.dates.arrivee)}</p>
            <p><span class="label">Départ :</span> ${date(reservation.dates.depart)}</p>
            <p><span class="label">Personnes :</span> ${esc(reservation.details?.nombrePersonnes)}</p>
            <p><span class="label">Montant :</span> ${Number(reservation.prixTotal).toLocaleString('fr-FR')} FCFA</p>
            ${photo ? `<img src="${esc(urlAbsolue(photo))}" alt="Photo de la résidence" class="residence-photo">` : ''}
          </div>

          ${confirmee
            ? `<div class="section"><p>Pour toute question avant votre arrivée, répondez simplement à cet email.</p></div>`
            : ''}

          <div class="footer">
            <p><strong>Contact Sankofart Résidence</strong></p>
            <p>📧 ${process.env.EMAIL_USER}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Tester la connexion email
  async testConnection() {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Erreur de connexion email:', error);
      return false;
    }
  }
}

module.exports = EmailService;
