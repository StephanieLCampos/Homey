/**
 * FILTER PANEL COMPONENT - Filter controls for discovering potential matches
 * Provides filtering options based on user preferences like age, rent, cleanliness, etc.
 * Shows as a modal popup with various filter options that users can select.
 * Integrates with the discovery system to filter potential matches based on criteria.
 * Includes reset functionality and clear visual indicators for active filters.
 */
import React, { useState } from 'react';

export interface FilterOptions {
  minAge?: number;
  maxAge?: number;
  maxRent?: number;
  cleanlinessLevel?: number;
  noiseTolerance?: number;
  petFriendly?: boolean | null; // null = no preference
  smokingAllowed?: boolean | null; // null = no preference
  preferredGender?: string[];
  city?: string;
  state?: string;
}

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilters: (filters: FilterOptions) => void;
  currentFilters: FilterOptions;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ 
  isOpen, 
  onClose, 
  onApplyFilters, 
  currentFilters 
}) => {
  const [filters, setFilters] = useState<FilterOptions>(currentFilters);

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleGenderChange = (gender: string, checked: boolean) => {
    const currentGenders = filters.preferredGender || [];
    let newGenders;
    
    if (checked) {
      newGenders = [...currentGenders, gender];
    } else {
      newGenders = currentGenders.filter(g => g !== gender);
    }
    
    setFilters(prev => ({
      ...prev,
      preferredGender: newGenders
    }));
  };

  const handleApply = () => {
    onApplyFilters(filters);
    onClose();
  };

  const handleReset = () => {
    const resetFilters: FilterOptions = {
      minAge: undefined,
      maxAge: undefined,
      maxRent: undefined,
      cleanlinessLevel: undefined,
      noiseTolerance: undefined,
      petFriendly: null,
      smokingAllowed: null,
      preferredGender: [],
      city: undefined,
      state: undefined
    };
    setFilters(resetFilters);
  };

  const hasActiveFilters = () => {
    return Object.values(filters).some(value => 
      value !== undefined && 
      value !== null && 
      (Array.isArray(value) ? value.length > 0 : true)
    );
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '30px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '25px'
        }}>
          <h2 style={{ margin: 0, color: '#2c3e50' }}>Filter Matches</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#7f8c8d',
              padding: '0'
            }}
          >
            ×
          </button>
        </div>

        {/* Age Range */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Age Range
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="number"
              placeholder="Min"
              value={filters.minAge || ''}
              onChange={(e) => handleFilterChange('minAge', e.target.value ? parseInt(e.target.value) : undefined)}
              style={{
                padding: '8px 12px',
                border: '2px solid #ecf0f1',
                borderRadius: '8px',
                width: '80px'
              }}
            />
            <span style={{ color: '#7f8c8d' }}>to</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.maxAge || ''}
              onChange={(e) => handleFilterChange('maxAge', e.target.value ? parseInt(e.target.value) : undefined)}
              style={{
                padding: '8px 12px',
                border: '2px solid #ecf0f1',
                borderRadius: '8px',
                width: '80px'
              }}
            />
          </div>
        </div>

        {/* Max Rent */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Max Rent
          </label>
          <input
            type="number"
            placeholder="Enter max rent"
            value={filters.maxRent || ''}
            onChange={(e) => handleFilterChange('maxRent', e.target.value ? parseInt(e.target.value) : undefined)}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ecf0f1',
              borderRadius: '8px'
            }}
          />
        </div>

        {/* Gender Preference */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Gender Preference
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {['male', 'female', 'non-binary', 'other'].map(gender => (
              <label key={gender} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={filters.preferredGender?.includes(gender) || false}
                  onChange={(e) => handleGenderChange(gender, e.target.checked)}
                />
                <span style={{ textTransform: 'capitalize' }}>{gender}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Cleanliness Level */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Minimum Cleanliness Level
          </label>
          <select
            value={filters.cleanlinessLevel || ''}
            onChange={(e) => handleFilterChange('cleanlinessLevel', e.target.value ? parseInt(e.target.value) : undefined)}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ecf0f1',
              borderRadius: '8px'
            }}
          >
            <option value="">Any</option>
            <option value="1">1 - Very messy</option>
            <option value="2">2 - Somewhat messy</option>
            <option value="3">3 - Moderate</option>
            <option value="4">4 - Pretty clean</option>
            <option value="5">5 - Very clean</option>
          </select>
        </div>

        {/* Noise Tolerance */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Minimum Noise Tolerance
          </label>
          <select
            value={filters.noiseTolerance || ''}
            onChange={(e) => handleFilterChange('noiseTolerance', e.target.value ? parseInt(e.target.value) : undefined)}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ecf0f1',
              borderRadius: '8px'
            }}
          >
            <option value="">Any</option>
            <option value="1">1 - Very quiet only</option>
            <option value="2">2 - Mostly quiet</option>
            <option value="3">3 - Moderate noise OK</option>
            <option value="4">4 - Pretty tolerant</option>
            <option value="5">5 - Very tolerant</option>
          </select>
        </div>

        {/* Pet Friendly */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Pet Friendly
          </label>
          <select
            value={filters.petFriendly === null ? '' : filters.petFriendly?.toString()}
            onChange={(e) => {
              const value = e.target.value;
              handleFilterChange('petFriendly', value === '' ? null : value === 'true');
            }}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ecf0f1',
              borderRadius: '8px'
            }}
          >
            <option value="">No preference</option>
            <option value="true">Pet friendly only</option>
            <option value="false">No pets</option>
          </select>
        </div>

        {/* Smoking Allowed */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Smoking Policy
          </label>
          <select
            value={filters.smokingAllowed === null ? '' : filters.smokingAllowed?.toString()}
            onChange={(e) => {
              const value = e.target.value;
              handleFilterChange('smokingAllowed', value === '' ? null : value === 'true');
            }}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid #ecf0f1',
              borderRadius: '8px'
            }}
          >
            <option value="">No preference</option>
            <option value="true">Smoking allowed</option>
            <option value="false">No smoking</option>
          </select>
        </div>

        {/* Location */}
        <div style={{ marginBottom: '25px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Location
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="City"
              value={filters.city || ''}
              onChange={(e) => handleFilterChange('city', e.target.value || undefined)}
              style={{
                flex: 1,
                padding: '12px',
                border: '2px solid #ecf0f1',
                borderRadius: '8px'
              }}
            />
            <input
              type="text"
              placeholder="State"
              value={filters.state || ''}
              onChange={(e) => handleFilterChange('state', e.target.value || undefined)}
              style={{
                width: '80px',
                padding: '12px',
                border: '2px solid #ecf0f1',
                borderRadius: '8px'
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: '15px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={handleReset}
            disabled={!hasActiveFilters()}
            style={{
              padding: '12px 20px',
              border: '2px solid #e74c3c',
              background: 'white',
              color: '#e74c3c',
              borderRadius: '25px',
              cursor: hasActiveFilters() ? 'pointer' : 'not-allowed',
              opacity: hasActiveFilters() ? 1 : 0.5
            }}
          >
            Reset
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '12px 20px',
              border: '2px solid #95a5a6',
              background: 'white',
              color: '#95a5a6',
              borderRadius: '25px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'linear-gradient(45deg, #74b9ff, #0984e3)',
              color: 'white',
              borderRadius: '25px',
              cursor: 'pointer'
            }}
          >
            Apply Filters
          </button>
        </div>

        {/* Active filters count */}
        {hasActiveFilters() && (
          <div style={{
            marginTop: '15px',
            padding: '8px 12px',
            background: '#e8f4f8',
            borderRadius: '8px',
            color: '#2c3e50',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            {Object.values(filters).filter(v => v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true)).length} filter(s) active
          </div>
        )}
      </div>
    </div>
  );
};

export default FilterPanel;