/**
 * FILTER PANEL COMPONENT
 *
 * Modal filter controls for the discovery deck: age range, budget, cleanliness,
 * noise, pets, smoking, gender, city and state, plus a profile-type switch that
 * limits the deck to individuals or to groups.
 *
 * The panel keeps its own working copy of the filters and only reports them
 * upward when Apply is pressed, so adjusting controls does not reload the deck
 * on every keystroke. A `useEffect` re-syncs that copy whenever the parent's
 * filters change, which keeps the panel correct if the filters are reset from
 * outside while it is closed.
 *
 * Three-state booleans are the notable subtlety: `petFriendly` and
 * `smokingAllowed` distinguish `null` ("no preference", the default) from
 * `true`/`false`. A plain boolean could not express "don't care", and would
 * silently exclude half the candidates.
 *
 * `FilterOptions` is exported from this file and is the shape the parent passes
 * to the API as query parameters.
 *
 * Props:
 *   isOpen         - whether the modal is shown; false renders nothing.
 *   onClose        - dismiss without applying.
 *   onApplyFilters - called with the working filters on Apply.
 *   currentFilters - the parent's active filters, mirrored into local state.
 *
 * Connections:
 *   - client/src/App.tsx - owns the filters and passes them to the API.
 *   - server/index.js    - GET /api/users/:id/potential-matches consumes these
 *                          as query parameters.
 *
 * Note: `profileType` is applied on the client, by filtering the assembled deck;
 * every other filter is applied by the server.
 */
import React, { useState, useEffect } from 'react';

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
  profileType?: 'all' | 'individual' | 'groups'; // new filter for profile type
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
  const [filters, setFilters] = useState<FilterOptions>({ ...currentFilters, profileType: currentFilters.profileType || 'all' });

  // Re-sync the working copy whenever the parent's filters change - for example
  // after an external reset - so a reopened panel reflects what is actually
  // being applied.
  useEffect(() => {
    setFilters({ ...currentFilters, profileType: currentFilters.profileType || 'all' });
  }, [currentFilters]);

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  /**
   * Add or remove one gender from the multi-select list. Handled separately from
   * the generic setter, which cannot express membership toggling.
   */
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

  /** Publish the working filters to the parent and dismiss the panel. */
  const handleApply = () => {
    onApplyFilters(filters);
    onClose();
  };

  /**
   * Clear every filter back to its neutral value. Note that the two tri-state
   * booleans reset to `null` ("no preference") rather than `false`, which would
   * be an active filter.
   *
   * Only the working copy is reset; the parent still sees the old filters until
   * Apply is pressed.
   */
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
      state: undefined,
      profileType: 'all'
    };
    setFilters(resetFilters);
  };

  /**
   * Whether any filter is currently set, used to badge the filter control.
   * A value counts as active when it is neither undefined nor null, and - for
   * the gender list - not empty.
   */
  const hasActiveFilters = () => {
    return Object.values(filters).some(value => 
      value !== undefined && 
      value !== null && 
      (Array.isArray(value) ? value.length > 0 : true)
    );
  };

  // Render nothing when closed. Returning null after the hooks above keeps the
  // hook order stable across renders, which is why the early return is placed
  // here rather than at the top of the component.
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

        {/* Profile Type Filter */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#2c3e50' }}>
            Profile Type
          </label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              { value: 'all', label: 'All Profiles', icon: '👥' },
              { value: 'individual', label: 'Individual Only', icon: '👤' },
              { value: 'groups', label: 'Groups Only', icon: '🏠' }
            ].map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => handleFilterChange('profileType', value)}
                style={{
                  padding: '10px 16px',
                  border: filters.profileType === value ? '2px solid #74b9ff' : '2px solid #ecf0f1',
                  borderRadius: '8px',
                  background: filters.profileType === value ? '#e8f4f8' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: filters.profileType === value ? '#0984e3' : '#2c3e50',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </div>
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