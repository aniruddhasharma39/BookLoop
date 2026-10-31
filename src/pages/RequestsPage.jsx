import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Check,
  X,
  PhoneCall,
  Clock,
  CheckCircle2,
  RotateCcw,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  School,
  GraduationCap,
  Calendar,
  User as UserIcon,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Chip from '../components/common/Chip';
import Alert from '../components/common/Alert';
import EmptyState from '../components/common/EmptyState';
import LoadingState from '../components/common/LoadingState';
import Modal from '../components/common/Modal';
import { formatRupees, createWhatsAppUrl } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function RequestsPage() {
  const { user, profile, notificationCounts, fetchNotificationCounts, markRequestsAsSeen } = useAuth();

  // If seller has pending requests waiting, default to 'selling' tab
  const [activeTab, setActiveTab] = useState(
    notificationCounts?.sellingPending > 0 && notificationCounts?.buyingAccepted === 0
      ? 'selling'
      : 'buying'
  );

  const [buyingRequests, setBuyingRequests] = useState([]);
  const [sellingRequests, setSellingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [sellerContacts, setSellerContacts] = useState({}); // { [reqId]: { whatsapp, sellerName, bookTitle } }
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Track expanded/collapsed state for grouped listing cards
  const [expandedListings, setExpandedListings] = useState({});

  // Modal for confirming switching between buyers on a listing
  const [switchModal, setSwitchModal] = useState({
    isOpen: false,
    targetReq: null,
    currentAcceptedReq: null,
  });

  const toggleListingExpand = (listingId) => {
    setExpandedListings((prev) => ({
      ...prev,
      [listingId]: prev[listingId] === false ? true : false,
    }));
  };

  const isListingExpanded = (listingId) => {
    // Default to true (expanded) so the seller immediately sees requests
    return expandedListings[listingId] !== false;
  };

  const fetchRequests = async () => {
    if (!user || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch buying requests
      const { data: buyingData, error: buyingErr } = await supabase
        .from('interest_requests')
        .select(`
          id,
          listing_id,
          status,
          created_at,
          responded_at,
          listings (
            id,
            title,
            price_paise,
            condition,
            status,
            institutions (name, area),
            profiles (id, display_name)
          )
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (buyingErr) throw buyingErr;

      // MVP requirement: Only display active requests for ACTIVE listings.
      // Once removed or marked sold by seller, buying requests stays empty (no past history).
      const activeBuying = (buyingData || []).filter(
        (req) => req.listings && req.listings.status === 'active' && req.status !== 'closed'
      );
      setBuyingRequests(activeBuying);

      // Clean up cached contacts for any requests that are no longer accepted
      setSellerContacts((prev) => {
        const updated = { ...prev };
        activeBuying.forEach((r) => {
          if (r.status !== 'accepted' && updated[r.id]) {
            delete updated[r.id];
          }
        });
        return updated;
      });

      // 2. Fetch selling requests with rich buyer profile details
      const { data: sellingData, error: sellingErr } = await supabase
        .from('interest_requests')
        .select(`
          id,
          listing_id,
          status,
          created_at,
          responded_at,
          buyer_id,
          profiles!interest_requests_buyer_id_fkey (
            id,
            display_name,
            course_or_class,
            graduation_year,
            institutions (name, area, city)
          ),
          listings (
            id,
            title,
            price_paise,
            condition,
            category,
            status
          )
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (sellingErr) throw sellingErr;

      // Only show requests for active listings that are not closed
      const activeSelling = (sellingData || []).filter(
        (req) => req.listings && req.listings.status === 'active' && req.status !== 'closed'
      );
      setSellingRequests(activeSelling);

      // Sync notification counts in header badge
      if (fetchNotificationCounts) {
        fetchNotificationCounts(user.id);
      }
    } catch (err) {
      console.error('Fetch requests error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to load requests.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    if (markRequestsAsSeen) {
      markRequestsAsSeen();
    }
  }, [user]);

  // Group selling requests by listing
  const groupedSelling = useMemo(() => {
    const map = new Map();
    sellingRequests.forEach((req) => {
      const listId = req.listing_id;
      if (!map.has(listId)) {
        map.set(listId, {
          listing: req.listings,
          listingId: listId,
          requests: [],
        });
      }
      map.get(listId).requests.push(req);
    });
    return Array.from(map.values());
  }, [sellingRequests]);

  // Handle click on "Accept Request" button
  const handleInitiateAccept = (targetReq) => {
    // Proactively check if seller has configured WhatsApp
    if (!profile?.whatsapp_number || !profile.whatsapp_number.trim()) {
      setFeedback({
        type: 'error',
        message: 'You must save a valid WhatsApp contact number in your profile before accepting requests.',
        showProfileLink: true,
      });
      return;
    }

    // Check if there is another request for the SAME listing that is currently accepted
    const currentAccepted = sellingRequests.find(
      (r) => r.listing_id === targetReq.listing_id && r.status === 'accepted' && r.id !== targetReq.id
    );

    if (currentAccepted) {
      // Open confirmation modal to switch buyers
      setSwitchModal({
        isOpen: true,
        targetReq,
        currentAcceptedReq: currentAccepted,
      });
    } else {
      // Direct accept
      executeAccept(targetReq.id);
    }
  };

  // Seller accepts request via secure RPC (with graceful fallback if migration not yet applied)
  const executeAccept = async (requestId, previousAcceptedId = null) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    setFeedback({ type: '', message: '' });

    try {
      const { error } = await supabase.rpc('accept_interest_request', {
        p_request_id: requestId,
      });

      if (error) {
        if (error.message?.includes('schema cache') || error.code === 'PGRST202') {
          // RPC not yet updated in Supabase SQL editor; perform sequential table update
          if (previousAcceptedId) {
            await supabase
              .from('interest_requests')
              .update({ status: 'pending', responded_at: null })
              .eq('id', previousAcceptedId);
          }

          const { error: fallbackErr } = await supabase
            .from('interest_requests')
            .update({
              status: 'accepted',
              responded_at: new Date().toISOString(),
            })
            .eq('id', requestId);

          if (fallbackErr) throw fallbackErr;
        } else {
          throw error;
        }
      }

      setFeedback({
        type: 'success',
        message: 'Request accepted! The buyer can now access your WhatsApp number to coordinate campus handover.',
      });
      setSwitchModal({ isOpen: false, targetReq: null, currentAcceptedReq: null });
      await fetchRequests();
    } catch (err) {
      console.error('Accept error:', err);
      const isWhatsAppErr = err.message?.toLowerCase().includes('whatsapp');
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to accept request. Make sure you have set your WhatsApp number in your Profile.',
        showProfileLink: isWhatsAppErr,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  // Seller revokes an accepted request back to pending
  const handleRevokeAcceptance = async (requestId, buyerName) => {
    if (
      !window.confirm(
        `Revoke acceptance for ${buyerName || 'this buyer'}? Their WhatsApp access will be removed, and you can coordinate with another buyer.`
      )
    ) {
      return;
    }

    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    setFeedback({ type: '', message: '' });

    try {
      const { error } = await supabase.rpc('revoke_interest_request_acceptance', {
        p_request_id: requestId,
      });

      if (error) {
        if (error.message?.includes('schema cache') || error.code === 'PGRST202') {
          const { error: fallbackErr } = await supabase
            .from('interest_requests')
            .update({ status: 'pending', responded_at: null })
            .eq('id', requestId);

          if (fallbackErr) throw fallbackErr;
        } else {
          throw error;
        }
      }

      setFeedback({
        type: 'info',
        message: 'Acceptance revoked. Your WhatsApp contact is now protected and you can select another student.',
      });
      await fetchRequests();
    } catch (err) {
      console.error('Revoke error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to revoke acceptance.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  // Seller declines request via secure RPC (with graceful fallback)
  const handleDeclineRequest = async (requestId) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    setFeedback({ type: '', message: '' });

    try {
      const { error } = await supabase.rpc('decline_interest_request', {
        p_request_id: requestId,
      });

      if (error) {
        if (error.message?.includes('schema cache') || error.code === 'PGRST202') {
          const { error: fallbackErr } = await supabase
            .from('interest_requests')
            .update({
              status: 'declined',
              responded_at: new Date().toISOString(),
            })
            .eq('id', requestId);

          if (fallbackErr) throw fallbackErr;
        } else {
          throw error;
        }
      }

      setFeedback({ type: 'info', message: 'Interest request declined.' });
      await fetchRequests();
    } catch (err) {
      console.error('Decline error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to decline request.' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  // Buyer reveals seller WhatsApp via secure RPC
  const handleRevealContact = async (requestId) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }));
    setFeedback({ type: '', message: '' });

    try {
      const { data, error } = await supabase.rpc('get_seller_contact', {
        p_request_id: requestId,
      });

      if (error) {
        if (error.message?.includes('schema cache') || error.code === 'PGRST202') {
          // Direct fallback if function was not installed in DB yet
          const { data: reqData, error: reqErr } = await supabase
            .from('interest_requests')
            .select(`
              id,
              status,
              listings (title),
              profiles!interest_requests_seller_id_fkey (display_name, whatsapp_number)
            `)
            .eq('id', requestId)
            .single();

          if (reqErr) throw reqErr;
          if (reqData && reqData.status === 'accepted') {
            setSellerContacts((prev) => ({
              ...prev,
              [requestId]: {
                whatsapp: reqData.profiles?.whatsapp_number,
                sellerName: reqData.profiles?.display_name,
                bookTitle: reqData.listings?.title,
              },
            }));
            return;
          }
        }
        throw error;
      }

      if (data && data.length > 0) {
        const contact = data[0];
        setSellerContacts((prev) => ({
          ...prev,
          [requestId]: {
            whatsapp: contact.whatsapp_number,
            sellerName: contact.seller_name,
            bookTitle: contact.listing_title,
          },
        }));
      }
    } catch (err) {
      console.error('Contact reveal error:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Unable to retrieve contact. Request must be accepted first.',
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  };

  return (
    <div style={{ maxWidth: '960px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
          Interest Requests
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Coordinate handovers safely once interest is accepted.
        </p>
      </div>

      {feedback.message && (
        <Alert variant={feedback.type === 'error' ? 'error' : feedback.type === 'success' ? 'success' : 'info'}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <span>{feedback.message}</span>
            {feedback.showProfileLink && (
              <Link to="/profile" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="sm">
                  Go to Profile
                </Button>
              </Link>
            )}
          </div>
        </Alert>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={() => setActiveTab('buying')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            borderBottom: activeTab === 'buying' ? '2px solid var(--color-primary-navy)' : '2px solid transparent',
            color: activeTab === 'buying' ? 'var(--color-primary-navy)' : 'var(--color-text-muted)',
          }}
        >
          Buying Requests ({buyingRequests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('selling')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            borderBottom: activeTab === 'selling' ? '2px solid var(--color-primary-navy)' : '2px solid transparent',
            color: activeTab === 'selling' ? 'var(--color-primary-navy)' : 'var(--color-text-muted)',
          }}
        >
          Selling Requests ({sellingRequests.length})
        </button>
      </div>

      {loading ? (
        <LoadingState message="Loading your requests..." />
      ) : activeTab === 'buying' ? (
        // Tab: Buying Requests (Filtered strictly for active listings; empty once removed/sold)
        buyingRequests.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {buyingRequests.map((req) => {
              const contactInfo = sellerContacts[req.id];
              const listing = req.listings;

              return (
                <Card key={req.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                    <div>
                      <Link to={`/listings/${req.listing_id}`} style={{ textDecoration: 'none' }}>
                        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-main)' }}>
                          {listing?.title || 'Textbook'}
                        </h3>
                      </Link>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        Seller: {listing?.profiles?.display_name || 'Student'} &bull; {formatRupees(listing?.price_paise)}
                      </p>
                    </div>
                    <Chip variant={req.status === 'accepted' ? 'success' : req.status === 'declined' ? 'warning' : 'accent'}>
                      {req.status.toUpperCase()}
                    </Chip>
                  </div>

                  {/* Accepted state: reveal WhatsApp button */}
                  {req.status === 'accepted' && (
                    <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border-subtle)' }}>
                      <Alert variant="success" title="Request Accepted!">
                        The seller accepted your request. You are now authorized to view their WhatsApp contact and schedule a public campus meetup.
                      </Alert>

                      <div style={{ marginTop: 'var(--space-3)' }}>
                        {contactInfo ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            <p style={{ fontSize: 'var(--font-size-sm)' }}>
                              Seller Contact: <strong>{contactInfo.whatsapp}</strong> ({contactInfo.sellerName})
                            </p>
                            <a
                              href={createWhatsAppUrl(contactInfo.whatsapp, contactInfo.bookTitle || listing?.title)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ textDecoration: 'none' }}
                            >
                              <Button variant="accent" size="md">
                                <PhoneCall size={16} />
                                <span>Open WhatsApp Chat</span>
                              </Button>
                            </a>
                          </div>
                        ) : (
                          <Button
                            variant="accent"
                            size="md"
                            loading={actionLoading[req.id]}
                            onClick={() => handleRevealContact(req.id)}
                          >
                            <PhoneCall size={16} />
                            <span>Reveal Seller WhatsApp</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pending state */}
                  {req.status === 'pending' && (
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
                      Awaiting seller response. Contact information remains protected until acceptance.
                    </p>
                  )}

                  {/* Declined state */}
                  {req.status === 'declined' && (
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
                      The seller declined this request.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No Buying Requests"
            description="You haven't requested any books yet. Browse the catalogue to find textbooks for your course."
            actionLabel="Browse Books"
            onAction={() => setActiveTab('buying')}
          />
        )
      ) : (
        // Tab: Selling Requests (Grouped by Listing into a single common Parent Card)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {!profile?.whatsapp_number && sellingRequests.length > 0 && (
            <Alert variant="warning" title="WhatsApp Number Required to Accept Requests">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <span>You have buyer requests waiting! You must save a WhatsApp number in your profile before you can accept them.</span>
                <Link to="/profile" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" size="sm">
                    Add WhatsApp Number
                  </Button>
                </Link>
              </div>
            </Alert>
          )}

          {groupedSelling.length > 0 ? (
            groupedSelling.map((group) => {
              const isExpanded = isListingExpanded(group.listingId);
              const acceptedBuyerReq = group.requests.find((r) => r.status === 'accepted');

              return (
                <Card
                  key={group.listingId}
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {/* Parent Card Header (Listing Info + Encircled Request Count) */}
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      backgroundColor: 'var(--color-card-bg)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: isExpanded ? '1px solid var(--color-border-subtle)' : 'none',
                    }}
                    onClick={() => toggleListingExpand(group.listingId)}
                  >
                    <div>
                      <Link
                        to={`/listings/${group.listingId}`}
                        style={{ textDecoration: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <h3
                          style={{
                            fontSize: 'var(--font-size-base)',
                            fontWeight: 700,
                            color: 'var(--color-primary-navy)',
                            marginBottom: '2px',
                          }}
                        >
                          {group.listing?.title || 'Your Listing'}
                        </h3>
                      </Link>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                        {formatRupees(group.listing?.price_paise)}
                        {group.listing?.condition && ` \u2022 ${group.listing.condition}`}
                        {group.listing?.category && ` \u2022 ${group.listing.category}`}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      {/* Encircled Request Count Badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'var(--color-secondary-soft-blue)',
                          color: 'var(--color-primary-navy)',
                          padding: '4px 12px',
                          borderRadius: '9999px',
                          fontWeight: 700,
                          fontSize: 'var(--font-size-xs)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        {group.requests.length} {group.requests.length === 1 ? 'Request' : 'Requests'}
                      </span>

                      {/* Status indicator if a buyer is currently accepted */}
                      {acceptedBuyerReq && (
                        <Chip variant="success">1 Accepted</Chip>
                      )}

                      {/* Expand / Collapse Icon */}
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-muted)',
                          padding: 'var(--space-1)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        aria-label={isExpanded ? 'Collapse requests' : 'Expand requests'}
                      >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </div>
                  </div>

                  {/* Parent Card Body: Expanded Buyer Requests */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-background-warm)' }}>
                      {group.requests.map((req, idx) => {
                        const buyerProfile = req.profiles;
                        const isAccepted = req.status === 'accepted';
                        const isPending = req.status === 'pending';
                        const otherAcceptedInGroup = group.requests.find(
                          (r) => r.status === 'accepted' && r.id !== req.id
                        );

                        return (
                          <div
                            key={req.id}
                            style={{
                              padding: 'var(--space-4)',
                              borderBottom:
                                idx < group.requests.length - 1
                                  ? '1px solid var(--color-border-subtle)'
                                  : 'none',
                              backgroundColor: isAccepted ? 'rgba(46, 125, 50, 0.04)' : '#FFFFFF',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                              {/* Buyer Profile Information Block */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1, minWidth: '240px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                  <div
                                    style={{
                                      width: '28px',
                                      height: '28px',
                                      borderRadius: '50%',
                                      backgroundColor: 'var(--color-secondary-soft-blue)',
                                      color: 'var(--color-primary-navy)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 'var(--font-size-xs)',
                                      fontWeight: 700,
                                    }}
                                  >
                                    <UserIcon size={15} />
                                  </div>
                                  <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-main)' }}>
                                    {buyerProfile?.display_name || 'Interested Student'}
                                  </span>
                                </div>

                                {/* Rich Academic & Campus Profile Info for decision-making */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px', paddingLeft: '36px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                    <School size={14} style={{ flexShrink: 0, color: 'var(--color-primary-navy)' }} />
                                    <span>
                                      {buyerProfile?.institutions?.name
                                        ? `${buyerProfile.institutions.name}${buyerProfile.institutions.area ? ` (${buyerProfile.institutions.area})` : ''}`
                                        : 'Student Institution not listed'}
                                    </span>
                                  </div>

                                  {(buyerProfile?.course_or_class || buyerProfile?.graduation_year) && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                      <GraduationCap size={14} style={{ flexShrink: 0, color: 'var(--color-primary-navy)' }} />
                                      <span>
                                        {buyerProfile?.course_or_class || 'Course'}
                                        {buyerProfile?.graduation_year ? ` \u2022 Class of ${buyerProfile.graduation_year}` : ''}
                                      </span>
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                    <Clock size={13} style={{ flexShrink: 0 }} />
                                    <span>
                                      Requested on{' '}
                                      {new Date(req.created_at).toLocaleDateString(undefined, {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Request Status Badge */}
                              <Chip variant={isAccepted ? 'success' : req.status === 'declined' ? 'warning' : 'accent'}>
                                {req.status.toUpperCase()}
                              </Chip>
                            </div>

                            {/* Actions / Status Details */}
                            <div style={{ marginTop: 'var(--space-3)', paddingLeft: '36px' }}>
                              {isAccepted && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={15} />
                                    <span>Accepted! This buyer is authorized to view your WhatsApp number for campus meetup.</span>
                                  </div>
                                  <div style={{ marginTop: 'var(--space-1)' }}>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      loading={actionLoading[req.id]}
                                      onClick={() => handleRevokeAcceptance(req.id, buyerProfile?.display_name)}
                                    >
                                      <RotateCcw size={14} />
                                      <span>Revoke Acceptance</span>
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {isPending && (
                                <div>
                                  {otherAcceptedInGroup ? (
                                    <div>
                                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                                        Another buyer (<strong>{otherAcceptedInGroup.profiles?.display_name || 'Buyer'}</strong>) is currently accepted for this listing.
                                      </p>
                                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          loading={actionLoading[req.id]}
                                          onClick={() => handleInitiateAccept(req)}
                                        >
                                          <ArrowRightLeft size={14} />
                                          <span>Switch to this Buyer</span>
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          loading={actionLoading[req.id]}
                                          onClick={() => handleDeclineRequest(req.id)}
                                        >
                                          <X size={14} />
                                          <span>Decline</span>
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        loading={actionLoading[req.id]}
                                        onClick={() => handleInitiateAccept(req)}
                                      >
                                        <Check size={16} />
                                        <span>Accept Request</span>
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        loading={actionLoading[req.id]}
                                        onClick={() => handleDeclineRequest(req.id)}
                                      >
                                        <X size={16} />
                                        <span>Decline</span>
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {req.status === 'declined' && (
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                                  You declined this request.
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })
          ) : (
            <EmptyState
              title="No Selling Requests"
              description="No active requests for your books right now."
            />
          )}
        </div>
      )}

      {/* Switch Buyer Confirmation Modal */}
      <Modal
        isOpen={switchModal.isOpen}
        onClose={() => setSwitchModal({ isOpen: false, targetReq: null, currentAcceptedReq: null })}
        title="Switch to Another Buyer?"
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => setSwitchModal({ isOpen: false, targetReq: null, currentAcceptedReq: null })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={switchModal.targetReq && actionLoading[switchModal.targetReq.id]}
              onClick={() => {
                if (switchModal.targetReq) {
                  executeAccept(switchModal.targetReq.id, switchModal.currentAcceptedReq?.id);
                }
              }}
            >
              <ArrowRightLeft size={16} />
              <span>Confirm & Switch Buyer</span>
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Alert variant="warning" title="Single Active Buyer Policy">
            Only one buyer can have access to your WhatsApp number at a time to keep campus meetups coordinated and protect your contact info.
          </Alert>

          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', margin: 0 }}>
            You previously accepted{' '}
            <strong>{switchModal.currentAcceptedReq?.profiles?.display_name || 'the current buyer'}</strong> for this book.
          </p>

          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
            Switching to <strong>{switchModal.targetReq?.profiles?.display_name || 'this student'}</strong> will:
          </p>

          <ul style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', paddingLeft: 'var(--space-4)', margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <li>
              <strong>Revoke</strong> WhatsApp contact access from{' '}
              <strong>{switchModal.currentAcceptedReq?.profiles?.display_name || 'the current buyer'}</strong>.
            </li>
            <li>
              <strong>Authorize</strong>{' '}
              <strong>{switchModal.targetReq?.profiles?.display_name || 'the new buyer'}</strong> to view your WhatsApp number.
            </li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}
