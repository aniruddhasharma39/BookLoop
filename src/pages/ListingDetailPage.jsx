import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, BookOpen, AlertCircle, Check, LogIn, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Chip from '../components/common/Chip';
import Alert from '../components/common/Alert';
import LoadingState from '../components/common/LoadingState';
import EmptyState from '../components/common/EmptyState';
import ReportModal from '../components/common/ReportModal';
import { formatRupees, getListingImageUrl, formatListingRef } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchWithCache } from '../lib/cache';
import './ListingDetailPage.css';

export default function ListingDetailPage() {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // Interest request states
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Reporting states
  const [reportModal, setReportModal] = useState({
    isOpen: false,
    targetType: 'listing',
    targetId: null,
    targetTitle: '',
    reportedUserId: null,
  });

  useEffect(() => {
    async function fetchListing() {
      if (!isSupabaseConfigured || !id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await fetchWithCache(`listings:detail:${id}`, async () => {
          const { data: fetched, error: fetchErr } = await supabase
            .from('listings')
            .select(`
              id,
              seller_id,
              title,
              author,
              edition,
              category,
              course_or_exam,
              condition,
              description,
              price_paise,
              status,
              created_at,
              institutions (name, area, city),
              profiles (display_name),
              listing_images (storage_path, display_order)
            `)
            .eq('id', id)
            .maybeSingle();

          if (fetchErr) throw fetchErr;
          return fetched;
        }, 180000); // 3-minute cache

        setBook(data);

        // Check if current user already sent an active request for this listing
        if (user && data) {
          const { data: existingReq } = await supabase
            .from('interest_requests')
            .select('id, status')
            .eq('listing_id', data.id)
            .eq('buyer_id', user.id)
            .in('status', ['pending', 'accepted'])
            .maybeSingle();

          if (existingReq) {
            setRequestSent(true);
          }
        }
      } catch (err) {
        console.error('Fetch listing error:', err);
        setError(err.message || 'Failed to load listing.');
      } finally {
        setLoading(false);
      }
    }

    fetchListing();
  }, [id, user]);

  const handleSendInterest = async () => {
    if (!user) {
      navigate(`/login?redirectTo=${encodeURIComponent(`/listings/${id}`)}`);
      return;
    }

    if (user.id === book.seller_id) {
      setRequestError("You cannot send an interest request for your own listing.");
      return;
    }

    if (profile?.account_status === 'suspended') {
      setRequestError("Your account is currently suspended. Suspended accounts cannot submit interest requests.");
      return;
    }

    if (book.status !== 'active') {
      setRequestError("This textbook is no longer active and cannot accept new requests.");
      return;
    }

    setSendingRequest(true);
    setRequestError('');

    try {
      const { error: insertErr } = await supabase
        .from('interest_requests')
        .insert({
          listing_id: book.id,
          buyer_id: user.id,
          seller_id: book.seller_id,
          status: 'pending',
        });

      if (insertErr) {
        if (insertErr.message?.includes('idx_unique_active_request')) {
          setRequestError("You already have an active request pending for this book.");
          setRequestSent(true);
        } else {
          throw insertErr;
        }
      } else {
        setRequestSent(true);
      }
    } catch (err) {
      console.error('Interest request error:', err);
      setRequestError(err.message || 'Failed to send interest request.');
    } finally {
      setSendingRequest(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading textbook details..." />;
  }

  if (error || !book) {
    return (
      <EmptyState
        title="Textbook Not Found"
        description="This listing could not be found or may have been removed."
        actionLabel="Browse Available Textbooks"
        onAction={() => navigate('/search')}
      />
    );
  }

  const isOwner = user?.id === book.seller_id;
  const isAvailable = book.status === 'active';
  const images = book.listing_images?.sort((a, b) => a.display_order - b.display_order) || [];
  const activeImage = images[activePhotoIdx]?.storage_path;
  const activeImageUrl = getListingImageUrl(activeImage);

  return (
    <div className="listing-detail-page">
      <div className="back-link-wrapper">
        <Link to="/search" className="back-link">
          <ArrowLeft size={16} />
          <span>Back to browse</span>
        </Link>
      </div>

      {/* Unavailable State Notice */}
      {!isAvailable && (
        <Alert variant="warning" title="Book Unavailable">
          {book.status === 'sold'
            ? 'This textbook has been marked as SOLD by the student seller.'
            : 'This listing has been removed and is no longer available on the marketplace.'}
        </Alert>
      )}

      {requestError && (
        <Alert variant="error" onClose={() => setRequestError('')}>
          {requestError}
        </Alert>
      )}

      {profile?.account_status === 'suspended' && (
        <Alert variant="error" title="Account Suspended">
          Your account is suspended. You cannot submit interest requests. For questions or appeals, contact{' '}
          <a href="mailto:support.urbancloud@gmail.com" style={{ fontWeight: 600, textDecoration: 'underline' }}>
            support.urbancloud@gmail.com
          </a>.
        </Alert>
      )}

      {requestSent && (
        <Alert variant="success" title="Interest Request Submitted!">
          Your request has been delivered to the seller. When they accept, you will be notified under{' '}
          <Link to="/requests" style={{ fontWeight: 600 }}>Requests</Link> to view their WhatsApp contact for campus meetup.
        </Alert>
      )}

      <div className="listing-detail-layout">
        {/* Photo Gallery Area */}
        <div className="listing-detail__gallery">
          <div className="listing-detail__main-image-box">
            {activeImageUrl ? (
              <img
                src={activeImageUrl}
                alt={book.title}
                className="listing-detail__main-image"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) {
                    e.target.nextSibling.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div
              className="listing-detail__image-fallback"
              style={{ display: activeImageUrl ? 'none' : 'flex' }}
            >
              <BookOpen size={64} />
            </div>

            {/* Gallery Prev / Next arrow controls if multiple images */}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                  style={{
                    position: 'absolute',
                    left: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setActivePhotoIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </div>

          {/* Photo Thumbnails */}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {images.map((img, idx) => {
                const thumbUrl = getListingImageUrl(img.storage_path);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePhotoIdx(idx)}
                    aria-label={`View photo ${idx + 1}`}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      border: activePhotoIdx === idx ? '2px solid var(--color-primary-navy)' : '1px solid var(--color-border)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <img src={thumbUrl} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Book Info & Action Area */}
        <div className="listing-detail__info">
          <div className="listing-detail__header">
            <div className="listing-detail__badges">
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: 'var(--color-secondary-soft-blue)',
                  color: 'var(--color-primary-navy)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                #{formatListingRef(book)}
              </span>
              <Chip variant="accent">{book.category}</Chip>
              <Chip variant="default">{book.condition}</Chip>
              {book.status === 'sold' && <Chip variant="warning">SOLD</Chip>}
            </div>
            <h1 className="listing-detail__title">{book.title}</h1>
            {book.author && (
              <p className="listing-detail__author">
                by {book.author} {book.edition ? `• ${book.edition}` : ''}
              </p>
            )}
            <div className="listing-detail__price-tag">
              {formatRupees(book.price_paise)}
            </div>
          </div>

          {/* Seller & Campus Info (Strict Privacy: No email/phone) */}
          <Card className="seller-summary-card">
            <div className="seller-summary__info">
              <span className="seller-summary__label">Offered by student</span>
              <strong className="seller-summary__name">
                {book.profiles?.display_name || 'Campus Student'}
              </strong>
              <div className="seller-summary__campus">
                <MapPin size={14} />
                <span>{book.institutions?.name || 'Local Campus'} {book.institutions?.area ? `(${book.institutions.area})` : ''}</span>
              </div>
            </div>
          </Card>

          {/* Action CTA */}
          <div className="listing-detail__actions">
            {isOwner ? (
              <Link to={`/listings/${book.id}/edit`} style={{ textDecoration: 'none' }}>
                <Button variant="outline" size="lg" fullWidth>
                  Edit Your Listing
                </Button>
              </Link>
            ) : !isAvailable ? (
              <Button variant="secondary" size="lg" disabled fullWidth>
                <span>Book is No Longer Available</span>
              </Button>
            ) : requestSent ? (
              <Button variant="secondary" size="lg" disabled fullWidth>
                <Check size={18} />
                <span>Interest Sent &bull; Awaiting Seller Response</span>
              </Button>
            ) : !user ? (
              <Link to={`/login?redirectTo=${encodeURIComponent(`/listings/${id}`)}`} style={{ textDecoration: 'none' }}>
                <Button variant="accent" size="lg" fullWidth>
                  <LogIn size={18} />
                  <span>Sign In to Request this Book</span>
                </Button>
              </Link>
            ) : (
              <Button
                variant="accent"
                size="lg"
                fullWidth
                loading={sendingRequest}
                onClick={handleSendInterest}
              >
                I'm Interested in this Book
              </Button>
            )}
          </div>

          {/* Safety Notice from Brief */}
          <Alert variant="info" title="Campus Safety First">
            Contact numbers are never shared publicly. Once the seller accepts your request,
            their WhatsApp will be revealed so you can arrange a daytime meetup at a campus building or library.
          </Alert>

          {/* Reporting actions for student safety */}
          {!isOwner && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) 0', borderTop: '1px solid var(--color-border-subtle)' }}>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    navigate(`/login?redirectTo=${encodeURIComponent(`/listings/${id}`)}`);
                    return;
                  }
                  setReportModal({
                    isOpen: true,
                    targetType: 'listing',
                    targetId: book.id,
                    targetTitle: book.title,
                    reportedUserId: book.seller_id,
                  });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
              >
                <Flag size={14} color="var(--color-error)" />
                <span>Report this listing</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    navigate(`/login?redirectTo=${encodeURIComponent(`/listings/${id}`)}`);
                    return;
                  }
                  setReportModal({
                    isOpen: true,
                    targetType: 'user',
                    targetId: book.seller_id,
                    targetTitle: book.profiles?.display_name || 'Seller',
                    reportedUserId: book.seller_id,
                  });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
              >
                Report seller
              </button>
            </div>
          )}

          {/* Description */}
          {book.description && (
            <div className="listing-detail__description">
              <h3 className="section-title-sm">Description</h3>
              <p>{book.description}</p>
            </div>
          )}

          {/* Course details */}
          {book.course_or_exam && (
            <div className="listing-detail__meta">
              <h3 className="section-title-sm">Course / Subject / Exam</h3>
              <p>{book.course_or_exam}</p>
            </div>
          )}
        </div>
      </div>

      {/* Safety Report Modal */}
      <ReportModal
        isOpen={reportModal.isOpen}
        onClose={() => setReportModal((prev) => ({ ...prev, isOpen: false }))}
        targetType={reportModal.targetType}
        targetId={reportModal.targetId}
        targetTitle={reportModal.targetTitle}
        reportedUserId={reportModal.reportedUserId}
      />
    </div>
  );
}
