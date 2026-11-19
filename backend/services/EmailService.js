const Settings = require('./SettingsService');
const nodemailer = require('nodemailer');
const AuthService = require('./AuthService');

// Adresse publique du site (première valeur de FRONTEND_URL), pour les liens et images des emails
const urlSite = () => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '');

// Couleur d'accent unique des emails (vert de la charte)
const ACCENT = '#12284C';

const fcfa = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

// ---------- Textes selon le moyen de paiement réellement utilisé ----------
const NOMS_MOYENS = {
  geniuspay: 'GeniusPay (Mobile Money ou carte bancaire)',
  qr: 'PI-SPI, par QR code',
  demande: 'PI-SPI, depuis votre application bancaire',
};
const nomMoyen = (methode) => NOMS_MOYENS[methode] || 'Paiement en ligne';
const libelleMoyen = (methode) => (methode === 'geniuspay' ? 'via GeniusPay' : ['qr', 'demande'].includes(methode) ? 'par PI-SPI' : 'en ligne');

function referencePaiement(a, { admin = false } = {}) {
  if (a.methode === 'geniuspay') return a.end2endId || a.txId;
  return admin && a.end2endId ? `${a.txId} · identifiant PI-SPI ${a.end2endId}` : a.txId;
}

// Moyens proposés au client, en une phrase (« via GeniusPay (…) ou par PI-SPI (…) »)
function phraseMoyensDisponibles(moyens = []) {
  const textes = moyens.map(m => (m === 'geniuspay'
    ? 'via GeniusPay (Wave, Orange Money, MTN, Moov ou carte bancaire)'
    : 'par PI-SPI depuis votre application bancaire'));
  return textes.length ? textes.join(', ou ') : 'en ligne';
}

// Comment l'acompte d'un séjour annulé est (ou n'est pas) remboursé
function phraseRemboursementAcompte(r) {
  const a = r.acompte;
  const rb = a.remboursement || {};
  if (rb.statut === 'non_remboursable') {
    return `Votre acompte de ${fcfa(a.montant)} n'est pas remboursable (${esc(String(rb.raison || '').toLowerCase())}), conformément aux conditions acceptées lors du paiement.`;
  }
  const montant = fcfa(rb.montant ?? a.montant);
  const part = rb.pourcentage && rb.pourcentage < 100 ? ` (${rb.pourcentage} % de votre acompte, selon les conditions d'annulation)` : '';
  if (a.methode === 'geniuspay') {
    return `Votre acompte vous sera remboursé : ${montant}${part}, par notre équipe, sur le moyen utilisé lors du paiement. Nous vous confirmerons le remboursement.`;
  }
  return `Votre acompte vous est remboursé automatiquement : ${montant}${part}, sur le compte utilisé pour payer (PI-SPI). Vous recevrez une confirmation par email.`;
}

function libelleRemboursement(a) {
  const rb = a.remboursement || {};
  if (rb.methode === 'retour') return 'Sur le compte utilisé pour payer (PI-SPI)';
  if (rb.methode === 'paiement') return 'Par virement PI-SPI vers votre compte';
  return a.methode === 'geniuspay' ? 'Par notre équipe, sur le moyen utilisé lors du paiement' : 'Par notre équipe';
}

const acompteConditions = () => require('./paiement/acompte').conditionsRemboursement();

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

  // Destinataire des alertes : réglé dans le back-office, sinon ADMIN_EMAIL, sinon le compte d'envoi
  get destinataireAdmin() {
    return Settings.etablissement().emailNotifications || process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  }

  get nomEtablissement() {
    return Settings.etablissement().nom || 'BABI RESIDENCE';
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
          sender: { name: this.nomEtablissement, email: this.expediteur },
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
      from: `"${this.nomEtablissement}" <${this.expediteur}>`,
      to,
      replyTo,
      subject,
      html,
    });
  }

  // ---------- Gabarit commun : sobre, une seule couleur d'accent, compatible avec les clients email ----------

  get etablissement() {
    return Settings.etablissement();
  }

  /**
   * Mise en page de tous les emails.
   * @param {{ titre, intro?, contenu, bouton?, note?, prevue? }} p  prevue = texte d'aperçu dans la boîte de réception
   */
  gabarit({ titre, contenu, bouton, note, prevue = '' }) {
    const e = this.etablissement;
    const coordonnees = [e.telephone, e.email, e.adresse].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:#F4F2EE;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(prevue)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2EE;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E6E1D8;border-radius:12px;">
  <tr><td style="padding:28px 36px 20px;border-bottom:3px solid #E0A526;">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;letter-spacing:1px;color:${ACCENT};">${esc(e.nom)}</p>
    <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-style:italic;color:#8A8F93;">Réservez. Séjournez. Profitez.</p>
  </td></tr>
  <tr><td style="padding:32px 36px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#3A4045;">
    <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:normal;color:#0F1A2E;">${esc(titre)}</h1>
    ${contenu}
    ${bouton ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="background:${ACCENT};border-radius:8px;">
      <a href="${esc(bouton.url)}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${esc(bouton.texte)}</a>
    </td></tr></table>` : ''}
    ${note ? `<p style="margin:20px 0 0;font-size:13px;color:#8A8F93;">${note}</p>` : ''}
  </td></tr>
  <tr><td style="padding:24px 36px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#8A8F93;border-top:1px solid #EFEBE3;">
    ${esc(e.nom)}${coordonnees ? `<br>${coordonnees}` : ''}<br>Pour toute question, répondez simplement à cet email.
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  }

  /** Tableau de détails : [[libellé, valeur HTML], …] */
  details(lignes) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border:1px solid #EFEBE3;border-radius:8px;">
      ${lignes.filter(Boolean).map(([libelle, valeur], i) => `<tr>
        <td style="padding:10px 14px;${i ? 'border-top:1px solid #EFEBE3;' : ''}font-size:13px;color:#8A8F93;width:42%;vertical-align:top;">${esc(libelle)}</td>
        <td style="padding:10px 14px;${i ? 'border-top:1px solid #EFEBE3;' : ''}font-size:14px;color:#0F1A2E;vertical-align:top;">${valeur}</td>
      </tr>`).join('')}
    </table>`;
  }

  // Lignes communes décrivant un séjour
  lignesSejour(r, { montant = true } = {}) {
    const res = r.residenceInfo || r.residence || {};
    return [
      ['Référence', esc(r.id)],
      ['Résidence', `${esc(res.nom)}${res.localisation ? `<br><span style="color:#8A8F93;font-size:13px;">${esc(res.localisation)}</span>` : ''}`],
      ['Séjour', `du ${date(r.dates.arrivee)} au ${date(r.dates.depart)}`],
      r.details?.nombrePersonnes ? ['Personnes', esc(r.details.nombrePersonnes)] : null,
      montant ? ['Montant du séjour', fcfa(r.prixTotal)] : null,
    ];
  }

  // Lien « Gérer mes réservations » (accès sans compte, valable 30 jours)
  lienGestion(email) {
    const jeton = AuthService.creerJetonClient(email, { dureeMs: 30 * 24 * 60 * 60 * 1000 });
    return `${urlSite()}/mes-reservations?acces=${encodeURIComponent(jeton)}`;
  }

  // ---------- Nouvelle réservation ----------

  async sendReservationEmail(reservation) {
    const r = reservation.getInfoEmail();
    const avecResidence = { ...r, residenceInfo: r.residence };
    await Promise.all([
      this.envoyer({
        to: this.destinataireAdmin,
        replyTo: r.client.email,
        subject: `Nouvelle demande de réservation - ${r.residence.nom}`,
        html: this.gabarit({
          titre: 'Nouvelle demande de réservation',
          prevue: `${r.client.prenom} ${r.client.nom} souhaite réserver ${r.residence.nom}.`,
          contenu: `<p style="margin:0 0 12px;"><strong>${esc(r.client.prenom)} ${esc(r.client.nom)}</strong> souhaite réserver une résidence. La demande attend votre confirmation.</p>
            ${this.details([
              ...this.lignesSejour(avecResidence),
              ['Client', `${esc(r.client.prenom)} ${esc(r.client.nom)}<br><a href="mailto:${esc(r.client.email)}" style="color:${ACCENT};">${esc(r.client.email)}</a><br>${esc(r.client.telephone)}`],
              r.notes ? ['Demande particulière', esc(r.notes)] : null,
            ])}`,
          bouton: { texte: 'Traiter la demande', url: `${urlSite()}/admin/reservations` },
        }),
      }),
      this.envoyer({
        to: r.client.email,
        replyTo: this.expediteur,
        subject: `Votre demande de réservation - ${r.residence.nom}`,
        html: this.gabarit({
          titre: 'Nous avons bien reçu votre demande',
          prevue: `Votre demande pour ${r.residence.nom} est enregistrée. Aucun paiement n'a été effectué.`,
          contenu: `<p style="margin:0 0 12px;">Bonjour ${esc(r.client.prenom)},</p>
            <p style="margin:0 0 12px;">Merci pour votre demande. Nous vérifions la disponibilité et revenons vers vous rapidement par email. Aucun paiement n'a été effectué.</p>
            ${this.details(this.lignesSejour(avecResidence))}
            <p style="margin:0;">Une fois votre séjour confirmé, vous pourrez régler l'acompte en ligne depuis « Mes réservations ».</p>`,
          bouton: { texte: 'Suivre ma réservation', url: this.lienGestion(r.client.email) },
          note: `Vous pouvez aussi retrouver votre réservation sur le site avec votre email et la référence ${esc(r.id)}.`,
        }),
      }),
    ]);
    return true;
  }

  // ---------- Accès client ----------

  async sendLienAcces(email) {
    const jeton = AuthService.creerJetonClient(email, { dureeMs: 24 * 60 * 60 * 1000 });
    await this.envoyer({
      to: email,
      subject: `Accès à vos réservations - ${this.nomEtablissement}`,
      html: this.gabarit({
        titre: 'Accédez à vos réservations',
        prevue: 'Votre lien d\'accès personnel, valable 24 heures.',
        contenu: `<p style="margin:0 0 12px;">Bonjour,</p>
          <p style="margin:0;">Vous avez demandé à consulter vos réservations. Le bouton ci-dessous vous y donne accès : suivi, paiement et demande d'annulation.</p>`,
        bouton: { texte: 'Voir mes réservations', url: `${urlSite()}/mes-reservations?acces=${encodeURIComponent(jeton)}` },
        note: 'Ce lien est valable 24 heures. Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet email.',
      }),
    });
  }

  // ---------- Statut de la réservation ----------

  async sendStatusEmail(reservation, { message = null } = {}) {
    const confirmee = reservation.statut === 'confirmee';
    const nomResidence = reservation.residenceInfo?.nom || 'votre résidence';
    await this.envoyer({
      to: reservation.client.email,
      replyTo: this.expediteur,
      subject: confirmee ? `Réservation confirmée - ${nomResidence}` : `Réservation annulée - ${nomResidence}`,
      html: this.generateStatusEmailHTML(reservation, message),
    });
  }

  generateStatusEmailHTML(r, message = null) {
    const confirmee = r.statut === 'confirmee';
    const acompte = require('./paiement/acompte');
    const etat = acompte.etatAcompte(r);
    const blocs = [];

    if (message) blocs.push(`<p style="margin:0 0 12px;"><strong>Message de notre équipe :</strong> ${esc(message)}</p>`);

    if (confirmee && etat.possible) {
      blocs.push(`<p style="margin:0 0 8px;">Pour garantir votre séjour, réglez un acompte de <strong>${fcfa(etat.montant)}</strong> (${etat.pourcentage} % du séjour)
        ${phraseMoyensDisponibles(etat.moyens)}.</p>
        <p style="margin:0;">Le solde se règle ensuite en ligne ou à votre arrivée.</p>`);
    }

    if (!confirmee) {
      if (r.acompte?.paye) blocs.push(`<p style="margin:0 0 12px;">${phraseRemboursementAcompte(r)}</p>`);
      if (r.solde?.paye) blocs.push(`<p style="margin:0 0 12px;">Le solde de ${fcfa(r.solde.montant)} que vous aviez réglé vous sera intégralement remboursé par notre équipe, qui vous contactera.</p>`);
    }

    return this.gabarit({
      titre: confirmee ? 'Votre réservation est confirmée' : 'Votre réservation est annulée',
      prevue: confirmee ? `${r.residenceInfo?.nom || 'Votre résidence'} vous attend.` : 'Votre réservation a été annulée.',
      contenu: `<p style="margin:0 0 12px;">Bonjour ${esc(r.client.prenom)},</p>
        <p style="margin:0 0 12px;">${confirmee
          ? 'Bonne nouvelle : votre séjour est confirmé. Nous avons hâte de vous accueillir.'
          : 'Votre réservation a été annulée. N\'hésitez pas à nous contacter ou à choisir d\'autres dates.'}</p>
        ${this.details(this.lignesSejour(r))}
        ${blocs.join('')}`,
      bouton: confirmee
        ? { texte: etat.possible ? 'Payer l\'acompte' : 'Gérer ma réservation', url: this.lienGestion(r.client.email) }
        : { texte: 'Voir nos résidences', url: `${urlSite()}/residences` },
    });
  }

  // ---------- Annulation ----------

  async sendDemandeAnnulationAdmin(r) {
    await this.envoyer({
      to: this.destinataireAdmin,
      replyTo: r.client.email,
      subject: `Demande d'annulation - ${r.client.prenom} ${r.client.nom} (${r.residenceInfo?.nom})`,
      html: this.gabarit({
        titre: 'Demande d\'annulation',
        prevue: `${r.client.prenom} ${r.client.nom} demande l'annulation de son séjour.`,
        contenu: `<p style="margin:0 0 12px;"><strong>${esc(r.client.prenom)} ${esc(r.client.nom)}</strong> demande l'annulation de son séjour.</p>
          ${this.details([
            ...this.lignesSejour(r),
            ['Client', `<a href="mailto:${esc(r.client.email)}" style="color:${ACCENT};">${esc(r.client.email)}</a><br>${esc(r.client.telephone)}`],
            ['Motif', r.demandeAnnulation?.motif ? esc(r.demandeAnnulation.motif) : '<span style="color:#8A8F93;">Non précisé</span>'],
            r.acompte?.paye ? ['Acompte', `${fcfa(r.acompte.montant)} payé ${libelleMoyen(r.acompte.methode)}`] : null,
            r.solde?.paye ? ['Solde', `${fcfa(r.solde.montant)} déjà réglé`] : null,
          ])}
          <p style="margin:0;">Acceptez ou refusez la demande depuis le tableau de bord.</p>`,
        bouton: { texte: 'Ouvrir le tableau de bord', url: `${urlSite()}/admin/reservations` },
      }),
    });
  }

  async sendRefusAnnulation(r) {
    await this.envoyer({
      to: r.client.email,
      replyTo: this.expediteur,
      subject: `Votre demande d'annulation - ${r.residenceInfo?.nom}`,
      html: this.gabarit({
        titre: 'Votre réservation est maintenue',
        prevue: 'Votre demande d\'annulation n\'a pas pu être acceptée.',
        contenu: `<p style="margin:0 0 12px;">Bonjour ${esc(r.client.prenom)},</p>
          <p style="margin:0 0 12px;">Votre demande d'annulation n'a pas pu être acceptée : votre réservation est maintenue.</p>
          ${r.demandeAnnulation?.reponse ? `<p style="margin:0 0 12px;"><strong>Message de notre équipe :</strong> ${esc(r.demandeAnnulation.reponse)}</p>` : ''}
          ${this.details(this.lignesSejour(r))}
          <p style="margin:0;">Pour en discuter, répondez simplement à cet email.</p>`,
        bouton: { texte: 'Gérer ma réservation', url: this.lienGestion(r.client.email) },
      }),
    });
  }

  // ---------- Acompte ----------

  async sendAcompteRecu(r) {
    const a = r.acompte;
    const reste = Math.max(0, (Number(r.prixTotal) || 0) - (Number(a.montant) || 0));
    await this.envoyer({
      to: r.client.email,
      replyTo: this.expediteur,
      subject: `Reçu de votre acompte - ${r.residenceInfo?.nom}`,
      html: this.gabarit({
        titre: 'Acompte reçu, votre séjour est garanti',
        prevue: `Nous avons bien reçu votre acompte de ${fcfa(a.montant)}.`,
        contenu: `<p style="margin:0 0 12px;">Bonjour ${esc(r.client.prenom)},</p>
          <p style="margin:0 0 12px;">Nous avons bien reçu votre acompte. Votre séjour est garanti.</p>
          ${this.details([
            ...this.lignesSejour(r),
            ['Acompte réglé', `<strong>${fcfa(a.montant)}</strong>`],
            ['Moyen de paiement', esc(nomMoyen(a.methode))],
            ['Date du paiement', date(a.payeLe)],
            ['Référence du paiement', esc(referencePaiement(a))],
            ['Reste à régler', `<strong>${fcfa(reste)}</strong>`],
          ])}
          <p style="margin:0;">Le solde de ${fcfa(reste)} se règle en ligne depuis « Mes réservations » ou à votre arrivée, comme vous le préférez.</p>`,
        bouton: { texte: 'Gérer ma réservation', url: this.lienGestion(r.client.email) },
        note: esc(acompteConditions()),
      }),
    });
  }

  async sendAcompteRecuAdmin(r) {
    const a = r.acompte;
    await this.envoyer({
      to: this.destinataireAdmin,
      replyTo: r.client.email,
      subject: `Acompte reçu - ${r.client.prenom} ${r.client.nom} (${fcfa(a.montant)})`,
      html: this.gabarit({
        titre: 'Acompte reçu',
        prevue: `${r.client.prenom} ${r.client.nom} a réglé ${fcfa(a.montant)}.`,
        contenu: `<p style="margin:0 0 12px;"><strong>${esc(r.client.prenom)} ${esc(r.client.nom)}</strong> a réglé l'acompte de son séjour.</p>
          ${this.details([
            ...this.lignesSejour(r),
            ['Acompte', `<strong>${fcfa(a.montant)}</strong>`],
            ['Moyen de paiement', esc(nomMoyen(a.methode))],
            ['Référence', esc(referencePaiement(a, { admin: true }))],
          ])}`,
        bouton: { texte: 'Ouvrir le tableau de bord', url: `${urlSite()}/admin/reservations` },
      }),
    });
  }

  async sendRemboursementEffectue(r) {
    const a = r.acompte;
    const rb = a.remboursement || {};
    const partiel = rb.pourcentage && rb.pourcentage < 100;
    await this.envoyer({
      to: r.client.email,
      replyTo: this.expediteur,
      subject: `Remboursement de votre acompte - ${r.residenceInfo?.nom}`,
      html: this.gabarit({
        titre: 'Votre acompte a été remboursé',
        prevue: `${fcfa(rb.montant ?? a.montant)} vous ont été remboursés.`,
        contenu: `<p style="margin:0 0 12px;">Bonjour ${esc(r.client.prenom)},</p>
          <p style="margin:0 0 12px;">Suite à l'annulation de votre réservation, nous vous avons remboursé ${partiel ? `${rb.pourcentage} % de votre acompte, conformément aux conditions d'annulation` : 'votre acompte'}.</p>
          ${this.details([
            ['Référence', esc(r.id)],
            ['Résidence', esc(r.residenceInfo?.nom)],
            ['Montant remboursé', `<strong>${fcfa(rb.montant ?? a.montant)}</strong>${partiel ? ` <span style="color:#8A8F93;">sur ${fcfa(a.montant)}</span>` : ''}`],
            ['Remboursé', esc(libelleRemboursement(a))],
            rb.reference ? ['Référence du remboursement', esc(rb.reference)] : null,
          ])}
          <p style="margin:0;">Selon votre banque ou votre opérateur, le montant peut apparaître sur votre compte sous quelques heures.</p>`,
      }),
    });
  }

  // ---------- Solde ----------

  async sendSoldeRecu(r) {
    const s = r.solde;
    await this.envoyer({
      to: r.client.email,
      replyTo: this.expediteur,
      subject: `Reçu de paiement : séjour réglé - ${r.residenceInfo?.nom}`,
      html: this.gabarit({
        titre: 'Votre séjour est entièrement réglé',
        prevue: `Nous avons bien reçu le solde de ${fcfa(s.montant)}.`,
        contenu: `<p style="margin:0 0 12px;">Bonjour ${esc(r.client.prenom)},</p>
          <p style="margin:0 0 12px;">Nous avons bien reçu le solde de votre séjour. Rien ne vous sera demandé à l'arrivée.</p>
          ${this.details([
            ...this.lignesSejour(r),
            ['Acompte', fcfa(r.acompte?.montant)],
            ['Solde réglé', `<strong>${fcfa(s.montant)}</strong>`],
            ['Moyen de paiement', esc(nomMoyen(s.methode))],
            ['Date du paiement', date(s.payeLe)],
            ['Référence du paiement', esc(s.reference || s.txId)],
          ])}`,
        bouton: { texte: 'Gérer ma réservation', url: this.lienGestion(r.client.email) },
      }),
    });
  }

  async sendSoldeRecuAdmin(r) {
    const s = r.solde;
    await this.envoyer({
      to: this.destinataireAdmin,
      replyTo: r.client.email,
      subject: `Solde reçu - ${r.client.prenom} ${r.client.nom} (${fcfa(s.montant)})`,
      html: this.gabarit({
        titre: 'Solde reçu en ligne',
        prevue: `Le séjour de ${r.client.prenom} ${r.client.nom} est entièrement réglé.`,
        contenu: `<p style="margin:0 0 12px;"><strong>${esc(r.client.prenom)} ${esc(r.client.nom)}</strong> a réglé le solde : le séjour est entièrement payé.</p>
          ${this.details([
            ...this.lignesSejour(r),
            ['Solde', `<strong>${fcfa(s.montant)}</strong>`],
            ['Moyen de paiement', esc(nomMoyen(s.methode))],
            ['Référence', esc(s.reference || s.txId)],
          ])}`,
        bouton: { texte: 'Ouvrir le tableau de bord', url: `${urlSite()}/admin/reservations` },
      }),
    });
  }

  async sendRappelSolde(r) {
    const reste = Math.max(0, (Number(r.prixTotal) || 0) - (Number(r.acompte?.montant) || 0));
    const etat = require('./paiement/acompte').etatSolde(r);
    await this.envoyer({
      to: r.client.email,
      replyTo: this.expediteur,
      subject: `Votre séjour approche - ${r.residenceInfo?.nom}`,
      html: this.gabarit({
        titre: 'Votre séjour approche',
        prevue: `Arrivée le ${date(r.dates.arrivee)}. Il reste ${fcfa(reste)} à régler.`,
        contenu: `<p style="margin:0 0 12px;">Bonjour ${esc(r.client.prenom)},</p>
          <p style="margin:0 0 12px;">Nous avons hâte de vous accueillir le ${date(r.dates.arrivee)}. Il reste <strong>${fcfa(reste)}</strong> à régler pour votre séjour.</p>
          ${this.details(this.lignesSejour(r))}
          <p style="margin:0;">${etat.moyens?.length
            ? `Vous pouvez le régler dès maintenant en ligne ${phraseMoyensDisponibles(etat.moyens)}, ou à votre arrivée.`
            : 'Il se règle à votre arrivée.'}</p>`,
        bouton: etat.moyens?.length ? { texte: 'Payer le solde en ligne', url: this.lienGestion(r.client.email) } : null,
      }),
    });
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
