import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, SlidersHorizontal, BookOpen, MapPin, RefreshCw, AlertTriangle } from 'lucide-react';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Chip from '../components/common/Chip';
import Skeleton from '../components/common/Skeleton';
import EmptyState from '../components/common/EmptyState';
import { BOOK_CATEGORIES, formatRupees, getListingImageUrl, matchesInstitutionType } from '../lib/utils';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import './SearchPage.css';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const initialCategory = searchParams.get('category') || '';

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedInstitutionType, setSelectedInstitutionType] = useState(''); // '' | 'School' | 'College' | 'Other'
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'price_asc' | 'price_desc'
  const [showFilters, setShowFilters] = useState(false);

  const [institutions, setInstitutions] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Fetch active institutions for the filter dropdown
  useEffect(() => {
    async function loadInstitutions() {
      if (!isSupabaseConfigured) return;
      try {
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name, city, area, institution_type')
          .eq('is_active', true)
          .order('name');
        if (!error && data) setInstitutions(data);
      } catch (err) {
        console.error('Failed to load institutions:', err);
      }
    }
    loadInstitutions();
  }, []);

  // Filter available institution dropdown options according to selected institution type
  let filteredInstitutions = institutions.filter((inst) => {
    if (!selectedInstitutionType) return true;
    return matchesInstitutionType(inst, selectedInstitutionType);
  });

  if (filteredInstitutions.length === 0) {
    filteredInstitutions = institutions;
  }

  // Fetch listings based on filters
  const searchListings = async () => {
    setLoading(true);
    setFetchError(null);

    try {
      if (!isSupabaseConfigured) {
        setListings([]);
        setLoading(false);
        return;
      }

      // Query active listings strictly (sold and removed listings are excluded)
      let dbQuery = supabase
        .from('listings')
        .select(`
          id,
          title,
          author,
          category,
          condition,
          price_paise,
          status,
          course_or_exam,
          created_at,
          institutions (id, name, area, institution_type),
          listing_images (storage_path, display_order)
        `)
        .eq('status', 'active');

      // Category filter
      if (selectedCategory) {
        dbQuery = dbQuery.eq('category', selectedCategory);
      }

      // Specific Institution filter
      if (selectedInstitution) {
        dbQuery = dbQuery.eq('institution_id', selectedInstitution);
      }

      // Price range (converted to integer paise)
      if (minPrice && !isNaN(minPrice)) {
        dbQuery = dbQuery.gte('price_paise', Math.max(0, parseInt(minPrice, 10) * 100));
      }
      if (maxPrice && !isNaN(maxPrice)) {
        dbQuery = dbQuery.lte('price_paise', Math.max(0, parseInt(maxPrice, 10) * 100));
      }

      // Sorting
      if (sortBy === 'price_asc') {
        dbQuery = dbQuery.order('price_paise', { ascending: true });
      } else if (sortBy === 'price_desc') {
        dbQuery = dbQuery.order('price_paise', { ascending: false });
      } else {
        dbQuery = dbQuery.order('created_at', { ascending: false });
      }

      const { data, error } = await dbQuery;
      if (error) throw error;

      let resultData = data || [];

      // Multi-field search across: title, author, subject, course/exam, institution name, and area
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        resultData = resultData.filter((item) => {
          const titleMatch = (item.title || '').toLowerCase().includes(q);
          const authorMatch = (item.author || '').toLowerCase().includes(q);
          const courseMatch = (item.course_or_exam || '').toLowerCase().includes(q);
          const categoryMatch = (item.category || '').toLowerCase().includes(q);
          const instMatch = (item.institutions?.name || '').toLowerCase().includes(q);
          const areaMatch = (item.institutions?.area || '').toLowerCase().includes(q);
          return titleMatch || authorMatch || courseMatch || categoryMatch || instMatch || areaMatch;
        });
      }

      // Filter by institution type (School vs College)
      if (selectedInstitutionType) {
        resultData = resultData.filter((item) =>
          matchesInstitutionType(item.institutions, selectedInstitutionType)
        );
      }

      setListings(resultData);
    } catch (err) {
      console.error('Search error:', err);
      setFetchError(err.message || 'Unable to perform search.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    searchListings();
  }, [query, selectedCategory, selectedInstitutionType, selectedInstitution, minPrice, maxPrice, sortBy]);

  const handleClearFilters = () => {
    setQuery('');
    setSelectedCategory('');
    setSelectedInstitutionType('');
    setSelectedInstitution('');
    setMinPrice('');
    setMaxPrice('');
    setSortBy('newest');
    setSearchParams({});
  };

  return (
    <div className="search-page">
      <div className="search-header">
        <h1 className="search-page-title">Browse Textbooks</h1>
        <p className="search-page-subtitle">Search across title, author, course, exam, and campus</p>
      </div>

      {/* Level Quick Filter Chips */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Chip
          label="All Levels"
          selected={selectedInstitutionType === ''}
          onClick={() => {
            setSelectedInstitutionType('');
            setSelectedInstitution('');
          }}
        />
        <Chip
          label="Schools & 1st-12th"
          selected={selectedInstitutionType === 'School'}
          onClick={() => {
            setSelectedInstitutionType(selectedInstitutionType === 'School' ? '' : 'School');
            setSelectedInstitution('');
          }}
        />
        <Chip
          label="Colleges & Universities"
          selected={selectedInstitutionType === 'College'}
          onClick={() => {
            setSelectedInstitutionType(selectedInstitutionType === 'College' ? '' : 'College');
            setSelectedInstitution('');
          }}
        />
      </div>

      {/* Main Search & Quick Controls */}
      <div className="search-controls-bar">
        <div className="search-input-field">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, author, subject, or college..."
            prefix={<SearchIcon size={18} />}
            aria-label="Search listings"
          />
        </div>

        <div className="search-actions-row">
          <Button
            variant={showFilters ? 'primary' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
            className="filter-toggle-btn"
          >
            <SlidersHorizontal size={16} />
            <span>Filters</span>
          </Button>

          <div className="sort-select-wrapper">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              placeholder=""
              options={[
                { value: 'newest', label: 'Newest Arrivals' },
                { value: 'price_asc', label: 'Price: Low to High' },
                { value: 'price_desc', label: 'Price: High to Low' },
              ]}
              aria-label="Sort listings"
            />
          </div>
        </div>
      </div>

      {/* Expandable Filter Tray */}
      {showFilters && (
        <Card className="filter-tray">
          <div className="filter-tray__grid">
            <Select
              label="Education Level"
              value={selectedInstitutionType}
              onChange={(e) => {
                setSelectedInstitutionType(e.target.value);
                setSelectedInstitution('');
              }}
              placeholder="All Levels (Schools & Colleges)"
              options={[
                { value: 'School', label: 'Schools & Junior Colleges (1st - 12th)' },
                { value: 'College', label: 'Colleges & Universities (Higher Ed)' },
                { value: 'Other', label: 'Coaching & Exam Prep' },
              ]}
            />

            <Select
              label={selectedInstitutionType === 'School' ? 'Specific School' : selectedInstitutionType === 'College' ? 'Specific College' : 'Specific Campus'}
              value={selectedInstitution}
              onChange={(e) => setSelectedInstitution(e.target.value)}
              placeholder={selectedInstitutionType ? `All ${selectedInstitutionType}s` : 'All Institutions'}
              options={filteredInstitutions.map((i) => ({
                value: i.id,
                label: `${i.name} (${i.area})`,
              }))}
            />

            <Select
              label="Category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              placeholder="All Categories"
              options={BOOK_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />

            <div className="price-inputs-row">
              <Input
                label="Min Price (₹)"
                type="number"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0"
              />
              <Input
                label="Max Price (₹)"
                type="number"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="₹ max"
              />
            </div>
          </div>

          <div className="filter-tray__footer">
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Reset All Filters
            </Button>
          </div>
        </Card>
      )}

      {/* Results Section */}
      <section className="search-results-section">
        {fetchError && (
          <Card style={{ textAlign: 'center', padding: 'var(--space-6)', borderColor: 'var(--color-danger)' }}>
            <div style={{ display: 'inline-flex', color: 'var(--color-danger)', marginBottom: 'var(--space-2)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Search query failed
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              {fetchError}
            </p>
            <Button variant="secondary" size="sm" onClick={searchListings}>
              <RefreshCw size={14} />
              <span>Retry Search</span>
            </Button>
          </Card>
        )}

        {loading && !fetchError && (
          <div className="listings-grid">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        )}

        {!loading && !fetchError && listings.length > 0 && (
          <div className="listings-grid">
            {listings.map((item) => {
              const primaryImgPath = item.listing_images?.[0]?.storage_path;
              const imgUrl = getListingImageUrl(primaryImgPath);

              return (
                <Link key={item.id} to={`/listings/${item.id}`} className="listing-card-link">
                  <Card hoverable className="listing-card">
                    <div className="listing-card__image-container">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={item.title}
                          loading="lazy"
                          className="listing-card__image"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div
                        className="listing-card__image-fallback"
                        style={{ display: imgUrl ? 'none' : 'flex' }}
                      >
                        <BookOpen size={36} />
                      </div>
                      <div className="listing-card__condition-badge">
                        <Chip variant="default">{item.condition}</Chip>
                      </div>
                    </div>
                    <div className="listing-card__content">
                      <div className="listing-card__price-row">
                        <span className="listing-card__price">{formatRupees(item.price_paise)}</span>
                        <span className="listing-card__category">{item.category}</span>
                      </div>
                      <h3 className="listing-card__title">{item.title}</h3>
                      {item.author && <p className="listing-card__author">by {item.author}</p>}
                      <div className="listing-card__footer">
                        <MapPin size={13} aria-hidden="true" />
                        <span>{item.institutions?.name || 'Local Campus'}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {!loading && !fetchError && listings.length === 0 && (
          <EmptyState
            title="No matching books found"
            description="Try clearing your filters or searching with broader keywords like course or subject."
            actionLabel="Reset Search & Filters"
            onAction={handleClearFilters}
          />
        )}
      </section>
    </div>
  );
}
