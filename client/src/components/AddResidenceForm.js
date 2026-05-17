import React, { useState } from 'react';
import { FaPlus, FaTimes, FaUpload, FaTrash } from 'react-icons/fa';
import './AddResidenceForm.css';

// Liste des équipements disponibles
const AVAILABLE_AMENITIES = [
  'Climatisation',
  'WiFi',
  'TV écran plat',
  'Cuisine équipée',
  'Balcon',
  'Terrasse',
  'Jardin',
  'Parking',
  'Parking privé',
  'Piscine',
  'Jacuzzi',
  'Salle de sport',
  'Ascenseur',
  'Sécurité 24h',
  'Gardien',
  'Ménage',
  'Conciergerie',
  'Vue mer',
  'Vue lagune',
  'Vue ville',
  'Coffre-fort',
  'Kitchenette',
  'Cave',
  'BBQ',
  'Smart Home',
  'Interphone',
  'Eau chaude',
  'Ventilateur',
  'TV satellite',
  'Double hauteur'
];

const AddResidenceForm = ({ onAddResidence, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    reference: '',
    type: '',
    description: '',
    location: '',
    city: '',
    neighborhood: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    maxGuests: '',
    surface: '',
    amenities: [],
    images: ['/images/residence1.jpg'], // Image par défaut
    availability: {
      status: 'disponible',
      nextAvailable: null,
      currentOccupant: null,
      checkIn: null,
      checkOut: null
    }
  });

  const [errors, setErrors] = useState({});
  const [selectedImages, setSelectedImages] = useState([]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Effacer l'erreur quand l'utilisateur commence à taper
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleAmenitiesChange = (e) => {
    const selectedAmenity = e.target.value;
    if (selectedAmenity && !formData.amenities.includes(selectedAmenity)) {
      setFormData(prev => ({
        ...prev,
        amenities: [...prev.amenities, selectedAmenity]
      }));
    }
    // Reset la sélection
    e.target.value = '';
  };

  const removeAmenity = (amenityToRemove) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.filter(amenity => amenity !== amenityToRemove)
    }));
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const imageUrls = files.map(file => URL.createObjectURL(file));
    setSelectedImages(prev => [...prev, ...imageUrls]);
  };

  const removeImage = (indexToRemove) => {
    setSelectedImages(prev => {
      const newImages = prev.filter((_, index) => index !== indexToRemove);
      return newImages;
    });
  };

  const triggerFileInput = () => {
    document.getElementById('image-input').click();
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Le nom est requis';
    if (!formData.reference.trim()) newErrors.reference = 'La référence est requise';
    if (!formData.type.trim()) newErrors.type = 'Le type est requis';
    if (!formData.description.trim()) newErrors.description = 'La description est requise';
    if (!formData.location.trim()) newErrors.location = 'La localisation est requise';
    if (!formData.city.trim()) newErrors.city = 'La ville est requise';
    if (!formData.neighborhood.trim()) newErrors.neighborhood = 'Le quartier est requis';
    if (!formData.price || formData.price <= 0) newErrors.price = 'Le prix doit être supérieur à 0';
    if (!formData.bedrooms || formData.bedrooms < 1) newErrors.bedrooms = 'Nombre de chambres requis (minimum 1)';
    if (!formData.bathrooms || formData.bathrooms < 1) newErrors.bathrooms = 'Nombre de salles de bain requis (minimum 1)';
    if (!formData.maxGuests || formData.maxGuests < 1) newErrors.maxGuests = 'Nombre maximum d\'invités requis (minimum 1)';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      // Générer un ID unique
      const newId = Date.now(); // Simple ID basé sur le timestamp
      
      const newResidence = {
        id: newId,
        name: formData.name.trim(),
        reference: formData.reference.trim(),
        type: formData.type.trim(),
        description: formData.description.trim(),
        location: formData.location.trim(),
        city: formData.city.trim(),
        neighborhood: formData.neighborhood.trim(),
        price: parseInt(formData.price),
        currency: 'FCFA',
        period: 'nuit',
        bedrooms: parseInt(formData.bedrooms),
        bathrooms: parseInt(formData.bathrooms),
        maxGuests: parseInt(formData.maxGuests),
        rating: 4.5,
        available: true,
        images: formData.images,
        amenities: formData.amenities,
        availability: formData.availability
      };

      onAddResidence(newResidence);
      onClose();
    }
  };

  return (
    <div className="add-residence-overlay">
      <div className="add-residence-modal">
        <div className="add-residence-header">
          <h2>Ajouter une nouvelle résidence</h2>
          <button className="close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-residence-form">
          <div className="form-row">
            <div className="form-group">
              <label>Nom de la résidence *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Ex: Villa Luxe Cocody"
                className={errors.name ? 'error' : ''}
              />
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label>Référence *</label>
              <input
                type="text"
                name="reference"
                value={formData.reference}
                onChange={handleInputChange}
                placeholder="Ex: RES-011"
                className={errors.reference ? 'error' : ''}
              />
              {errors.reference && <span className="error-message">{errors.reference}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Type *</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleInputChange}
                className={errors.type ? 'error' : ''}
              >
                <option value="">Sélectionner un type</option>
                <option value="Appartement Luxe">Appartement Luxe</option>
                <option value="Villa">Villa</option>
                <option value="Studio">Studio</option>
                <option value="Duplex">Duplex</option>
                <option value="Penthouse">Penthouse</option>
              </select>
              {errors.type && <span className="error-message">{errors.type}</span>}
            </div>

            <div className="form-group">
              <label>Prix par nuit (FCFA) *</label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleInputChange}
                placeholder="Ex: 45000"
                className={errors.price ? 'error' : ''}
              />
              {errors.price && <span className="error-message">{errors.price}</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Description *</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Décrivez la résidence..."
              rows="3"
              className={errors.description ? 'error' : ''}
            />
            {errors.description && <span className="error-message">{errors.description}</span>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Localisation *</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleInputChange}
                placeholder="Ex: Rue des Banques, Plateau"
                className={errors.location ? 'error' : ''}
              />
              {errors.location && <span className="error-message">{errors.location}</span>}
            </div>

            <div className="form-group">
              <label>Ville *</label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="Ex: Abidjan"
                className={errors.city ? 'error' : ''}
              />
              {errors.city && <span className="error-message">{errors.city}</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Quartier *</label>
              <input
                type="text"
                name="neighborhood"
                value={formData.neighborhood}
                onChange={handleInputChange}
                placeholder="Ex: Plateau"
                className={errors.neighborhood ? 'error' : ''}
              />
              {errors.neighborhood && <span className="error-message">{errors.neighborhood}</span>}
            </div>

            <div className="form-group">
              <label>Surface (m²)</label>
              <input
                type="number"
                name="surface"
                value={formData.surface}
                onChange={handleInputChange}
                placeholder="Ex: 85"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Nombre de chambres *</label>
              <input
                type="number"
                name="bedrooms"
                value={formData.bedrooms}
                onChange={handleInputChange}
                min="1"
                className={errors.bedrooms ? 'error' : ''}
              />
              {errors.bedrooms && <span className="error-message">{errors.bedrooms}</span>}
            </div>

            <div className="form-group">
              <label>Nombre de salles de bain *</label>
              <input
                type="number"
                name="bathrooms"
                value={formData.bathrooms}
                onChange={handleInputChange}
                min="1"
                className={errors.bathrooms ? 'error' : ''}
              />
              {errors.bathrooms && <span className="error-message">{errors.bathrooms}</span>}
            </div>

            <div className="form-group">
              <label>Maximum d'invités *</label>
              <input
                type="number"
                name="maxGuests"
                value={formData.maxGuests}
                onChange={handleInputChange}
                min="1"
                className={errors.maxGuests ? 'error' : ''}
              />
              {errors.maxGuests && <span className="error-message">{errors.maxGuests}</span>}
            </div>
          </div>

          <div className="form-group">
            <label>Équipements et commodités</label>
            
            {/* Liste déroulante pour ajouter des équipements */}
            <select
              onChange={handleAmenitiesChange}
              className="amenities-select"
            >
              <option value="">Sélectionner un équipement...</option>
              {AVAILABLE_AMENITIES
                .filter(amenity => !formData.amenities.includes(amenity))
                .map(amenity => (
                  <option key={amenity} value={amenity}>
                    {amenity}
                  </option>
                ))
              }
            </select>
            
            {/* Affichage des équipements sélectionnés */}
            {formData.amenities.length > 0 && (
              <div className="selected-amenities">
                <label>Équipements sélectionnés :</label>
                <div className="amenities-list">
                  {formData.amenities.map(amenity => (
                    <span key={amenity} className="amenity-tag">
                      {amenity}
                      <button
                        type="button"
                        onClick={() => removeAmenity(amenity)}
                        className="remove-amenity-btn"
                        title="Supprimer cet équipement"
                      >
                        <FaTrash />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <small>Sélectionnez les équipements disponibles dans la liste déroulante</small>
          </div>

          <div className="form-group">
            <label>Images</label>
            
            {/* Input file caché */}
            <input
              type="file"
              id="image-input"
              multiple
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            
            {/* Zone de drop et bouton d'upload */}
            <div className="image-upload-area" onClick={triggerFileInput}>
              <FaUpload className="upload-icon" />
              <span>Cliquez pour sélectionner des images</span>
              <small>ou glissez-déposez vos images ici</small>
            </div>
            
            {/* Affichage des images sélectionnées */}
            {selectedImages.length > 0 && (
              <div className="selected-images">
                <label>Images sélectionnées ({selectedImages.length}) :</label>
                <div className="images-preview">
                  {selectedImages.map((imageUrl, index) => (
                    <div key={index} className="image-preview-item">
                      <img src={imageUrl} alt={`Aperçu ${index + 1}`} />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="remove-image-btn"
                        title="Supprimer cette image"
                      >
                        <FaTimes />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <small>Formats acceptés : JPG, PNG, GIF. Taille max : 5MB par image</small>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Annuler
            </button>
            <button type="submit" className="btn-primary">
              <FaPlus /> Ajouter la résidence
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddResidenceForm;
