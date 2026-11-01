import React, { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  Users,
  BookOpen,
  School,
  FileText,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  UserX,
  UserCheck,
  Plus,
  Search,
  RotateCcw,
  History,
  TrendingUp,
  MessageSquare,
  Check,
  X,
  Trash2,
  Clock,
  ArrowRight,
  ExternalLink,
  Copy,
  FileEdit,
  Tag,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Chip from '../components/common/Chip';
import Alert from '../components/common/Alert';
import Modal from '../components/common/Modal';
import LoadingState from '../components/common/LoadingState';
import EmptyState from '../components/common/EmptyState';
import Pagination from '../components/common/Pagination';
import { formatRupees, formatListingRef, getListingImageUrl } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchCachedInstitutions, invalidateCachePattern } from '../lib/cache';

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' | 'listings' | 'users' | 'institutions' | 'audit' | 'stats'

  // Platform Counts
  const [stats, setStats] = useState({
    totalListings: 0,
    activeListings: 0,
    soldListings: 0,
    totalRequests: 0,
    acceptedRequests: 0,
    openReports: 0,
    totalUsers: 0,
  });

  // Reports
  const [reports, setReports] = useState([]);
  const [reportFilter, setReportFilter] = useState('all'); // 'all' | 'open' | 'reviewing' | 'resolved' | 'dismissed'

  // Listings
  const [listings, setListings] = useState([]);
  const [listingSearch, setListingSearch] = useState('');
  const [listingStatusFilter, setListingStatusFilter] = useState('all');

  // Listing Dossier & Full Audit Trail Modal
  const [selectedListingDossier, setSelectedListingDossier] = useState(null);
  const [listingAuditLogs, setListingAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  // Users
  const [profiles, setProfiles] = useState([]);
  const [userSearch, setUserSearch] = useState('');

  // Institutions
  const [institutions, setInstitutions] = useState([]);
  const [instUserCounts, setInstUserCounts] = useState({});
  const [instListingCounts, setInstListingCounts] = useState({});
  const [showAddInstModal, setShowAddInstModal] = useState(false);
  const [newInst, setNewInst] = useState({ name: '', institution_type: 'College', city: 'Indore', area: '' });

  // Institution Deletion Safety Modal
  const [deleteInstModal, setDeleteInstModal] = useState({
    isOpen: false,
    inst: null,
    userCount: 0,
    listingCount: 0,
    reassignToId: '',
  });

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);

  // Action Loading & Feedback
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Reason Modal for Moderation (Hide listing / Suspend user / Reactivate user / Delete user)
  const [modModal, setModModal] = useState({
    isOpen: false,
    type: '', // 'hide_listing' | 'suspend_user' | 'reactivate_user' | 'delete_user'
    targetId: null,
    targetTitle: '',
    reason: '',
  });

  // Pagination States (10 items per page)
  const ADMIN_PAGE_SIZE = 10;
  const [reportsPage, setReportsPage] = useState(1);
  const [listingsPage, setListingsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  const fetchData = async () => {
    if (!isAdmin || !isSupabaseConfigured) return;

    try {
      // 1. Fetch Stats & Counts
      const [
        { count: totalListings },
        { count: activeListings },
        { count: soldListings },
        { count: totalRequests },
        { count: acceptedRequests },
        { count: openReports },
        { count: totalUsers },
      ] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true }),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'sold'),
        supabase.from('interest_requests').select('id', { count: 'exact', head: true }),
        supabase.from('interest_requests').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalListings: totalListings || 0,
        activeListings: activeListings || 0,
        soldListings: soldListings || 0,
        totalRequests: totalRequests || 0,
        acceptedRequests: acceptedRequests || 0,
        openReports: openReports || 0,
        totalUsers: totalUsers || 0,
      });

      // 2. Fetch Reports
      const { data: repData } = await supabase
        .from('reports')
        .select(`
          id,
          reason,
          details,
          status,
          created_at,
          resolved_at,
          reporter_id,
          listing_id,
          reported_user_id,
          profiles!reports_reporter_id_fkey (display_name),
          listings (id, reference_no, title, status, seller_id),
          reported_user:profiles!reports_reported_user_id_fkey (id, display_name, account_status)
        `)
        .order('created_at', { ascending: false });

      setReports(repData || []);

      // 3. Fetch Full Listings for Moderation & Dossiers
      const { data: listData } = await supabase
        .from('listings')
        .select(`
          id,
          reference_no,
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
          updated_at,
          sold_at,
          seller_id,
          profiles!listings_seller_id_fkey (id, display_name, account_status, created_at),
          institutions (id, name, area, city),
          listing_images (id, storage_path, display_order)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      setListings(listData || []);

      // 4. Fetch Users
      const { data: profData } = await supabase
        .from('profiles')
        .select(`
          id,
          display_name,
          account_status,
          created_at,
          institutions (id, name, area, city)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      setProfiles(profData || []);

      // 5. Fetch Institutions and count linked profiles & listings
      const [instData, { data: allProfilesWithInst }, { data: allListingsWithInst }] = await Promise.all([
        fetchCachedInstitutions(),
        supabase.from('profiles').select('institution_id'),
        supabase.from('listings').select('institution_id'),
      ]);

      const userCountMap = {};
      (allProfilesWithInst || []).forEach((p) => {
        if (p.institution_id) {
          userCountMap[p.institution_id] = (userCountMap[p.institution_id] || 0) + 1;
        }
      });
      setInstUserCounts(userCountMap);

      const listCountMap = {};
      (allListingsWithInst || []).forEach((l) => {
        if (l.institution_id) {
          listCountMap[l.institution_id] = (listCountMap[l.institution_id] || 0) + 1;
        }
      });
      setInstListingCounts(listCountMap);

      setInstitutions(instData || []);

      // 6. Fetch Audit Logs
      const { data: auditData } = await supabase
        .from('admin_audit_logs')
        .select(`
          id,
          action,
          target_type,
          target_id,
          reason,
          created_at,
          profiles (display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      setAuditLogs(auditData || []);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAdmin]);

  // Update Report Status
  const handleUpdateReportStatus = async (reportId, newStatus) => {
    setActionLoading(true);
    setFeedback({ type: '', message: '' });

    try {
      const { error } = await supabase.rpc('admin_update_report_status', {
        p_report_id: reportId,
        p_status: newStatus,
        p_note: `Report status updated to ${newStatus}`,
      });

      if (error) throw error;

      setFeedback({ type: 'success', message: `Report marked as ${newStatus}.` });
      fetchData();
    } catch (err) {
      console.error('Report update error:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to update report status.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Inspect Listing: Load Full Details & Complete Behavior / Lifecycle Audit Trail
  const handleInspectListing = async (listing) => {
    setSelectedListingDossier(listing);
    setLoadingAudit(true);
    setListingAuditLogs([]);
    setCopiedRef(false);

    try {
      // 1. Try to query database-level listing_activity_logs via RPC
      const { data: auditRpcData, error: rpcErr } = await supabase.rpc('get_listing_lifecycle_audit', {
        p_listing_id: listing.id,
      });

      if (!rpcErr && auditRpcData && auditRpcData.length > 0) {
        setListingAuditLogs(auditRpcData);
      } else {
        // 2. Synthesize complete timeline from listing, edits, and all interest_requests
        const { data: reqs } = await supabase
          .from('interest_requests')
          .select(`
            id,
            buyer_id,
            status,
            created_at,
            responded_at,
            profiles!interest_requests_buyer_id_fkey (display_name)
          `)
          .eq('listing_id', listing.id)
          .order('created_at', { ascending: true });

        const timeline = [];

        // Event 0: Created
        timeline.push({
          id: `created-${listing.id}`,
          action_type: 'created',
          summary: `Listing published on marketplace by ${listing.profiles?.display_name || 'Seller'}`,
          actor_name: listing.profiles?.display_name || 'Seller',
          created_at: listing.created_at,
          details: {
            title: listing.title,
            price_paise: listing.price_paise,
            condition: listing.condition,
            category: listing.category,
          },
        });

        // Event: Edited (if updated_at is distinctly after created_at)
        if (listing.updated_at && new Date(listing.updated_at).getTime() - new Date(listing.created_at).getTime() > 1000) {
          timeline.push({
            id: `edited-${listing.id}`,
            action_type: 'edited',
            summary: 'Seller updated listing details (Title, Price, or Description)',
            actor_name: listing.profiles?.display_name || 'Seller',
            created_at: listing.updated_at,
            details: {
              title: listing.title,
              price: formatRupees(listing.price_paise),
            },
          });
        }

        // Events: Interest requests lifecycle
        (reqs || []).forEach((r) => {
          const buyerName = r.profiles?.display_name || 'Student';

          timeline.push({
            id: `req-${r.id}`,
            action_type: 'request_received',
            summary: `Buyer expressed interest: ${buyerName}`,
            actor_name: buyerName,
            created_at: r.created_at,
            details: { buyer_name: buyerName },
          });

          if (r.status === 'accepted') {
            timeline.push({
              id: `acc-${r.id}`,
              action_type: 'request_accepted',
              summary: `Seller accepted request from ${buyerName} and revealed WhatsApp contact`,
              actor_name: listing.profiles?.display_name || 'Seller',
              created_at: r.responded_at || r.created_at,
              details: { buyer_name: buyerName },
            });
          } else if (r.status === 'declined') {
            timeline.push({
              id: `dec-${r.id}`,
              action_type: 'request_declined',
              summary: `Seller declined interest request from ${buyerName}`,
              actor_name: listing.profiles?.display_name || 'Seller',
              created_at: r.responded_at || r.created_at,
              details: { buyer_name: buyerName },
            });
          } else if (r.status === 'cancelled') {
            timeline.push({
              id: `can-${r.id}`,
              action_type: 'request_cancelled',
              summary: `Buyer ${buyerName} cancelled their interest request`,
              actor_name: buyerName,
              created_at: r.responded_at || r.created_at,
              details: { buyer_name: buyerName },
            });
          }
        });

        // Event: Sold or Removed
        if (listing.status === 'sold') {
          timeline.push({
            id: `sold-${listing.id}`,
            action_type: 'marked_sold',
            summary: 'Listing marked as SOLD; all remaining pending requests archived',
            actor_name: listing.profiles?.display_name || 'Seller',
            created_at: listing.sold_at || listing.updated_at,
            details: { status: 'sold' },
          });
        } else if (listing.status === 'removed') {
          timeline.push({
            id: `removed-${listing.id}`,
            action_type: 'admin_hidden',
            summary: 'Administrator took down listing for policy review',
            actor_name: 'Moderator',
            created_at: listing.updated_at,
            details: { status: 'removed' },
          });
        }

        timeline.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        setListingAuditLogs(timeline);
      }
    } catch (err) {
      console.error('Audit trail load error:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  // Copy reference number helper
  const handleCopyRef = (refNo) => {
    navigator.clipboard.writeText(refNo);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  // Execute Moderation Actions (Hide Listing / Suspend User / Reactivate User / Delete User)
  const handleExecuteModeration = async () => {
    setActionLoading(true);
    setFeedback({ type: '', message: '' });

    const reason = modModal.reason.trim() || 'Action authorized by platform administrator';

    try {
      if (modModal.type === 'hide_listing') {
        const { error } = await supabase.rpc('admin_hide_listing', {
          p_listing_id: modModal.targetId,
          p_reason: reason,
        });

        if (error) throw error;

        invalidateCachePattern('listings');
        setFeedback({ type: 'success', message: `Listing "${modModal.targetTitle}" has been removed from the marketplace.` });
      } else if (modModal.type === 'suspend_user') {
        const { error } = await supabase.rpc('admin_suspend_user', {
          p_target_user_id: modModal.targetId,
          p_reason: reason,
        });

        if (error) throw error;

        setFeedback({ type: 'warning', message: `Student account "${modModal.targetTitle}" has been suspended.` });
      } else if (modModal.type === 'reactivate_user') {
        const { error } = await supabase.rpc('admin_reactivate_user', {
          p_target_user_id: modModal.targetId,
          p_reason: reason,
        });

        if (error) throw error;

        setFeedback({ type: 'success', message: `Student account "${modModal.targetTitle}" has been reinstated.` });
      } else if (modModal.type === 'delete_user') {
        // PERMANENT DELETION (admin_delete_user)
        const { error } = await supabase.rpc('admin_delete_user', {
          p_target_user_id: modModal.targetId,
          p_reason: reason,
        });

        if (error) throw error;

        invalidateCachePattern('listings');
        setFeedback({
          type: 'success',
          message: `Account "${modModal.targetTitle}" was permanently deleted. All authentication credentials, profiles, and listings have been wiped. Next login will treat user as unregistered.`,
        });
      }

      setModModal({ isOpen: false, type: '', targetId: null, targetTitle: '', reason: '' });
      setSelectedListingDossier(null);
      fetchData();
    } catch (err) {
      console.error('Moderation action error:', err);
      setFeedback({ type: 'error', message: err.message || 'Moderation action failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Add Institution
  const handleAddInstitution = async (e) => {
    e.preventDefault();
    if (!newInst.name.trim()) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.from('institutions').insert({
        name: newInst.name.trim(),
        institution_type: newInst.institution_type,
        city: newInst.city.trim() || 'Indore',
        area: newInst.area.trim() || null,
        is_active: true,
      });

      if (error) throw error;
      invalidateCachePattern('institutions');
      setFeedback({ type: 'success', message: `Added "${newInst.name}" to institutions.` });
      setShowAddInstModal(false);
      setNewInst({ name: '', institution_type: 'College', city: 'Indore', area: '' });
      fetchData();
    } catch (err) {
      console.error('Add institution error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to add institution.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Institution Active Status
  const handleToggleInstitution = async (instId, currentActive) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('institutions')
        .update({ is_active: !currentActive })
        .eq('id', instId);

      if (error) throw error;
      invalidateCachePattern('institutions');
      setFeedback({ type: 'info', message: 'Institution status updated.' });
      fetchData();
    } catch (err) {
      console.error('Toggle institution error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to update institution status.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Initiate Institution Deletion (Checks linked users & listings to prevent orphan records)
  const handleInitiateDeleteInstitution = (inst) => {
    const userCount = instUserCounts[inst.id] || 0;
    const listingCount = instListingCounts[inst.id] || 0;

    setDeleteInstModal({
      isOpen: true,
      inst,
      userCount,
      listingCount,
      reassignToId: '',
    });
  };

  // Execute Institution Deletion (with optional reassignment)
  const handleExecuteDeleteInstitution = async () => {
    if (!deleteInstModal.inst) return;
    setActionLoading(true);
    setFeedback({ type: '', message: '' });

    try {
      const { error } = await supabase.rpc('admin_delete_institution', {
        p_institution_id: deleteInstModal.inst.id,
        p_reassign_to_id: deleteInstModal.reassignToId || null,
      });

      if (error) throw error;

      invalidateCachePattern('institutions');
      setFeedback({
        type: 'success',
        message: `Deleted "${deleteInstModal.inst.name}". ${
          deleteInstModal.reassignToId
            ? 'Associated students and listings were safely reassigned.'
            : 'Associated students and listings were set to unassigned.'
        }`,
      });
      setDeleteInstModal({ isOpen: false, inst: null, userCount: 0, listingCount: 0, reassignToId: '' });
      fetchData();
    } catch (err) {
      console.error('Delete institution error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to delete institution.' });
    } finally {
      setActionLoading(false);
    }
  };

  // One-Click Action: Purge Pune Institutes & Seed Categorized Indore Institutions
  const handleSeedIndoreInstitutions = async () => {
    if (
      !window.confirm(
        'Are you sure you want to purge all old Pune institutions and seed the categorized Indore institutions (Engineering, Medical, Pharmacy, Management, Schools)? Existing student profiles will have their institution safely unlinked.'
      )
    ) {
      return;
    }

    setActionLoading(true);
    setFeedback({ type: '', message: '' });

    try {
      const { data, error } = await supabase.rpc('admin_seed_indore_institutions');
      if (error) throw error;

      invalidateCachePattern('institutions');
      setFeedback({
        type: 'success',
        message: `Successfully seeded ${data || 35} categorized Indore institutions! Marketplace is now centered around Indore colleges and schools.`,
      });
      fetchData();
    } catch (err) {
      console.error('Seed Indore institutions error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to seed Indore institutions.' });
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading) {
    return <LoadingState message="Checking administrator privileges..." />;
  }

  // Strict 403 Forbidden Access Guard
  if (!isAdmin) {
    return (
      <div style={{ maxWidth: '540px', margin: 'var(--space-8) auto', textAlign: 'center' }}>
        <Card style={{ padding: 'var(--space-6)' }}>
          <Shield size={48} color="var(--color-error)" style={{ margin: '0 auto var(--space-3)' }} />
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
            403 - Access Denied
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 'var(--space-3) 0 var(--space-5)' }}>
            This section is restricted to authorized platform administrators and moderators. Your user ID is not registered in the <code>admin_roles</code> database table.
          </p>
          <div style={{ backgroundColor: 'var(--color-secondary-soft-blue)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-xs)', textAlign: 'left', marginBottom: 'var(--space-4)' }}>
            <strong>To assign your first admin role, run in Supabase SQL editor:</strong>
            <pre style={{ margin: '6px 0 0', overflowX: 'auto', color: 'var(--color-primary-navy)' }}>
              {`INSERT INTO public.admin_roles (user_id, role)\nVALUES ('${user?.id || '<USER_UUID>'}', 'admin')\nON CONFLICT (user_id) DO NOTHING;`}
            </pre>
          </div>
          <Button variant="primary" onClick={() => (window.location.href = '/')}>
            Return to Marketplace
          </Button>
        </Card>
      </div>
    );
  }

  // Derived Paginated Data
  const filteredReports = reports.filter((r) => reportFilter === 'all' || r.status === reportFilter);
  const totalReportPages = Math.ceil(filteredReports.length / ADMIN_PAGE_SIZE) || 1;
  const paginatedReports = filteredReports.slice((reportsPage - 1) * ADMIN_PAGE_SIZE, reportsPage * ADMIN_PAGE_SIZE);

  const filteredListings = listings.filter((l) => {
    const matchesSearch =
      l.title.toLowerCase().includes(listingSearch.toLowerCase()) ||
      (l.author && l.author.toLowerCase().includes(listingSearch.toLowerCase())) ||
      (l.profiles?.display_name && l.profiles.display_name.toLowerCase().includes(listingSearch.toLowerCase())) ||
      (l.reference_no && l.reference_no.toLowerCase().includes(listingSearch.toLowerCase())) ||
      formatListingRef(l).toLowerCase().includes(listingSearch.toLowerCase());

    const matchesStatus = listingStatusFilter === 'all' || l.status === listingStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const totalListingPages = Math.ceil(filteredListings.length / ADMIN_PAGE_SIZE) || 1;
  const paginatedListings = filteredListings.slice((listingsPage - 1) * ADMIN_PAGE_SIZE, listingsPage * ADMIN_PAGE_SIZE);

  const filteredUsers = profiles.filter((p) => p.display_name.toLowerCase().includes(userSearch.toLowerCase()));
  const totalUserPages = Math.ceil(filteredUsers.length / ADMIN_PAGE_SIZE) || 1;
  const paginatedUsers = filteredUsers.slice((usersPage - 1) * ADMIN_PAGE_SIZE, usersPage * ADMIN_PAGE_SIZE);

  const totalAuditPages = Math.ceil(auditLogs.length / ADMIN_PAGE_SIZE) || 1;
  const paginatedAuditLogs = auditLogs.slice((auditPage - 1) * ADMIN_PAGE_SIZE, auditPage * ADMIN_PAGE_SIZE);

  return (
    <div style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Admin Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary-navy)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Shield size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, margin: 0, color: 'var(--color-primary-navy)' }}>
              Safety & Moderation Center
            </h1>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
              Logged in as Admin: <strong>{user?.email}</strong> &bull; Indore Campus Directory
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={fetchData}>
          <RotateCcw size={14} />
          <span>Refresh Console</span>
        </Button>
      </div>

      {/* Global Alerts */}
      {feedback.message && (
        <Alert variant={feedback.type || 'info'} onClose={() => setFeedback({ type: '', message: '' })}>
          {feedback.message}
        </Alert>
      )}

      {/* KPI Stats Overview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        <Card style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Open Reports</span>
            <AlertTriangle size={18} color="var(--color-error)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-error)', marginTop: '4px' }}>
            {stats.openReports}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Active Books</span>
            <BookOpen size={18} color="var(--color-primary-navy)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)', marginTop: '4px' }}>
            {stats.activeListings}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Sold Handed Over</span>
            <TrendingUp size={18} color="var(--color-success)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
            {stats.soldListings}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Accepted Meets</span>
            <MessageSquare size={18} color="var(--color-accent-amber)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-accent-amber)', marginTop: '4px' }}>
            {stats.acceptedRequests}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Registered Students</span>
            <Users size={18} color="var(--color-primary-navy)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)', marginTop: '4px' }}>
            {stats.totalUsers}
          </div>
        </Card>
      </div>

      {/* Admin Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--space-2)',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: activeTab === 'reports' ? 'var(--color-primary-navy)' : 'transparent',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            color: activeTab === 'reports' ? '#FFFFFF' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.15s ease',
          }}
        >
          <AlertTriangle size={16} />
          <span>User Reports</span>
          {stats.openReports > 0 && (
            <span style={{ backgroundColor: 'var(--color-error)', color: '#fff', borderRadius: '9999px', padding: '1px 6px', fontSize: '10px' }}>
              {stats.openReports}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('listings')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: activeTab === 'listings' ? 'var(--color-primary-navy)' : 'transparent',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            color: activeTab === 'listings' ? '#FFFFFF' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.15s ease',
          }}
        >
          <BookOpen size={16} />
          <span>Listings Moderation</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('users')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: activeTab === 'users' ? 'var(--color-primary-navy)' : 'transparent',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            color: activeTab === 'users' ? '#FFFFFF' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.15s ease',
          }}
        >
          <Users size={16} />
          <span>User Accounts</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('institutions')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: activeTab === 'institutions' ? 'var(--color-primary-navy)' : 'transparent',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            color: activeTab === 'institutions' ? '#FFFFFF' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.15s ease',
          }}
        >
          <School size={16} />
          <span>Institutions (Indore)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: activeTab === 'audit' ? 'var(--color-primary-navy)' : 'transparent',
            fontWeight: 600,
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            color: activeTab === 'audit' ? '#FFFFFF' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            transition: 'background-color 0.15s ease',
          }}
        >
          <History size={16} />
          <span>Audit Log</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: REPORTS MANAGEMENT                                      */}
      {/* ============================================================== */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {['all', 'open', 'reviewing', 'resolved', 'dismissed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setReportFilter(st);
                  setReportsPage(1);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  border: 'none',
                  background: reportFilter === st ? 'var(--color-primary-navy)' : 'var(--color-secondary-soft-blue)',
                  color: reportFilter === st ? '#fff' : 'var(--color-primary-navy)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          {paginatedReports.map((rep) => {
            const isListingTarget = Boolean(rep.listing_id && rep.listings);
            const isUserTarget = Boolean(rep.reported_user_id && rep.reported_user);

            return (
              <Card key={rep.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text-main)' }}>
                        {rep.reason}
                      </span>
                      <Chip
                        variant={
                          rep.status === 'open'
                            ? 'error'
                            : rep.status === 'reviewing'
                              ? 'warning'
                              : rep.status === 'resolved'
                                ? 'success'
                                : 'default'
                        }
                        size="sm"
                      >
                        {rep.status.toUpperCase()}
                      </Chip>
                    </div>

                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                      Reported by: <strong>{rep.profiles?.display_name || 'Anonymous Student'}</strong> &bull;{' '}
                      {new Date(rep.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {/* Status Changer */}
                  <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                    {rep.status !== 'reviewing' && rep.status !== 'resolved' && (
                      <Button variant="ghost" size="sm" onClick={() => handleUpdateReportStatus(rep.id, 'reviewing')}>
                        Mark Reviewing
                      </Button>
                    )}
                    {rep.status !== 'resolved' && (
                      <Button variant="outline" size="sm" onClick={() => handleUpdateReportStatus(rep.id, 'resolved')}>
                        Resolve
                      </Button>
                    )}
                    {rep.status !== 'dismissed' && (
                      <Button variant="ghost" size="sm" onClick={() => handleUpdateReportStatus(rep.id, 'dismissed')}>
                        Dismiss
                      </Button>
                    )}
                  </div>
                </div>

                {/* Target Information Card */}
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div>
                    {isListingTarget && (
                      <div>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Target Listing: </span>
                        <strong>{rep.listings.title}</strong>{' '}
                        <span style={{ fontSize: '11px', color: 'var(--color-primary-navy)', fontWeight: 700, marginLeft: '6px' }}>
                          #{formatListingRef(rep.listings)}
                        </span>{' '}
                        <Chip variant={rep.listings.status === 'active' ? 'success' : 'default'} size="sm">
                          {rep.listings.status.toUpperCase()}
                        </Chip>
                      </div>
                    )}

                    {isUserTarget && (
                      <div style={{ marginTop: isListingTarget ? '4px' : '0' }}>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Reported User: </span>
                        <strong>{rep.reported_user.display_name}</strong>{' '}
                        <Chip variant={rep.reported_user.account_status === 'active' ? 'success' : 'error'} size="sm">
                          {rep.reported_user.account_status.toUpperCase()}
                        </Chip>
                      </div>
                    )}

                    {rep.details && (
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-main)', margin: '6px 0 0 0', fontStyle: 'italic' }}>
                        "{rep.details}"
                      </p>
                    )}
                  </div>

                  {/* Quick Action Shortcuts */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {isListingTarget && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const fullListing = listings.find((l) => l.id === rep.listings.id) || rep.listings;
                          handleInspectListing(fullListing);
                        }}
                      >
                        <Eye size={14} />
                        <span>Inspect Dossier</span>
                      </Button>
                    )}

                    {isListingTarget && rep.listings.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() =>
                          setModModal({
                            isOpen: true,
                            type: 'hide_listing',
                            targetId: rep.listings.id,
                            targetTitle: rep.listings.title,
                            reason: `Report resolved: ${rep.reason}`,
                          })
                        }
                      >
                        <EyeOff size={14} />
                        <span>Hide</span>
                      </Button>
                    )}

                    {isUserTarget && rep.reported_user.account_status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() =>
                          setModModal({
                            isOpen: true,
                            type: 'suspend_user',
                            targetId: rep.reported_user.id,
                            targetTitle: rep.reported_user.display_name,
                            reason: `Report resolved: ${rep.reason}`,
                          })
                        }
                      >
                        <UserX size={14} />
                        <span>Suspend</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {filteredReports.length > 0 && (
            <Pagination
              currentPage={reportsPage}
              totalPages={totalReportPages}
              totalItems={filteredReports.length}
              pageSize={ADMIN_PAGE_SIZE}
              onPageChange={setReportsPage}
              itemName="reports"
            />
          )}

          {reports.length === 0 && (
            <EmptyState title="No Reports Filed" description="The community is safe and clean. No user reports have been submitted." />
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: LISTINGS MODERATION (END-TO-END DOSSIER & AUDIT TRAIL)  */}
      {/* ============================================================== */}
      {activeTab === 'listings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <Input
                placeholder="Search by Listing Reference (BL-XXXX), Title, Author, or Seller..."
                value={listingSearch}
                onChange={(e) => {
                  setListingSearch(e.target.value);
                  setListingsPage(1);
                }}
                prefix={<Search size={16} />}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
              {['all', 'active', 'reserved', 'sold', 'removed'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setListingStatusFilter(st);
                    setListingsPage(1);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: listingStatusFilter === st ? 'var(--color-primary-navy)' : '#fff',
                    color: listingStatusFilter === st ? '#fff' : 'var(--color-text-muted)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {paginatedListings.map((l) => {
              const refNo = formatListingRef(l);
              const coverImg = l.listing_images?.[0]?.storage_path ? getListingImageUrl(l.listing_images[0].storage_path) : null;
              const listingReports = reports.filter((r) => r.listing_id === l.id && r.status !== 'dismissed');

              return (
                <Card
                  key={l.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)',
                    borderLeft: listingReports.length > 0 ? '4px solid var(--color-error)' : '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: '300px', flex: 1 }}>
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: '56px',
                        height: '68px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: '#E2E8F0',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {coverImg ? (
                        <img src={coverImg} alt={l.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <BookOpen size={24} color="#94A3B8" />
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
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
                            fontSize: '11px',
                          }}
                        >
                          <Tag size={10} />
                          {refNo}
                        </span>

                        <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, margin: 0, color: 'var(--color-primary-navy)' }}>
                          {l.title}
                        </h4>

                        <Chip
                          variant={l.status === 'active' ? 'success' : l.status === 'sold' ? 'warning' : 'default'}
                          size="sm"
                        >
                          {l.status.toUpperCase()}
                        </Chip>

                        {listingReports.length > 0 && (
                          <span
                            style={{
                              backgroundColor: '#FEE2E2',
                              color: '#991B1B',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '9999px',
                            }}
                          >
                            ⚠️ {listingReports.length} Reports
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                        {l.author ? `by ${l.author} • ` : ''}
                        <strong>{formatRupees(l.price_paise)}</strong> • Condition: <em>{l.condition}</em> • Category: {l.category}
                      </p>

                      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
                        Seller: <strong>{l.profiles?.display_name || 'Student'}</strong> &bull;{' '}
                        {l.institutions?.name || 'Indore Campus'} &bull; Posted {new Date(l.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Button variant="primary" size="sm" onClick={() => handleInspectListing(l)}>
                      <Eye size={14} />
                      <span>Inspect Dossier & Audit</span>
                    </Button>

                    {l.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() =>
                          setModModal({
                            isOpen: true,
                            type: 'hide_listing',
                            targetId: l.id,
                            targetTitle: `${refNo}: ${l.title}`,
                            reason: 'Moderator action: Listing removed for guidelines review',
                          })
                        }
                      >
                        <EyeOff size={14} />
                        <span>Hide</span>
                      </Button>
                    ) : (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', padding: '0 8px' }}>
                        {l.status === 'sold' ? 'Sold Out' : 'Removed'}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredListings.length > 0 && (
            <Pagination
              currentPage={listingsPage}
              totalPages={totalListingPages}
              totalItems={filteredListings.length}
              pageSize={ADMIN_PAGE_SIZE}
              onPageChange={setListingsPage}
              itemName="listings"
            />
          )}

          {filteredListings.length === 0 && (
            <EmptyState title="No Listings Found" description="Try broadening your search term or clearing the status filter." />
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: USERS MANAGEMENT (SUSPEND / REACTIVATE / DELETE USER)   */}
      {/* ============================================================== */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            placeholder="Search students by display name..."
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value);
              setUsersPage(1);
            }}
            prefix={<Search size={16} />}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {paginatedUsers.map((p) => {
              const isSuspended = p.account_status === 'suspended';

              return (
                <Card
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-3)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, margin: 0 }}>
                        {p.display_name || 'Registered Student'}
                      </h4>
                      <Chip variant={isSuspended ? 'error' : 'success'} size="sm">
                        {p.account_status.toUpperCase()}
                      </Chip>
                    </div>

                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                      Campus: <strong>{p.institutions?.name || 'Unassigned'}</strong> &bull; Joined {new Date(p.created_at).toLocaleDateString()} &bull; ID: <code>{p.id.slice(0, 8)}...</code>
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {isSuspended ? (
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ color: 'var(--color-success)' }}
                        onClick={() =>
                          setModModal({
                            isOpen: true,
                            type: 'reactivate_user',
                            targetId: p.id,
                            targetTitle: p.display_name,
                            reason: 'Student account reinstated after review',
                          })
                        }
                      >
                        <UserCheck size={14} />
                        <span>Reactivate</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        style={{ color: 'var(--color-warning)' }}
                        onClick={() =>
                          setModModal({
                            isOpen: true,
                            type: 'suspend_user',
                            targetId: p.id,
                            targetTitle: p.display_name,
                            reason: 'Student account suspended for policy violation',
                          })
                        }
                      >
                        <UserX size={14} />
                        <span>Suspend</span>
                      </Button>
                    )}

                    {/* Permanent Account Deletion (admin_delete_user) */}
                    <Button
                      variant="outline"
                      size="sm"
                      style={{ color: 'var(--color-error)' }}
                      onClick={() =>
                        setModModal({
                          isOpen: true,
                          type: 'delete_user',
                          targetId: p.id,
                          targetTitle: p.display_name,
                          reason: 'User requested permanent account deletion pursuant to privacy rights',
                        })
                      }
                    >
                      <Trash2 size={14} />
                      <span>Delete User</span>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          {filteredUsers.length > 0 && (
            <Pagination
              currentPage={usersPage}
              totalPages={totalUserPages}
              totalItems={filteredUsers.length}
              pageSize={ADMIN_PAGE_SIZE}
              onPageChange={setUsersPage}
              itemName="students"
            />
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: INSTITUTIONS MANAGEMENT (INDORE CATALOG & DELETION)     */}
      {/* ============================================================== */}
      {activeTab === 'institutions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <div>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, margin: 0, color: 'var(--color-primary-navy)' }}>
                Indore Institutions Directory
              </h3>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                Engineering, Medical, Pharmacy, Commerce/Management, and Schools in Indore.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="outline" size="sm" onClick={handleSeedIndoreInstitutions} loading={actionLoading}>
                <Sparkles size={14} />
                <span>Purge Pune & Seed Indore Directory</span>
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowAddInstModal(true)}>
                <Plus size={14} />
                <span>Add Institution</span>
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {institutions.map((inst) => {
              const uCount = instUserCounts[inst.id] || 0;
              const lCount = instListingCounts[inst.id] || 0;

              return (
                <Card
                  key={inst.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-3)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, margin: 0 }}>{inst.name}</h4>
                      <Chip variant={inst.is_active ? 'success' : 'default'} size="sm">
                        {inst.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Chip>
                    </div>

                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                      Type: <strong>{inst.institution_type}</strong> &bull; {inst.area ? `${inst.area}, ` : ''}{inst.city} &bull;{' '}
                      <span style={{ color: 'var(--color-primary-navy)', fontWeight: 600 }}>{uCount} Students</span> &bull;{' '}
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{lCount} Books</span>
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Button variant="outline" size="sm" onClick={() => handleToggleInstitution(inst.id, inst.is_active)}>
                      {inst.is_active ? 'Deactivate' : 'Activate'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      style={{ color: 'var(--color-error)' }}
                      onClick={() => handleInitiateDeleteInstitution(inst)}
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: AUDIT LOG VIEWER                                        */}
      {/* ============================================================== */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Immutable administrative audit log of all account suspensions, user deletions, and content takedowns.
          </p>

          {paginatedAuditLogs.map((log) => (
            <Card key={log.id} style={{ padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Chip variant="accent" size="sm">{log.action.toUpperCase()}</Chip>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Target: {log.target_type} ({log.target_id?.slice(0, 8)}...)
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-main)', marginTop: '4px', margin: '4px 0 0 0' }}>
                    Reason: <em>"{log.reason}"</em>
                  </p>
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  {new Date(log.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </Card>
          ))}

          {auditLogs.length > 0 && (
            <Pagination
              currentPage={auditPage}
              totalPages={totalAuditPages}
              totalItems={auditLogs.length}
              pageSize={ADMIN_PAGE_SIZE}
              onPageChange={setAuditPage}
              itemName="audit logs"
            />
          )}

          {auditLogs.length === 0 && (
            <EmptyState title="No Audit Records" description="No administrative actions have been recorded yet." />
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: COMPLETE LISTING DOSSIER & BEHAVIOR AUDIT TRAIL         */}
      {/* ============================================================== */}
      {selectedListingDossier && (
        <Modal
          isOpen={Boolean(selectedListingDossier)}
          onClose={() => setSelectedListingDossier(null)}
          title={`Listing Dossier & User Behavior Audit: #${formatListingRef(selectedListingDossier)}`}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {selectedListingDossier.status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ color: 'var(--color-error)' }}
                    onClick={() => {
                      setModModal({
                        isOpen: true,
                        type: 'hide_listing',
                        targetId: selectedListingDossier.id,
                        targetTitle: `#${formatListingRef(selectedListingDossier)}: ${selectedListingDossier.title}`,
                        reason: 'Listing removed by administrator after reviewing dossier',
                      });
                    }}
                  >
                    <EyeOff size={14} />
                    <span>Hide Listing</span>
                  </Button>
                )}
                {selectedListingDossier.profiles?.account_status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ color: 'var(--color-error)' }}
                    onClick={() => {
                      setModModal({
                        isOpen: true,
                        type: 'suspend_user',
                        targetId: selectedListingDossier.seller_id,
                        targetTitle: selectedListingDossier.profiles?.display_name || 'Seller',
                        reason: 'Seller suspended after listing dossier review',
                      });
                    }}
                  >
                    <UserX size={14} />
                    <span>Suspend Seller</span>
                  </Button>
                )}
              </div>

              <Button variant="primary" size="md" onClick={() => setSelectedListingDossier(null)}>
                Close Dossier
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px' }}>
            {/* Header Ribbon */}
            <div
              style={{
                backgroundColor: 'var(--color-secondary-soft-blue)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--color-primary-navy)' }}>
                    #{formatListingRef(selectedListingDossier)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyRef(formatListingRef(selectedListingDossier))}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      color: copiedRef ? 'var(--color-success)' : 'var(--color-primary-navy)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {copiedRef ? <Check size={14} /> : <Copy size={14} />}
                    {copiedRef ? 'Copied' : 'Copy Ref'}
                  </button>
                  <Chip
                    variant={selectedListingDossier.status === 'active' ? 'success' : selectedListingDossier.status === 'sold' ? 'warning' : 'default'}
                    size="sm"
                  >
                    {selectedListingDossier.status.toUpperCase()}
                  </Chip>
                </div>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                  Listing UUID: <code>{selectedListingDossier.id}</code>
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: 'var(--color-success)' }}>
                  {formatRupees(selectedListingDossier.price_paise)}
                </span>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
                  ({selectedListingDossier.price_paise} paise)
                </p>
              </div>
            </div>

            {/* Photos Gallery */}
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Uploaded Physical Photos ({selectedListingDossier.listing_images?.length || 0})
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)', overflowX: 'auto', paddingBottom: '4px' }}>
                {selectedListingDossier.listing_images && selectedListingDossier.listing_images.length > 0 ? (
                  selectedListingDossier.listing_images.map((img, idx) => {
                    const imgUrl = getListingImageUrl(img.storage_path);
                    return (
                      <a
                        key={img.id || idx}
                        href={imgUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          width: '110px',
                          height: '140px',
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          border: '1px solid var(--color-border)',
                          flexShrink: 0,
                          position: 'relative',
                          display: 'block',
                        }}
                      >
                        <img src={imgUrl} alt={`Photo ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 4,
                            right: 4,
                            backgroundColor: 'rgba(0,0,0,0.65)',
                            color: '#fff',
                            fontSize: '10px',
                            padding: '1px 4px',
                            borderRadius: '4px',
                          }}
                        >
                          Photo #{idx + 1}
                        </span>
                      </a>
                    );
                  })
                ) : (
                  <div
                    style={{
                      width: '100%',
                      padding: 'var(--space-3)',
                      border: '1px dashed var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      textAlign: 'center',
                      color: 'var(--color-text-muted)',
                      fontSize: 'var(--font-size-xs)',
                    }}
                  >
                    No physical textbook photos uploaded for this listing.
                  </div>
                )}
              </div>
            </div>

            {/* Textbook Metadata & Description */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
              <div style={{ backgroundColor: '#F8FAFC', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Textbook Specifications
                </span>
                <div style={{ marginTop: 'var(--space-1)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-xs)' }}>
                  <div><strong>Title:</strong> {selectedListingDossier.title}</div>
                  <div><strong>Author:</strong> {selectedListingDossier.author || 'Not specified'}</div>
                  <div><strong>Edition:</strong> {selectedListingDossier.edition || 'Not specified'}</div>
                  <div><strong>Category:</strong> {selectedListingDossier.category}</div>
                  <div><strong>Course / Exam:</strong> {selectedListingDossier.course_or_exam || 'General'}</div>
                  <div><strong>Condition:</strong> <em>{selectedListingDossier.condition}</em></div>
                  <div><strong>Campus:</strong> {selectedListingDossier.institutions?.name || 'Indore Campus'}</div>
                </div>
              </div>

              <div style={{ backgroundColor: '#F8FAFC', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                  Seller Student Profile
                </span>
                <div style={{ marginTop: 'var(--space-1)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-xs)' }}>
                  <div><strong>Display Name:</strong> {selectedListingDossier.profiles?.display_name || 'Student'}</div>
                  <div><strong>Account Status:</strong> <Chip variant={selectedListingDossier.profiles?.account_status === 'active' ? 'success' : 'error'} size="sm">{selectedListingDossier.profiles?.account_status?.toUpperCase() || 'ACTIVE'}</Chip></div>
                  <div><strong>Seller UUID:</strong> <code>{selectedListingDossier.seller_id}</code></div>
                  <div><strong>Account Created:</strong> {new Date(selectedListingDossier.profiles?.created_at || selectedListingDossier.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            </div>

            {/* Full Seller Description */}
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                Full Seller Description
              </span>
              <div
                style={{
                  marginTop: 'var(--space-1)',
                  padding: 'var(--space-3)',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selectedListingDossier.description || 'No additional description provided by the seller.'}
              </div>
            </div>

            {/* SECTION: COMPLETE CHRONOLOGICAL USER BEHAVIOR AUDIT TRAIL */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 800, color: 'var(--color-primary-navy)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={14} />
                  Complete User Activity & Behavior Audit Trail (From Timestamp 0)
                </span>
                {loadingAudit && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Loading event history...</span>}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  backgroundColor: '#F8FAFC',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {listingAuditLogs.length > 0 ? (
                  listingAuditLogs.map((log, index) => {
                    const isCreation = log.action_type === 'created';
                    const isEdit = log.action_type === 'edited';
                    const isAccept = log.action_type === 'request_accepted';
                    const isRevoke = log.action_type === 'request_revoked';
                    const isDecline = log.action_type === 'request_declined';
                    const isCancel = log.action_type === 'request_cancelled';
                    const isSold = log.action_type === 'marked_sold';
                    const isHide = log.action_type === 'admin_hidden';

                    return (
                      <div
                        key={log.id || index}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 'var(--space-3)',
                          padding: 'var(--space-2) 0',
                          borderBottom: index < listingAuditLogs.length - 1 ? '1px solid #E2E8F0' : 'none',
                        }}
                      >
                        {/* Timeline Icon Badge */}
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '9999px',
                            backgroundColor: isCreation
                              ? '#E0F2FE'
                              : isEdit
                                ? '#FEF3C7'
                                : isAccept
                                  ? '#DCFCE7'
                                  : isRevoke
                                    ? '#FEE2E2'
                                    : isSold
                                      ? '#FEF08A'
                                      : '#F1F5F9',
                            color: isCreation
                              ? '#0369A1'
                              : isEdit
                                ? '#B45309'
                                : isAccept
                                  ? '#15803D'
                                  : isRevoke
                                    ? '#B91C1C'
                                    : isSold
                                      ? '#854D0E'
                                      : '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        >
                          {isCreation && <Sparkles size={14} />}
                          {isEdit && <FileEdit size={14} />}
                          {isAccept && <CheckCircle2 size={14} />}
                          {isRevoke && <RotateCcw size={14} />}
                          {isDecline && <XCircle size={14} />}
                          {isCancel && <X size={14} />}
                          {isSold && <Tag size={14} />}
                          {isHide && <EyeOff size={14} />}
                          {!isCreation && !isEdit && !isAccept && !isRevoke && !isDecline && !isCancel && !isSold && !isHide && (
                            <Clock size={14} />
                          )}
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
                              {log.summary}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {new Date(log.created_at).toLocaleDateString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>

                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            Actor: <strong>{log.actor_name || 'Student'}</strong> &bull; Event: <code>{log.action_type}</code>
                          </div>

                          {log.details && Object.keys(log.details).length > 0 && (
                            <div
                              style={{
                                marginTop: '4px',
                                padding: '4px 8px',
                                backgroundColor: '#FFFFFF',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                border: '1px solid #E2E8F0',
                                color: '#334155',
                              }}
                            >
                              {JSON.stringify(log.details)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: 0 }}>
                    No prior activity events recorded for this listing.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ============================================================== */}
      {/* MODAL: MODERATION CONFIRMATION (HIDE / SUSPEND / DELETE USER)  */}
      {/* ============================================================== */}
      <Modal
        isOpen={modModal.isOpen}
        onClose={() => setModModal({ isOpen: false, type: '', targetId: null, targetTitle: '', reason: '' })}
        title={
          modModal.type === 'hide_listing'
            ? 'Hide / Remove Listing'
            : modModal.type === 'suspend_user'
              ? 'Suspend Student Account'
              : modModal.type === 'delete_user'
                ? 'Permanent Account Deletion (GDPR / User Requested)'
                : 'Reactivate Student Account'
        }
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() => setModModal({ isOpen: false, type: '', targetId: null, targetTitle: '', reason: '' })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={actionLoading}
              onClick={handleExecuteModeration}
              style={{
                backgroundColor:
                  modModal.type === 'reactivate_user'
                    ? 'var(--color-success)'
                    : modModal.type === 'delete_user'
                      ? '#DC2626'
                      : 'var(--color-error)',
                borderColor:
                  modModal.type === 'reactivate_user'
                    ? 'var(--color-success)'
                    : modModal.type === 'delete_user'
                      ? '#DC2626'
                      : 'var(--color-error)',
              }}
            >
              {modModal.type === 'delete_user' ? 'Permanently Delete User' : 'Confirm Action'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {modModal.type === 'delete_user' ? (
            <Alert variant="error">
              <strong>PERMANENT DELETION WARNING:</strong> You are about to permanently delete student account{' '}
              <strong>"{modModal.targetTitle}"</strong>. This will cascade and delete their authentication credentials from{' '}
              <code>auth.users</code>, their public profile, all contact data, active listings, and interest requests. Next time
              this user enters their email, they will be treated strictly as an <strong>unregistered user</strong>.
            </Alert>
          ) : (
            <Alert variant={modModal.type === 'reactivate_user' ? 'info' : 'warning'}>
              Action target: <strong>{modModal.targetTitle}</strong>. This action takes effect immediately across the marketplace.
            </Alert>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Audit Log Reason *
            </label>
            <textarea
              rows={3}
              placeholder="State the reason for this administrative action (logged permanently in admin_audit_logs)..."
              value={modModal.reason}
              onChange={(e) => setModModal((prev) => ({ ...prev, reason: e.target.value }))}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL: INSTITUTION DELETION WITH SAFETY REASSIGNMENT GUARD     */}
      {/* ============================================================== */}
      <Modal
        isOpen={deleteInstModal.isOpen}
        onClose={() => setDeleteInstModal({ isOpen: false, inst: null, userCount: 0, listingCount: 0, reassignToId: '' })}
        title={`Delete Institution: ${deleteInstModal.inst?.name}`}
        footer={
          <>
            <Button
              variant="outline"
              size="md"
              onClick={() =>
                setDeleteInstModal({ isOpen: false, inst: null, userCount: 0, listingCount: 0, reassignToId: '' })
              }
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={actionLoading}
              onClick={handleExecuteDeleteInstitution}
              style={{ backgroundColor: '#DC2626', borderColor: '#DC2626' }}
            >
              Confirm Deletion
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {deleteInstModal.userCount > 0 || deleteInstModal.listingCount > 0 ? (
            <Alert variant="warning">
              <strong>ASSOCIATED RECORDS DETECTED:</strong> This institution currently has{' '}
              <strong>{deleteInstModal.userCount} registered student(s)</strong> and{' '}
              <strong>{deleteInstModal.listingCount} book listing(s)</strong>. To prevent orphaned student accounts, select an
              institution below to reassign them to, or leave unassigned.
            </Alert>
          ) : (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)' }}>
              Are you sure you want to delete <strong>{deleteInstModal.inst?.name}</strong>? No students or listings are
              currently associated with this institution.
            </p>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Reassign Associated Students & Listings To:
            </label>
            <select
              value={deleteInstModal.reassignToId}
              onChange={(e) => setDeleteInstModal((prev) => ({ ...prev, reassignToId: e.target.value }))}
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-sm)',
                fontFamily: 'inherit',
              }}
            >
              <option value="">Leave Unassigned (Set to None)</option>
              {institutions
                .filter((i) => i.id !== deleteInstModal.inst?.id)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.area || i.city})
                  </option>
                ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL: ADD INSTITUTION                                         */}
      {/* ============================================================== */}
      <Modal
        isOpen={showAddInstModal}
        onClose={() => setShowAddInstModal(false)}
        title="Add Institution (Indore Directory)"
        footer={
          <>
            <Button variant="outline" size="md" onClick={() => setShowAddInstModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" loading={actionLoading} onClick={handleAddInstitution}>
              Add Institution
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddInstitution} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            label="Institution Name *"
            placeholder="e.g. Acropolis Institute of Technology & Research"
            value={newInst.name}
            onChange={(e) => setNewInst({ ...newInst, name: e.target.value })}
            required
          />

          <Select
            label="Institution Type *"
            value={newInst.institution_type}
            onChange={(e) => setNewInst({ ...newInst, institution_type: e.target.value })}
            options={[
              { value: 'College', label: 'College / University (Engineering, Medical, Commerce)' },
              { value: 'School', label: 'School & Junior College' },
              { value: 'Other', label: 'Coaching / Exam Prep Academy' },
            ]}
          />

          <Input
            label="Area / Campus Location *"
            placeholder="e.g. Bypass Road, Manglia, Vallabh Nagar"
            value={newInst.area}
            onChange={(e) => setNewInst({ ...newInst, area: e.target.value })}
            required
          />

          <Input label="City" value={newInst.city} onChange={(e) => setNewInst({ ...newInst, city: e.target.value })} required />
        </form>
      </Modal>
    </div>
  );
}
