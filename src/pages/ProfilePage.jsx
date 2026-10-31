import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  MapPin,
  Phone,
  BookOpen,
  MessageSquare,
  LogOut,
  Edit3,
  PlusCircle,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  School,
  GraduationCap,
  Calendar,
  Trash2,
  Check,
  X,
  ShieldAlert,
  Mail,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Chip from '../components/common/Chip';
import Alert from '../components/common/Alert';
import EmptyState from '../components/common/EmptyState';
import Modal from '../components/common/Modal';
import { formatRupees, getListingImageUrl, validateAndFormatWhatsApp } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Fallback seed institutions
const FALLBACK_INSTITUTIONS = [
  { id: '11111111-1111-1111-1111-111111111101', name: 'The Bishop’s School & Junior College', area: 'Camp' },
  { id: '11111111-1111-1111-1111-111111111102', name: 'St. Vincent’s High School and Junior College', area: 'Camp' },
  { id: '11111111-1111-1111-1111-111111111103', name: 'Loyola High School and Junior College', area: 'Pashan' },
  { id: '11111111-1111-1111-1111-111111111104', name: 'Delhi Public School (DPS Pune)', area: 'Mohammadwadi' },
  { id: '11111111-1111-1111-1111-111111111105', name: 'Orchid School', area: 'Baner' },
  { id: '11111111-1111-1111-1111-111111111106', name: 'Symbiosis School & Junior College', area: 'Prabhat Road' },
  { id: '22222222-2222-2222-2222-222222222201', name: 'College of Engineering, Pune (COEP Tech)', area: 'Shivajinagar' },
  { id: '22222222-2222-2222-2222-222222222202', name: 'Pune Institute of Computer Technology (PICT)', area: 'Dhankawadi' },
  { id: '22222222-2222-2222-2222-222222222203', name: 'Vishwakarma Institute of Technology (VIT Pune)', area: 'Bibwewadi' },
  { id: '22222222-2222-2222-2222-222222222204', name: 'Fergusson College', area: 'FC Road' },
  { id: '22222222-2222-2222-2222-222222222205', name: 'B. J. Government Medical College', area: 'Sassoon Hospital Campus' },
  { id: '22222222-2222-2222-2222-222222222206', name: 'Bharati Vidyapeeth Medical College', area: 'Katraj' },
];

const GRADUATION_YEARS = [
  '2024',
  '2025',
  '2026',
  '2027',
  '2028',
  '2029',
  '2030',
  '2031',
  '2032',
];

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Profile Form States
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [institutionId, setInstitutionId] = useState(profile?.institution_id || '');
  const [course, setCourse] = useState(profile?.course_or_class || '');
  const [gradYear, setGradYear] = useState(profile?.graduation_year?.toString() || '');
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp_number || '');
  const [phoneError, setPhoneError] = useState('');

  const [institutions, setInstitutions] = useState(FALLBACK_INSTITUTIONS);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // User's Own Listings
  const [myListings, setMyListings] = useState([]);
  const [listingFilter, setListingFilter] = useState('all'); // 'all' | 'active' | 'sold'
  const [loadingListings, setLoadingListings] = useState(true);
  const [listingActionLoading, setListingActionLoading] = useState({});

  // Account Deletion States
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [hasPendingDeletion, setHasPendingDeletion] = useState(false);
  const [pendingDeletionDate, setPendingDeletionDate] = useState(null);

  // Sync profile values when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setInstitutionId(profile.institution_id || '');
      setCourse(profile.course_or_class || '');
      setGradYear(profile.graduation_year?.toString() || '');
      setWhatsapp(profile.whatsapp_number || '');
    }
  }, [profile]);

  // Load active institutions
  useEffect(() => {
    async function fetchInstitutions() {
      if (!isSupabaseConfigured) return;
      try {
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name, city, area')
          .eq('is_active', true)
          .order('name');

        if (!error && data && data.length > 0) {
          setInstitutions(data);
        }
      } catch (err) {
        console.error('Error fetching institutions:', err);
      }
    }
    fetchInstitutions();
  }, []);

  // Check existing account deletion request
  useEffect(() => {
    async function checkDeletionRequest() {
      if (!user || !isSupabaseConfigured) return;
      try {
        const { data, error } = await supabase
          .from('reports')
          .select('id, created_at, status')
          .eq('reporter_id', user.id)
          .eq('reason', 'account_deletion_request')
          .eq('status', 'open')
          .maybeSingle();

        if (!error && data) {
          setHasPendingDeletion(true);
          setPendingDeletionDate(data.created_at);
        }
      } catch (err) {
        console.error('Error checking deletion requests:', err);
      }
    }
    checkDeletionRequest();
  }, [user]);

  // Load user's own listings
  const fetchMyListings = async () => {
    if (!user || !isSupabaseConfigured) {
      setLoadingListings(false);
      return;
    }

    try {
      setLoadingListings(true);
      const { data, error } = await supabase
        .from('listings')
        .select(`
          id,
          title,
          price_paise,
          condition,
          status,
          category,
          created_at,
          listing_images (storage_path, display_order)
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyListings(data || []);
    } catch (err) {
      console.error('Failed to load my listings:', err);
    } finally {
      setLoadingListings(false);
    }
  };

  useEffect(() => {
    fetchMyListings();
  }, [user]);

  // Handle Profile Update
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user || !isSupabaseConfigured) {
      setStatusMessage({ type: 'info', text: 'Saved locally for preview.' });
      return;
    }

    // Validate WhatsApp number if provided
    let formattedWhatsapp = null;
    setPhoneError('');
    if (whatsapp && whatsapp.trim()) {
      const val = validateAndFormatWhatsApp(whatsapp);
      if (!val.isValid) {
        setPhoneError(val.error);
        return;
      }
      formattedWhatsapp = val.formatted;
    }

    if (!displayName.trim()) {
      setStatusMessage({ type: 'error', text: 'Display name cannot be empty.' });
      return;
    }

    setSaving(true);
    setStatusMessage({ type: '', text: '' });

    try {
      // Users can only update allowed fields:
      // display_name, institution_id, course_or_class, graduation_year, whatsapp_number
      // (Database RLS forbids updating account_status or whatsapp_verified_at)
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          institution_id: institutionId || null,
          course_or_class: course.trim() || null,
          graduation_year: gradYear ? parseInt(gradYear, 10) : null,
          whatsapp_number: formattedWhatsapp,
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      if (formattedWhatsapp) setWhatsapp(formattedWhatsapp);
      setStatusMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err) {
      console.error('Update profile error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  // Mark a listing as Sold
  const handleMarkSold = async (listingId) => {
    if (!window.confirm('Mark this textbook as Sold? This closes open interest requests for this listing.')) return;
    setListingActionLoading((prev) => ({ ...prev, [listingId]: true }));
    setStatusMessage({ type: '', text: '' });

    try {
      const { error: rpcErr } = await supabase.rpc('mark_listing_sold', {
        p_listing_id: listingId,
      });

      if (rpcErr) {
        await supabase
          .from('listings')
          .update({ status: 'sold', sold_at: new Date().toISOString() })
          .eq('id', listingId);
      }

      await supabase
        .from('interest_requests')
        .update({ status: 'closed', responded_at: new Date().toISOString() })
        .eq('listing_id', listingId);

      setStatusMessage({ type: 'success', text: 'Textbook marked as Sold!' });
      await fetchMyListings();
    } catch (err) {
      console.error('Mark sold error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to mark listing as sold.' });
    } finally {
      setListingActionLoading((prev) => ({ ...prev, [listingId]: false }));
    }
  };

  // Remove a listing from marketplace
  const handleRemoveListing = async (listingId) => {
    if (!window.confirm('Remove this listing from the marketplace? It will no longer appear in search.')) return;
    setListingActionLoading((prev) => ({ ...prev, [listingId]: true }));
    setStatusMessage({ type: '', text: '' });

    try {
      await supabase
        .from('listings')
        .update({ status: 'removed' })
        .eq('id', listingId);

      await supabase
        .from('interest_requests')
        .update({ status: 'closed', responded_at: new Date().toISOString() })
        .eq('listing_id', listingId);

      setStatusMessage({ type: 'info', text: 'Listing removed from the marketplace.' });
      await fetchMyListings();
    } catch (err) {
      console.error('Remove listing error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to remove listing.' });
    } finally {
      setListingActionLoading((prev) => ({ ...prev, [listingId]: false }));
    }
  };

  // Submit account deletion request
  const handleSubmitDeletion = async () => {
    if (!user) return;
    setDeletionLoading(true);

    try {
      const { error } = await supabase.from('reports').insert({
        reporter_id: user.id,
        reported_user_id: user.id,
        reason: 'account_deletion_request',
        details: deletionReason.trim() || 'User requested account deletion via Profile screen.',
        status: 'open',
      });

      if (error) throw error;

      setHasPendingDeletion(true);
      setPendingDeletionDate(new Date().toISOString());
      setShowDeletionModal(false);
      setStatusMessage({
        type: 'info',
        text: 'Account deletion request submitted. An administrator will review and process your request within 48 hours.',
      });
    } catch (err) {
      console.error('Deletion request error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to submit deletion request.' });
    } finally {
      setDeletionLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Filter listings
  const filteredListings = myListings.filter((b) => {
    if (listingFilter === 'active') return b.status === 'active';
    if (listingFilter === 'sold') return b.status === 'sold';
    return true;
  });

  return (
    <div style={{ maxWidth: '800px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* 1. Header Profile Summary */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-primary-navy)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 'var(--font-size-xl)',
                fontWeight: 700,
              }}
            >
              {profile?.display_name ? profile.display_name.charAt(0).toUpperCase() : <User size={26} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-navy)', margin: 0, wordBreak: 'break-word' }}>
                  {profile?.display_name || user?.email?.split('@')[0] || 'Student Profile'}
                </h1>
                <Chip variant={profile?.account_status === 'suspended' ? 'error' : 'success'} size="sm">
                  {profile?.account_status === 'suspended' ? 'Suspended' : 'Active'}
                </Chip>
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0', wordBreak: 'break-all' }}>
                {user?.email || 'Logged in user'}
              </p>
              {profile?.institutions?.name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  <School size={12} style={{ color: 'var(--color-primary-navy)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                    {profile.institutions.name}{profile.institutions.area ? ` (${profile.institutions.area})` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={handleSignOut} style={{ flexShrink: 0 }}>
            <LogOut size={15} />
            <span>Sign Out</span>
          </Button>
        </div>
      </Card>

      {/* Account Suspended Alert Banner */}
      {profile?.account_status === 'suspended' && (
        <Alert variant="error" title="Account Suspended by Moderation">
          Your account is currently suspended due to safety or moderation policies. You cannot publish new listings or send interest requests. If you believe this is in error or wish to appeal, please contact the administrator at{' '}
          <a
            href="mailto:support@bookloop.in"
            style={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}
          >
            support@bookloop.in
          </a>.
        </Alert>
      )}

      {/* 2. Profile Completion Nudge for WhatsApp */}
      {!profile?.whatsapp_number && (
        <Alert variant="warning" title="Add your WhatsApp number to start selling">
          You haven't saved a WhatsApp number yet. BookLoop requires a verified contact number before you can accept interest requests and coordinate campus book handovers.
        </Alert>
      )}

      {/* Pending Account Deletion Notice if applicable */}
      {hasPendingDeletion && (
        <Alert variant="info" title="Account Deletion Request Pending">
          You submitted an account deletion request on{' '}
          {pendingDeletionDate
            ? new Date(pendingDeletionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : 'recently'}.
          A platform administrator will process your removal in accordance with data retention standards.
        </Alert>
      )}

      {statusMessage.text && (
        <Alert variant={statusMessage.type === 'error' ? 'error' : statusMessage.type === 'success' ? 'success' : 'info'}>
          {statusMessage.text}
        </Alert>
      )}

      {/* 3. Quick Navigation Cards - Perfectly Balanced */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)', alignItems: 'stretch' }}>
        <Link to="/requests" style={{ display: 'flex', height: '100%', textDecoration: 'none' }}>
          <Card
            hoverable
            style={{
              flex: 1,
              width: '100%',
              minHeight: '74px',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-3)',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-secondary-soft-blue)',
                color: 'var(--color-primary-navy)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MessageSquare size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-navy)', display: 'block', lineHeight: 1.2 }}>
                Requests
              </strong>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginTop: '2px', lineHeight: 1.3 }}>
                Track handovers
              </span>
            </div>
          </Card>
        </Link>

        <Link to="/listings/new" style={{ display: 'flex', height: '100%', textDecoration: 'none' }}>
          <Card
            hoverable
            style={{
              flex: 1,
              width: '100%',
              minHeight: '74px',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-3)',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-secondary-soft-blue)',
                color: 'var(--color-primary-navy)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PlusCircle size={18} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary-navy)', display: 'block', lineHeight: 1.2 }}>
                Sell a Book
              </strong>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block', marginTop: '2px', lineHeight: 1.3 }}>
                Pass to a junior
              </span>
            </div>
          </Card>
        </Link>
      </div>

      {/* 4. Edit Profile Form */}
      <Card>
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary-navy)', margin: 0 }}>
            Personal & Academic Profile
          </h2>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Only allowed fields are editable. Account status and verification fields are locked by database security.
          </p>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Display Name */}
          <Input
            label="Display Name *"
            placeholder="e.g. Rahul Sharma"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            helperText="Visible to students on your book listings and interest requests."
          />

          {/* Institution Selection */}
          <Select
            label="School / College / Institution *"
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            options={[
              { value: '', label: 'Select your institution...' },
              ...institutions.map((inst) => ({
                value: inst.id,
                label: `${inst.name}${inst.area ? ` (${inst.area})` : ''}`,
              })),
            ]}
            helperText="Selecting your institution helps campus peers find nearby books."
          />

          {/* Course / Class - Clean dedicated full-width row */}
          <Input
            label="Course / Class"
            placeholder="e.g. B.Tech CS, 12th Sci, 2nd Year Mechanical"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            helperText="e.g. 2nd Year Mechanical, B.Com 1st Year"
          />

          {/* Optional Graduation Year - Clean dedicated full-width row */}
          <Select
            label="Graduation Year (Optional)"
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value)}
            options={[
              { value: '', label: 'Select year...' },
              ...GRADUATION_YEARS.map((y) => ({ value: y, label: `Class of ${y}` })),
            ]}
            helperText="Helps juniors connect with seniors"
          />

          {/* WhatsApp Handover Contact & Privacy Explanation */}
          <div style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 'var(--space-4)' }}>
            <Input
              label="WhatsApp Handover Number"
              placeholder="e.g. 9876543210 or +919876543210"
              prefix={<Phone size={16} />}
              value={whatsapp}
              onChange={(e) => {
                setWhatsapp(e.target.value);
                setPhoneError('');
              }}
              error={phoneError}
              helperText="Format: 10-digit Indian mobile number (e.g. 9876543210)"
            />

            <div
              style={{
                marginTop: 'var(--space-2)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-secondary-soft-blue)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-primary-navy)',
                lineHeight: 1.5,
              }}
            >
              <strong>🔒 Strict Privacy Guarantee:</strong> Your phone number is never visible publicly in search, catalogue, or profile. It is securely encrypted and only revealed to a buyer after you explicitly accept their interest request for a specific book.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <Button type="submit" variant="primary" loading={saving}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </Card>

      {/* 5. User's Own Listings */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary-navy)', margin: 0 }}>
              My Listings ({myListings.length})
            </h2>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Manage your published books, edit prices, mark as sold, or remove.
            </p>
          </div>
          <Link to="/listings/new">
            <Button variant="secondary" size="sm">
              <PlusCircle size={14} />
              <span>List Another Book</span>
            </Button>
          </Link>
        </div>

        {/* Filter Pills */}
        {myListings.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <button
              type="button"
              onClick={() => setListingFilter('all')}
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                border: 'none',
                background: listingFilter === 'all' ? 'var(--color-primary-navy)' : 'var(--color-secondary-soft-blue)',
                color: listingFilter === 'all' ? '#FFFFFF' : 'var(--color-primary-navy)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All ({myListings.length})
            </button>
            <button
              type="button"
              onClick={() => setListingFilter('active')}
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                border: 'none',
                background: listingFilter === 'active' ? 'var(--color-primary-navy)' : 'var(--color-secondary-soft-blue)',
                color: listingFilter === 'active' ? '#FFFFFF' : 'var(--color-primary-navy)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Active ({myListings.filter((b) => b.status === 'active').length})
            </button>
            <button
              type="button"
              onClick={() => setListingFilter('sold')}
              style={{
                padding: '4px 10px',
                borderRadius: '9999px',
                border: 'none',
                background: listingFilter === 'sold' ? 'var(--color-primary-navy)' : 'var(--color-secondary-soft-blue)',
                color: listingFilter === 'sold' ? '#FFFFFF' : 'var(--color-primary-navy)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sold ({myListings.filter((b) => b.status === 'sold').length})
            </button>
          </div>
        )}

        {loadingListings ? (
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Loading your listings...</p>
        ) : filteredListings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {filteredListings.map((book) => {
              const imgPath = book.listing_images?.[0]?.storage_path;
              const imgUrl = getListingImageUrl(imgPath);
              const isActive = book.status === 'active';
              const isLoading = listingActionLoading[book.id];

              return (
                <div
                  key={book.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap',
                    backgroundColor: isActive ? '#FFFFFF' : 'rgba(0, 0, 0, 0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: '220px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#f1f2f5', flexShrink: 0 }}>
                      {imgUrl ? (
                        <img src={imgUrl} alt={book.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary-navy)' }}>
                          <BookOpen size={20} />
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link to={`/listings/${book.id}`} style={{ textDecoration: 'none' }}>
                        <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-main)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {book.title}
                        </h4>
                      </Link>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: '2px' }}>
                        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
                          {formatRupees(book.price_paise)}
                        </span>
                        <Chip
                          variant={book.status === 'active' ? 'success' : book.status === 'sold' ? 'warning' : 'default'}
                          size="sm"
                        >
                          {book.status.toUpperCase()}
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons for Listing */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0, alignItems: 'center' }}>
                    <Link to={`/listings/${book.id}`}>
                      <Button variant="ghost" size="sm" title="View Public Listing">
                        <ExternalLink size={14} />
                      </Button>
                    </Link>

                    {isActive && (
                      <>
                        <Link to={`/listings/${book.id}/edit`}>
                          <Button variant="outline" size="sm">
                            <Edit3 size={14} />
                            <span>Edit</span>
                          </Button>
                        </Link>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={isLoading}
                          onClick={() => handleMarkSold(book.id)}
                          title="Mark as Sold"
                        >
                          <Check size={14} />
                          <span>Mark Sold</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={isLoading}
                          onClick={() => handleRemoveListing(book.id)}
                          title="Remove from Marketplace"
                          style={{ color: 'var(--color-error)' }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No Books in this Tab"
            description="You don't have any textbooks matching this filter."
            actionLabel="List a Book"
            onAction={() => navigate('/listings/new')}
          />
        )}
      </Card>

      {/* 6. Account Privacy & Deletion Request Action */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-primary-navy)', margin: 0 }}>
              Account Data & Deletion
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px', maxWidth: '440px' }}>
              Want to leave BookLoop? You can submit a deletion request. Deletions are processed by an administrator to preserve campus transaction records.
            </p>
          </div>

          {hasPendingDeletion ? (
            <Chip variant="warning">Deletion Pending Review</Chip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeletionModal(true)}
              style={{ color: 'var(--color-error)', borderColor: 'var(--color-border)' }}
            >
              <Trash2 size={14} />
              <span>Request Account Deletion</span>
            </Button>
          )}
        </div>

        {/* Contact Administrator note */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Have a dispute, moderation question, or campus inquiry?
          </span>
          <a
            href="mailto:support@bookloop.in"
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-primary-navy)',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Mail size={14} />
            <span>Contact Administrator (support@bookloop.in)</span>
          </a>
        </div>
      </Card>

      {/* Modal: Account Deletion Request */}
      <Modal
        isOpen={showDeletionModal}
        onClose={() => setShowDeletionModal(false)}
        title="Request Account Deletion"
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setShowDeletionModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={deletionLoading}
              onClick={handleSubmitDeletion}
              style={{ backgroundColor: 'var(--color-error)', borderColor: 'var(--color-error)' }}
            >
              Submit Deletion Request
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Alert variant="warning" title="What happens when you request deletion?">
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>Your active listings will be removed from search and marketplace.</li>
              <li>Open interest requests will be cancelled.</li>
              <li>A moderator will review and permanently delete your profile within 48 hours.</li>
            </ul>
          </Alert>

          <div>
            <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-main)', display: 'block', marginBottom: 'var(--space-1)' }}>
              Reason for Leaving (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Graduated, no longer need to buy or sell books..."
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
