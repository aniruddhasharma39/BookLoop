import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, PlusCircle, ArrowRight, ShieldCheck, MapPin, Users, BookOpen, RefreshCw, AlertTriangle } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Chip from '../components/common/Chip';
import Input from '../components/common/Input';
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
          <ShieldCheck size={14} />
          <span>Student-to-student campus marketplace</span>
        </div>
        <h1 className="hero-title">
          Find a book. <span className="hero-title__highlight">Pass it on.</span>
        </h1>
        <p className="hero-subtitle">
          Seniors pass on textbooks they no longer need; juniors save money. Safe campus meetups, zero middlemen fees.
        </p>

        {/* Quick Search Bar */}
        <form onSubmit={handleSearchSubmit} className="hero-search-form">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, subject, or college..."
            prefix={<Search size={18} />}
            aria-label="Search textbooks"
          />
          <Button type="submit" variant="primary" size="md">
            Find Books
          </Button>
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

      {/* Seller Callout Banner */}
      <section className="seller-callout-section">
        <div className="seller-callout-card">
          <div className="seller-callout-content">
            <span className="seller-callout-badge">For Seniors & Graduating Students</span>
            <h3 className="seller-callout-title">Have textbooks collecting dust on your shelf?</h3>
            <p className="seller-callout-desc">
              Pass them on to juniors at your college, earn pocket money back, and keep textbook costs affordable for your campus.
            </p>
          </div>
          <Link to="/listings/new" className="seller-callout-cta">
            <PlusCircle size={20} />
            <span>List a Book in 60s</span>
          </Link>
        </div>
      </section>

      {/* Trust & Safety Campus Info Banner */}
      <section className="campus-safety-banner">
        <Card className="safety-card">
          <div className="safety-card__header">
            <Users size={24} className="safety-card__icon" />
            <div>
              <h3>How BookLoop Works Safely</h3>
              <p>Simple 3-step student model designed for campus peace of mind.</p>
            </div>
          </div>
          <div className="safety-steps-grid">
            <div className="safety-step">
              <span className="safety-step__number">1</span>
              <h4>Send Interest</h4>
              <p>Find the book you need and submit an interest request to the seller.</p>
            </div>
            <div className="safety-step">
              <span className="safety-step__number">2</span>
              <h4>Seller Accepts</h4>
              <p>Seller accepts your request. Only then is their WhatsApp contact revealed.</p>
            </div>
            <div className="safety-step">
              <span className="safety-step__number">3</span>
              <h4>Campus Meetup</h4>
              <p>Meet in daylight at a campus library, canteen, or gate to inspect and exchange.</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
