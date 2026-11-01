import React, { useState, useEffect, useRef } from 'react';
import { School, GraduationCap, Building2, Search, Check, ChevronDown, X, MapPin } from 'lucide-react';
import { matchesInstitutionType } from '../../lib/utils';

export default function SearchableInstitutionSelect({
  institutionType = 'College',
  onTypeChange,
  institutionId = '',
  onInstitutionChange,
  institutions = [],
  required = false,
  label = 'Educational Institution',
  helperText = 'Selecting your institution helps campus peers find nearby books.',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Filter institutions based on active tier (School / College / Others)
  let tierInstitutions = institutions.filter((item) => matchesInstitutionType(item, institutionType));
  if (tierInstitutions.length === 0) {
    tierInstitutions = institutions;
  }

  // Filter based on search query
  const searchFilteredInstitutions = tierInstitutions.filter((item) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = (item.name || '').toLowerCase().includes(term);
    const areaMatch = (item.area || '').toLowerCase().includes(term);
    const cityMatch = (item.city || '').toLowerCase().includes(term);
    return nameMatch || areaMatch || cityMatch;
  });

  // Find currently selected institution
  const selectedInstitution = institutions.find((i) => i.id === institutionId);

  const handleTypeSelect = (newType) => {
    if (onTypeChange) {
      onTypeChange(newType);
    }
    // If the selected institution does not match the new type, reset selection
    if (selectedInstitution && !matchesInstitutionType(selectedInstitution, newType)) {
      if (onInstitutionChange) onInstitutionChange('', null);
    }
  };

  const handleSelectInstitution = (inst) => {
    if (onInstitutionChange) {
      onInstitutionChange(inst.id, inst);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onInstitutionChange) {
      onInstitutionChange('', null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* 1. Education Tier Selector: School vs College vs Others */}
      <div>
        <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: 'var(--space-1)' }}>
          Category / Education Level {required && <span style={{ color: 'var(--color-error)' }}>*</span>}
        </label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-2)',
          }}
        >
          <button
            type="button"
            onClick={() => handleTypeSelect('School')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              border: `2px solid ${institutionType === 'School' ? 'var(--color-primary-navy)' : 'var(--color-border)'}`,
              backgroundColor: institutionType === 'School' ? 'var(--color-secondary-soft-blue)' : '#FFFFFF',
              color: 'var(--color-primary-navy)',
              fontWeight: 600,
              fontSize: 'var(--font-size-xs)',
              cursor: 'pointer',
              minHeight: '44px',
              transition: 'all 0.15s ease',
            }}
          >
            <School size={16} />
            <span>School</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeSelect('College')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              border: `2px solid ${institutionType === 'College' ? 'var(--color-primary-navy)' : 'var(--color-border)'}`,
              backgroundColor: institutionType === 'College' ? 'var(--color-secondary-soft-blue)' : '#FFFFFF',
              color: 'var(--color-primary-navy)',
              fontWeight: 600,
              fontSize: 'var(--font-size-xs)',
              cursor: 'pointer',
              minHeight: '44px',
              transition: 'all 0.15s ease',
            }}
          >
            <GraduationCap size={16} />
            <span>College</span>
          </button>

          <button
            type="button"
            onClick={() => handleTypeSelect('Other')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              border: `2px solid ${institutionType === 'Other' ? 'var(--color-primary-navy)' : 'var(--color-border)'}`,
              backgroundColor: institutionType === 'Other' ? 'var(--color-secondary-soft-blue)' : '#FFFFFF',
              color: 'var(--color-primary-navy)',
              fontWeight: 600,
              fontSize: 'var(--font-size-xs)',
              cursor: 'pointer',
              minHeight: '44px',
              transition: 'all 0.15s ease',
            }}
          >
            <Building2 size={16} />
            <span>Others / Coaching</span>
          </button>
        </div>
      </div>

      {/* 2. Searchable Dropdown */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: 'var(--space-1)' }}>
          {label} {required && <span style={{ color: 'var(--color-error)' }}>*</span>}
        </label>

        {/* Trigger Button */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: '100%',
            minHeight: '46px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${isOpen ? 'var(--color-primary-navy)' : 'var(--color-border)'}`,
            backgroundColor: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: isOpen ? '0 0 0 2px rgba(15, 23, 42, 0.1)' : 'none',
            transition: 'border-color 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
            <MapPin size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            {selectedInstitution ? (
              <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-primary-navy)' }}>
                  {selectedInstitution.name}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                  ({selectedInstitution.area || selectedInstitution.city || 'Indore'})
                </span>
              </div>
            ) : (
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                {institutionType === 'School'
                  ? 'Select your school...'
                  : institutionType === 'College'
                    ? 'Select your college / university...'
                    : 'Select your coaching academy...'}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
            {selectedInstitution && (
              <button
                type="button"
                onClick={handleClear}
                title="Clear selection"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                }}
              >
                <X size={14} />
              </button>
            )}
            <ChevronDown
              size={18}
              style={{
                color: 'var(--color-text-muted)',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            />
          </div>
        </div>

        {/* Dropdown Panel with Search Bar */}
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: 999,
              backgroundColor: '#FFFFFF',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '340px',
            }}
          >
            {/* Search Input Bar */}
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                borderBottom: '1px solid var(--color-border)',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Search size={16} style={{ color: 'var(--color-primary-navy)', flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search ${tierInstitutions.length} ${institutionType.toLowerCase()}s by name or area...`}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: 'var(--font-size-xs)',
                  fontFamily: 'inherit',
                  color: 'var(--color-text-main)',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    padding: '2px',
                    display: 'flex',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Institutions Scroll List */}
            <div
              style={{
                overflowY: 'auto',
                flex: 1,
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {searchFilteredInstitutions.length > 0 ? (
                searchFilteredInstitutions.map((inst) => {
                  const isSelected = inst.id === institutionId;

                  return (
                    <div
                      key={inst.id}
                      onClick={() => handleSelectInstitution(inst)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: isSelected ? 'var(--color-secondary-soft-blue)' : 'transparent',
                        color: isSelected ? 'var(--color-primary-navy)' : 'var(--color-text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'background-color 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = '#F1F5F9';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: isSelected ? 700 : 500, lineHeight: 1.3 }}>
                          {inst.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          {inst.area ? `${inst.area}, ` : ''}{inst.city || 'Indore'}
                        </div>
                      </div>

                      {isSelected && (
                        <div style={{ color: 'var(--color-primary-navy)', marginLeft: '8px', flexShrink: 0 }}>
                          <Check size={16} />
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                  No {institutionType.toLowerCase()}s found matching <strong>"{searchTerm}"</strong>.
                  <div style={{ marginTop: '4px', fontSize: '11px' }}>Try searching by campus area or check other level tabs.</div>
                </div>
              )}
            </div>

            {/* Footer Summary */}
            <div
              style={{
                padding: '6px 12px',
                borderTop: '1px solid var(--color-border)',
                backgroundColor: '#F8FAFC',
                fontSize: '11px',
                color: 'var(--color-text-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Showing {searchFilteredInstitutions.length} of {tierInstitutions.length} {institutionType.toLowerCase()}s</span>
              <span style={{ fontWeight: 600, color: 'var(--color-primary-navy)' }}>Indore Campus Directory</span>
            </div>
          </div>
        )}

        {helperText && (
          <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            {helperText}
          </p>
        )}
      </div>
    </div>
  );
}
