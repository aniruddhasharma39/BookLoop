import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ShieldCheck, MapPin, Users, BookOpen, RefreshCw, AlertTriangle } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Chip from '../components/common/Chip';
import Skeleton from '../components/common/Skeleton';
import EmptyState from '../components/common/EmptyState';
import { BOOK_CATEGORIES, formatRupees, getListingImageUrl } from '../lib/utils';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import './HomePage.css';

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [newestListings, setNewestListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const navigate = useNavigate();

  // Fetch real active listings from Supabase
  const fetchNewestListings = async () => {
    if (!isSupabaseConfigured) {
      setNewestListings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setFetchError(null);

      const { data, error } = await supabase
        .from('listings')
        .select(`
          id,
          title,
          author,
          category,
          condition,
          price_paise,
          status,
          created_at,
          institutions (id, name, area),
          listing_images (storage_path, display_order)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) {
        throw error;
      } else {
        setNewestListings(data || []);
      }
    } catch (err) {
      console.error('Error fetching newest listings from Supabase:', err);
      setFetchError(err.message || 'Unable to connect to the campus marketplace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNewestListings();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/search');
    }
  };

  const handleCategoryClick = (cat) => {
    if (selectedCategory === cat) {
      setSelectedCategory('');
      navigate('/search');
    } else {
      setSelectedCategory(cat);
      navigate(`/search?category=${encodeURIComponent(cat)}`);
    }
  };

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">
          <ShieldCheck size={15} />
          <span>Campus Knowledge Exchange • Sustainable & Fair</span>
        </div>
        <h1 className="hero-title">
          Find a book. <span className="hero-title__highlight">Pass it on.</span>
        </h1>
        <p className="hero-subtitle">
          Textbooks enlighten our academic journey. Once your course is complete, pass that knowledge on to juniors — keep education affordable, save paper, and recover your costs fairly.
        </p>

        {/* Unified Elevated Capsule Search Bar */}
        <form onSubmit={handleSearchSubmit} className="hero-search-capsule" role="search">
          <div className="hero-search-icon" aria-hidden="true">
            <Search size={20} />
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by book title, author, subject, or college..."
            aria-label="Search textbooks"
            className="hero-search-input"
          />
          <button type="submit" className="hero-search-btn">
            <span>Find Books</span>
          </button>
        </form>

        <div className="hero-actions">
          <Link to="/search">
            <Button variant="outline" size="md">
              Browse All Listings
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </section>

      {/* Category Chips Carousel */}
      <section className="section-categories">
        <h2 className="section-title">Popular Categories</h2>
        <div className="categories-chips-scroll" role="region" aria-label="Book categories">
          {BOOK_CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              selected={selectedCategory === cat}
              onClick={() => handleCategoryClick(cat)}
            />
          ))}
        </div>
      </section>

      {/* Real Newest Listings Showcase */}
      <section className="section-listings">
        <div className="section-header">
          <div>
            <h2 className="section-title">Newest Arrivals</h2>
            <p className="section-subtitle">Real books recently listed by students in your city</p>
          </div>
          <Link to="/search" className="section-link">
            See all books &rarr;
          </Link>
        </div>

        {/* Error state with retry */}
        {fetchError && (
          <Card style={{ textAlign: 'center', padding: 'var(--space-6)', borderColor: 'var(--color-danger)' }}>
            <div style={{ display: 'inline-flex', color: 'var(--color-danger)', marginBottom: 'var(--space-2)' }}>
              <AlertTriangle size={32} />
            </div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Could not load recent listings
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              {fetchError}
            </p>
            <Button variant="secondary" size="sm" onClick={fetchNewestListings}>
              <RefreshCw size={14} />
              <span>Retry</span>
            </Button>
          </Card>
        )}

        {/* Loading skeleton */}
        {loading && !fetchError && (
          <div className="listings-grid">
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
            <Skeleton variant="card" />
          </div>
        )}

        {/* Live Results Grid */}
        {!loading && !fetchError && newestListings.length > 0 && (
          <div className="listings-grid">
            {newestListings.map((book) => {
              const primaryImgPath = book.listing_images?.[0]?.storage_path;
              const imgUrl = getListingImageUrl(primaryImgPath);

              return (
                <Link key={book.id} to={`/listings/${book.id}`} className="listing-card-link">
                  <Card hoverable className="listing-card">
                    <div className="listing-card__image-container">
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={book.title}
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
                        <Chip variant="default" size="sm">
                          {book.condition}
                        </Chip>
                      </div>
                    </div>
                    <div className="listing-card__content">
                      <div className="listing-card__price-row">
                        <span className="listing-card__price">{formatRupees(book.price_paise)}</span>
                        <span className="listing-card__category">{book.category}</span>
                      </div>
                      <h3 className="listing-card__title" title={book.title}>
                        {book.title}
                      </h3>
                      {book.author && <p className="listing-card__author">by {book.author}</p>}
                      <div className="listing-card__footer">
                        <MapPin size={13} aria-hidden="true" />
                        <span>{book.institutions?.name || 'Local Campus'}</span>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && !fetchError && newestListings.length === 0 && (
          <EmptyState
            title="No listings yet"
            description="Be the first student to pass on a textbook to juniors in your city!"
            actionLabel="List a Book"
            onAction={() => navigate('/listings/new')}
          />
        )}
      </section>

      {/* Knowledge Continuity & Campus Value Banner */}
      <section className="campus-safety-banner">
        <Card className="safety-card">
          <div className="safety-card__header">
            <Users size={24} className="safety-card__icon" />
            <div>
              <h3>How BookLoop Works</h3>
              <p>Knowledge transfer, paper sustainability, and fair campus exchange.</p>
            </div>
          </div>
          <div className="safety-steps-grid">
            <div className="safety-step">
              <span className="safety-step__number">1</span>
              <h4>Knowledge Continuity</h4>
              <p>Books carry permanent wisdom. Once your exams or semester conclude, pass that learning forward to juniors.</p>
            </div>
            <div className="safety-step">
              <span className="safety-step__number">2</span>
              <h4>Save Paper & Trees</h4>
              <p>Reusing textbooks preserves paper and natural resources while making higher education genuinely affordable.</p>
            </div>
            <div className="safety-step">
              <span className="safety-step__number">3</span>
              <h4>Fair Campus Exchange</h4>
              <p>Zero middlemen fees. Seniors recover academic costs fairly and hand over books securely on campus.</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
