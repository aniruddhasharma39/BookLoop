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
import { formatRupees } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

  // Users
  const [profiles, setProfiles] = useState([]);
  const [userSearch, setUserSearch] = useState('');

  // Institutions
  const [institutions, setInstitutions] = useState([]);
  const [showAddInstModal, setShowAddInstModal] = useState(false);
  const [newInst, setNewInst] = useState({ name: '', institution_type: 'College', city: 'Pune', area: '' });

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);

  // Action Modals & Loading
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Reason Modal for Moderation (Hide listing / Suspend user)
  const [modModal, setModModal] = useState({
    isOpen: false,
    type: '', // 'hide_listing' | 'suspend_user' | 'reactivate_user'
    targetId: null,
    targetTitle: '',
    reason: '',
  });

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
          listings (id, title, status, seller_id),
          reported_user:profiles!reports_reported_user_id_fkey (id, display_name, account_status)
        `)
        .order('created_at', { ascending: false });

      setReports(repData || []);

      // 3. Fetch Listings for Moderation
      const { data: listData } = await supabase
        .from('listings')
        .select(`
          id,
          title,
          price_paise,
          condition,
          status,
          created_at,
          seller_id,
          profiles!listings_seller_id_fkey (display_name),
          institutions (name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      setListings(listData || []);

      // 4. Fetch Users
      const { data: profData } = await supabase
        .from('profiles')
        .select(`
          id,
          display_name,
          account_status,
          created_at,
          institutions (name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      setProfiles(profData || []);

      // 5. Fetch Institutions
      const { data: instData } = await supabase
        .from('institutions')
        .select('*')
        .order('name');

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
        .limit(30);

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

      if (error) {
        throw error;
      }

      setFeedback({ type: 'success', message: `Report marked as ${newStatus}.` });
      fetchData();
    } catch (err) {
      console.error('Report update error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to update report status.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Execute Moderation Modal Action (Hide Listing or Suspend User)
  const handleExecuteModeration = async () => {
    setActionLoading(true);
    setFeedback({ type: '', message: '' });

    const reason = modModal.reason.trim() || 'Violated community safety guidelines';

    try {
      if (modModal.type === 'hide_listing') {
        const { error } = await supabase.rpc('admin_hide_listing', {
          p_listing_id: modModal.targetId,
          p_reason: reason,
        });

        if (error) {
          throw error;
        }

        setFeedback({ type: 'success', message: `Listing "${modModal.targetTitle}" has been removed from marketplace.` });
      } else if (modModal.type === 'suspend_user') {
        const { error } = await supabase.rpc('admin_suspend_user', {
          p_target_user_id: modModal.targetId,
          p_reason: reason,
        });

        if (error) {
          throw error;
        }

        setFeedback({ type: 'warning', message: `User account "${modModal.targetTitle}" has been suspended.` });
      } else if (modModal.type === 'reactivate_user') {
        const { error } = await supabase.rpc('admin_reactivate_user', {
          p_target_user_id: modModal.targetId,
          p_reason: reason,
        });

        if (error) {
          throw error;
        }

        setFeedback({ type: 'success', message: `User account "${modModal.targetTitle}" has been reactivated.` });
      }

      setModModal({ isOpen: false, type: '', targetId: null, targetTitle: '', reason: '' });
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
        city: newInst.city.trim() || 'Pune',
        area: newInst.area.trim() || null,
        is_active: true,
      });

      if (error) throw error;
      setFeedback({ type: 'success', message: `Added "${newInst.name}" to institutions.` });
      setShowAddInstModal(false);
      setNewInst({ name: '', institution_type: 'College', city: 'Pune', area: '' });
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
      setFeedback({ type: 'info', message: `Institution status updated.` });
      fetchData();
    } catch (err) {
      console.error('Toggle institution error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to update institution status.' });
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
          <Button variant="primary" onClick={() => window.location.href = '/'}>
            Return to Marketplace
          </Button>
        </Card>
      </div>
    );
  }

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
              flexShrink: 0,
            }}
          >
            <Shield size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)', margin: 0 }}>
              Safety & Moderation Center
            </h1>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
              Database-verified admin panel. Manage reports, moderate listings, and safeguard the campus marketplace.
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={fetchData} loading={actionLoading}>
          <RotateCcw size={14} />
          <span>Refresh Data</span>
        </Button>
      </div>

      {feedback.message && (
        <Alert variant={feedback.type === 'error' ? 'error' : feedback.type === 'warning' ? 'warning' : 'success'}>
          {feedback.message}
        </Alert>
      )}

      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
        <Card style={{ padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Open Reports</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: stats.openReports > 0 ? 'var(--color-error)' : 'var(--color-success)', marginTop: '2px' }}>
            {stats.openReports}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Active Listings</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)', marginTop: '2px' }}>
            {stats.activeListings}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Books Sold</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-success)', marginTop: '2px' }}>
            {stats.soldListings}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Requests (Accepted)</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)', marginTop: '2px' }}>
            {stats.acceptedRequests} <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>/ {stats.totalRequests}</span>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Registered Students</span>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)', marginTop: '2px' }}>
            {stats.totalUsers}
          </div>
        </Card>
      </div>

      {/* Admin Tabs */}
      <div
        style={{
          display: 'flex',
          backgroundColor: '#FFFFFF',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '6px',
          gap: 'var(--space-1)',
          overflowX: 'auto',
          boxShadow: 'var(--shadow-sm)',
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
          <span>Reports ({reports.filter((r) => r.status === 'open').length})</span>
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
          <span>Institutions</span>
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

      {/* Tab 1: Reports Management */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Status Filter */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {['all', 'open', 'reviewing', 'resolved', 'dismissed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setReportFilter(st)}
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

          {reports
            .filter((r) => reportFilter === 'all' || r.status === reportFilter)
            .map((rep) => {
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
                        Reported by: <strong>{rep.profiles?.display_name || 'Anonymous User'}</strong> &bull;{' '}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateReportStatus(rep.id, 'reviewing')}
                        >
                          Mark Reviewing
                        </Button>
                      )}
                      {rep.status !== 'resolved' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUpdateReportStatus(rep.id, 'resolved')}
                        >
                          Resolve
                        </Button>
                      )}
                      {rep.status !== 'dismissed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateReportStatus(rep.id, 'dismissed')}
                        >
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Target Card */}
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

                    {/* Direct Moderation Shortcuts */}
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
                          <span>Hide Listing</span>
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
                          <span>Suspend User</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

          {reports.length === 0 && (
            <EmptyState
              title="No Reports Filed"
              description="The community is safe and clean. No user reports have been submitted."
            />
          )}
        </div>
      )}

      {/* Tab 2: Listings Moderation */}
      {activeTab === 'listings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            placeholder="Search listings by title or seller..."
            value={listingSearch}
            onChange={(e) => setListingSearch(e.target.value)}
            prefix={<Search size={16} />}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {listings
              .filter((l) => l.title.toLowerCase().includes(listingSearch.toLowerCase()))
              .map((l) => (
                <Card key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)' }}>
                  <div>
                    <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, margin: 0 }}>{l.title}</h4>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                      Seller: <strong>{l.profiles?.display_name || 'Student'}</strong> &bull; {formatRupees(l.price_paise)} &bull; {l.institutions?.name || 'Campus'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Chip variant={l.status === 'active' ? 'success' : l.status === 'sold' ? 'warning' : 'default'} size="sm">
                      {l.status.toUpperCase()}
                    </Chip>

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
                            targetTitle: l.title,
                            reason: 'Moderator action: Content hidden for review',
                          })
                        }
                      >
                        <EyeOff size={14} />
                        <span>Hide</span>
                      </Button>
                    ) : (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Locked</span>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Tab 3: Users Management */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            placeholder="Search students by display name..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            prefix={<Search size={16} />}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {profiles
              .filter((p) => p.display_name?.toLowerCase().includes(userSearch.toLowerCase()))
              .map((p) => {
                const isSuspended = p.account_status === 'suspended';

                return (
                  <Card key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)' }}>
                    <div>
                      <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, margin: 0 }}>
                        {p.display_name || 'Registered Student'}
                      </h4>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                        {p.institutions?.name || 'Selected Campus'} &bull; Joined {new Date(p.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Chip variant={isSuspended ? 'error' : 'success'} size="sm">
                        {p.account_status.toUpperCase()}
                      </Chip>

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
                              reason: 'Account reinstated after review',
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
                          style={{ color: 'var(--color-error)' }}
                          onClick={() =>
                            setModModal({
                              isOpen: true,
                              type: 'suspend_user',
                              targetId: p.id,
                              targetTitle: p.display_name,
                              reason: 'Account suspended for policy violation',
                            })
                          }
                        >
                          <UserX size={14} />
                          <span>Suspend</span>
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {/* Tab 4: Institutions Management */}
      {activeTab === 'institutions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
              Active schools, colleges, and coaching academies in pilot city (Pune).
            </p>
            <Button variant="primary" size="sm" onClick={() => setShowAddInstModal(true)}>
              <Plus size={14} />
              <span>Add Institution</span>
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {institutions.map((inst) => (
              <Card key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)' }}>
                <div>
                  <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, margin: 0 }}>{inst.name}</h4>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                    {inst.institution_type} &bull; {inst.area ? `${inst.area}, ` : ''}{inst.city}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Chip variant={inst.is_active ? 'success' : 'default'} size="sm">
                    {inst.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </Chip>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleInstitution(inst.id, inst.is_active)}
                  >
                    {inst.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Audit Log Viewer */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Immutable record of all administrative actions, suspensions, and content takedowns.
          </p>

          {auditLogs.map((log) => (
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

          {auditLogs.length === 0 && (
            <EmptyState
              title="No Audit Records"
              description="No administrative actions have been recorded yet."
            />
          )}
        </div>
      )}

      {/* Moderation Confirmation Modal */}
      <Modal
        isOpen={modModal.isOpen}
        onClose={() => setModModal({ isOpen: false, type: '', targetId: null, targetTitle: '', reason: '' })}
        title={
          modModal.type === 'hide_listing'
            ? 'Hide / Remove Listing'
            : modModal.type === 'suspend_user'
              ? 'Suspend Student Account'
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
                backgroundColor: modModal.type === 'reactivate_user' ? 'var(--color-success)' : 'var(--color-error)',
                borderColor: modModal.type === 'reactivate_user' ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              Confirm Action
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Alert variant={modModal.type === 'reactivate_user' ? 'info' : 'warning'}>
            Action target: <strong>{modModal.targetTitle}</strong>. This action takes effect immediately across the marketplace and database.
          </Alert>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
              Audit Log Reason *
            </label>
            <textarea
              rows={3}
              placeholder="State the reason for this administrative action (logged permanently)..."
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

      {/* Add Institution Modal */}
      <Modal
        isOpen={showAddInstModal}
        onClose={() => setShowAddInstModal(false)}
        title="Add Institution"
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
            placeholder="e.g. Modern College of Arts, Science and Commerce"
            value={newInst.name}
            onChange={(e) => setNewInst({ ...newInst, name: e.target.value })}
            required
          />

          <Select
            label="Institution Type *"
            value={newInst.institution_type}
            onChange={(e) => setNewInst({ ...newInst, institution_type: e.target.value })}
            options={[
              { value: 'College', label: 'College / University' },
              { value: 'School', label: 'School & Junior College' },
              { value: 'Other', label: 'Coaching / Exam Prep Academy' },
            ]}
          />

          <Input
            label="Area / Campus Location *"
            placeholder="e.g. Shivajinagar, Kothrud, Camp"
            value={newInst.area}
            onChange={(e) => setNewInst({ ...newInst, area: e.target.value })}
            required
          />

          <Input
            label="City"
            value={newInst.city}
            onChange={(e) => setNewInst({ ...newInst, city: e.target.value })}
            required
          />
        </form>
      </Modal>
    </div>
  );
}
