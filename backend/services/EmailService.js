const nodemailer = require('nodemailer');
const AuthService = require('./AuthService');

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

const DELAI_ENVOI_MS = 10000;

/**
 * Service de gestion des emails.
 *
 * Deux modes d'envoi :
 *  - API Brevo (si BREVO_API_KEY est défini) : passe par HTTPS, fonctionne
 *    sur les hébergeurs qui bloquent le SMTP (Render gratuit, etc.)
 *  - SMTP Gmail (EMAIL_USER + EMAIL_PASS) : pratique en local
 *
 * L'expéditeur est EMAIL_FROM, ou à défaut EMAIL_USER. Avec Brevo, cette
 * adresse doit être validée dans Brevo (Senders, domains & dedicated IPs).
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  get mode() {
    return process.env.BREVO_API_KEY ? 'brevo' : 'smtp';
  }

  get expediteur() {
    return process.env.EMAIL_FROM || process.env.EMAIL_USER;
  }

  // Initialiser le transporteur SMTP (utilisé seulement sans Brevo)
  initTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS, // App Password Gmail
        },
        // Ne jamais faire attendre le client plus de quelques secondes
        connectionTimeout: DELAI_ENVOI_MS,
        greetingTimeout: DELAI_ENVOI_MS,
        socketTimeout: DELAI_ENVOI_MS * 2,
      });
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du transporteur email:', error);
    }
  }

  /**
   * Envoie un email, par l'API Brevo ou par SMTP.
   * @param {{ to: string, subject: string, html: string, replyTo?: string }} message
   */
  async envoyer({ to, subject, html, replyTo }) {
    if (this.mode === 'brevo') {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY.trim(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Sankofart Résidence', email: this.expediteur },
          to: [{ email: to }],
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
          subject,
          htmlContent: html,
        }),
        signal: AbortSignal.timeout(DELAI_ENVOI_MS),
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json()).message || ''; } catch { /* corps vide */ }
        throw new Error(`Brevo ${response.status}${detail ? ` : ${detail}` : ''}`);
      }
      return;
    }

    if (!this.transporter) {
      throw new Error('Transporteur email non initialisé');
    }
    await this.transporter.sendMail({
      from: `"Sankofart Résidence" <${this.expediteur}>`,
      to,
      replyTo,
      subject,
      html,
    });
  }

  // Envoyer un email de réservation
  async sendReservationEmail(reservation) {
    try {
      const info = reservation.getInfoEmail();

      // Email à l'administrateur et accusé de réception au client, en parallèle
      await Promise.all([
        this.envoyer({
          to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
          replyTo: info.client.email,
          subject: `🆕 Nouvelle réservation - ${info.residence.nom}`,
          html: this.generateAdminEmailHTML(info),
        }),
        this.envoyer({
          to: info.client.email,
          replyTo: this.expediteur,
          subject: `✅ Confirmation de votre réservation - ${info.residence.nom}`,
          html: this.generateClientEmailHTML(info),
        }),
      ]);

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

          <div class="section">
            <h2>🗂️ Gérer ma réservation</h2>
            <p>Suivez son statut ou demandez une annulation, sans créer de compte :
              <a href="${esc(this.lienGestion(info.client.email))}">accéder à mes réservations</a>.</p>
            <p>Vous pouvez aussi utiliser la page « Mes réservations » du site avec votre email et la référence <strong>${esc(info.id)}</strong>.</p>
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

  // Lien « Gérer mes réservations » (accès sans compte, valable 30 jours)
  lienGestion(email) {
    const jeton = AuthService.creerJetonClient(email, { dureeMs: 30 * 24 * 60 * 60 * 1000 });
    return `${urlSite()}/mes-reservations?acces=${encodeURIComponent(jeton)}`;
  }

  // Gabarit simple pour les emails courts
  emailSimple({ titre, couleur = '#1e3c72', contenu, bouton }) {
    return `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0;">
        <div style="background: ${couleur}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px;">${titre}</h1>
          <p style="margin: 6px 0 0;">Sankofart Résidence</p>
        </div>
        <div style="padding: 20px;">
          ${contenu}
          ${bouton ? `<p style="text-align: center; margin: 28px 0;">
            <a href="${esc(bouton.url)}" style="background: #d4af37; color: #1a1a2e; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">${bouton.texte}</a>
          </p>` : ''}
          <p style="text-align: center; color: #777; font-size: 13px; margin-top: 30px;">📧 ${esc(this.expediteur)}</p>
        </div>
      </body></html>
    `;
  }

  recapReservation(r) {
    const date = (d) => new Date(d).toLocaleDateString('fr-FR');
    return `<div style="margin: 16px 0; padding: 14px; border-left: 4px solid #d4af37; background: #f9f9f9;">
      <p style="margin: 4px 0;"><strong>Référence :</strong> ${esc(r.id)}</p>
      <p style="margin: 4px 0;"><strong>Résidence :</strong> ${esc(r.residenceInfo?.nom)}</p>
      <p style="margin: 4px 0;"><strong>Séjour :</strong> du ${date(r.dates.arrivee)} au ${date(r.dates.depart)}</p>
      <p style="margin: 4px 0;"><strong>Montant :</strong> ${Number(r.prixTotal).toLocaleString('fr-FR')} FCFA</p>
    </div>`;
  }

  // Lien d'accès à l'historique, demandé depuis « Mes réservations »
  async sendLienAcces(email) {
    const jeton = AuthService.creerJetonClient(email, { dureeMs: 24 * 60 * 60 * 1000 });
    await this.envoyer({
      to: email,
      subject: '🔑 Accédez à vos réservations - Sankofart Résidence',
      html: this.emailSimple({
        titre: 'Vos réservations',
        contenu: `<p>Bonjour,</p>
          <p>Vous avez demandé à consulter vos réservations. Cliquez sur le bouton ci-dessous : vous pourrez voir votre historique et, si besoin, demander une annulation.</p>
          <p style="color: #777; font-size: 13px;">Ce lien est valable 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
        bouton: { texte: 'Voir mes réservations', url: `${urlSite()}/mes-reservations?acces=${encodeURIComponent(jeton)}` },
      }),
    });
  }

  // Prévenir l'admin qu'un client demande une annulation
  async sendDemandeAnnulationAdmin(r) {
    await this.envoyer({
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      replyTo: r.client.email,
      subject: `↩️ Demande d'annulation - ${r.residenceInfo?.nom} (${r.client.prenom} ${r.client.nom})`,
      html: this.emailSimple({
        titre: 'Demande d\'annulation',
        couleur: '#b45309',
        contenu: `<p><strong>${esc(r.client.prenom)} ${esc(r.client.nom)}</strong> (${esc(r.client.email)}, ${esc(r.client.telephone)}) demande l'annulation de sa réservation.</p>
          ${this.recapReservation(r)}
          <p><strong>Motif :</strong> ${r.demandeAnnulation?.motif ? esc(r.demandeAnnulation.motif) : '<em>non précisé</em>'}</p>
          <p>Acceptez ou refusez la demande depuis le tableau de bord.</p>`,
        bouton: { texte: 'Ouvrir le tableau de bord', url: `${urlSite()}/admin/dashboard` },
      }),
    });
  }

  // Informer le client que sa demande d'annulation est refusée
  async sendRefusAnnulation(r) {
    await this.envoyer({
      to: r.client.email,
      replyTo: this.expediteur,
      subject: `Votre demande d'annulation - ${r.residenceInfo?.nom}`,
      html: this.emailSimple({
        titre: 'Demande d\'annulation refusée',
        couleur: '#475569',
        contenu: `<p>Bonjour ${esc(r.client.prenom)},</p>
          <p>Votre demande d'annulation n'a pas pu être acceptée : votre réservation est <strong>maintenue</strong>.</p>
          ${r.demandeAnnulation?.reponse ? `<p><strong>Message de notre équipe :</strong> ${esc(r.demandeAnnulation.reponse)}</p>` : ''}
          ${this.recapReservation(r)}
          <p>Pour en discuter, répondez simplement à cet email.</p>`,
        bouton: { texte: 'Gérer mes réservations', url: this.lienGestion(r.client.email) },
      }),
    });
  }

  // Acompte reçu : reçu pour le client
  async sendAcompteRecu(r) {
    const a = r.acompte;
    const reste = Math.max(0, (Number(r.prixTotal) || 0) - (Number(a.montant) || 0));
    await this.envoyer({
      to: r.client.email,
      replyTo: this.expediteur,
      subject: `✅ Acompte reçu - ${r.residenceInfo?.nom}`,
      html: this.emailSimple({
        titre: 'Acompte reçu',
        couleur: '#2e7d32',
        contenu: `<p>Bonjour ${esc(r.client.prenom)},</p>
          <p>Nous avons bien reçu votre acompte de <strong>${Number(a.montant).toLocaleString('fr-FR')} FCFA</strong> par PI-SPI. Votre séjour est garanti.</p>
          ${this.recapReservation(r)}
          <p><strong>Reste à régler :</strong> ${reste.toLocaleString('fr-FR')} FCFA</p>
          <p style="color:#777;font-size:13px;">Référence du paiement : ${esc(a.txId)}${a.end2endId ? ` · Identifiant PI-SPI : ${esc(a.end2endId)}` : ''}</p>`,
        bouton: { texte: 'Gérer mes réservations', url: this.lienGestion(r.client.email) },
      }),
    });
  }

  // Acompte reçu : notification à l'administrateur
  async sendAcompteRecuAdmin(r) {
    const a = r.acompte;
    await this.envoyer({
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      replyTo: r.client.email,
      subject: `💰 Acompte reçu - ${r.client.prenom} ${r.client.nom} (${Number(a.montant).toLocaleString('fr-FR')} FCFA)`,
      html: this.emailSimple({
        titre: 'Acompte reçu',
        couleur: '#2e7d32',
        contenu: `<p><strong>${esc(r.client.prenom)} ${esc(r.client.nom)}</strong> a réglé l'acompte de
          <strong>${Number(a.montant).toLocaleString('fr-FR')} FCFA</strong> (${a.methode === 'qr' ? 'QR Code' : 'demande de paiement'}).</p>
          ${this.recapReservation(r)}
          <p style="color:#777;font-size:13px;">txId ${esc(a.txId)}${a.end2endId ? ` · end2endId ${esc(a.end2endId)}` : ''}</p>`,
        bouton: { texte: 'Ouvrir le tableau de bord', url: `${urlSite()}/admin/reservations` },
      }),
    });
  }

  // Informer le client d'un changement de statut (confirmée ou annulée)
  async sendStatusEmail(reservation, { message = null } = {}) {
    const confirmee = reservation.statut === 'confirmee';
    const nomResidence = reservation.residenceInfo?.nom || 'votre résidence';

    await this.envoyer({
      to: reservation.client.email,
      replyTo: this.expediteur,
      subject: confirmee
        ? `✅ Réservation confirmée - ${nomResidence}`
        : `❌ Réservation annulée - ${nomResidence}`,
      html: this.generateStatusEmailHTML(reservation, message),
    });
  }

  generateStatusEmailHTML(reservation, message = null) {
    const confirmee = reservation.statut === 'confirmee';
    const acompteInfo = require('./paiement/acompte').etatAcompte(reservation);
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

          ${message ? `<div class="section"><p><span class="label">Message de notre équipe :</span> ${esc(message)}</p></div>` : ''}

          ${!confirmee && reservation.acompte?.paye ? `<div class="section"><p><span class="label">Votre acompte :</span>
            ${Number(reservation.acompte.montant).toLocaleString('fr-FR')} FCFA vous sera remboursé par PI-SPI. Nous vous confirmerons le remboursement par email.</p></div>` : ''}

          ${confirmee && acompteInfo?.possible ? `<div class="section" style="border-left-color:#d4af37;">
              <p><span class="label">Acompte à régler :</span> ${Number(acompteInfo.montant).toLocaleString('fr-FR')} FCFA (${acompteInfo.pourcentage} %)</p>
              <p>Garantissez votre séjour en payant l'acompte par PI-SPI (QR Code ou demande de paiement dans l'application de votre banque) :</p>
              <p style="text-align:center;margin:18px 0;"><a href="${esc(this.lienGestion(reservation.client.email))}" style="background:#d4af37;color:#1a1a2e;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">Payer l'acompte</a></p>
            </div>` : ''}

          ${confirmee
            ? `<div class="section"><p>Pour toute question avant votre arrivée, répondez simplement à cet email.
                Vous pouvez aussi <a href="${esc(this.lienGestion(reservation.client.email))}">gérer vos réservations en ligne</a> (demande d'annulation).</p></div>`
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
    if (this.mode === 'brevo') {
      try {
        const response = await fetch('https://api.brevo.com/v3/account', {
          headers: { 'api-key': process.env.BREVO_API_KEY.trim(), Accept: 'application/json' },
          signal: AbortSignal.timeout(DELAI_ENVOI_MS),
        });
        return response.ok;
      } catch {
        return false;
      }
    }
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
