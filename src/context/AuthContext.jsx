import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getCache, setCache, removeCache } from '../lib/cache';
import { 
  checkOtpRateLimit, 
  recordOtpRequest, 
  recordOtpVerifyFailure, 
  isOtpVerifyLocked, 
  resetOtpVerifyFailures 
} from '../lib/rateLimit';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notificationCounts, setNotificationCounts] = useState({
    sellingPending: 0,
    buyingAccepted: 0,
    total: 0,
  });
  const [hasUnseenRequests, setHasUnseenRequests] = useState(false);

  // Helper to check if a user is verified
  const isUserVerified = (authUser) => {
    return Boolean(authUser && (authUser.email_confirmed_at || authUser.confirmed_at));
  };

  // Fetch user profile and admin role from Supabase (with client-side caching)
  const fetchProfileAndRole = useCallback(async (userId, skipCache = false) => {
    if (!userId || !isSupabaseConfigured) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }

    const cacheKey = `profile_${userId}`;
    if (!skipCache) {
      const cached = getCache(cacheKey);
      if (cached) {
        setProfile(cached.profile);
        setIsAdmin(cached.isAdmin);
        return;
      }
    }

    try {
      // 1. Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          display_name,
          institution_id,
          course_or_class,
          graduation_year,
          whatsapp_number,
          whatsapp_verified_at,
          account_status,
          created_at,
          institutions (id, name, city, area, institution_type)
        `)
        .eq('id', userId)
        .maybeSingle();

      let finalProfile = null;
      if (profileError) {
        console.error('Error fetching profile:', profileError.message);
      } else if (profileData) {
        // Fetch private contact info (whatsapp_number) from user_contacts table
        let whatsappNum = profileData.whatsapp_number || null;
        try {
          const { data: contactData } = await supabase
            .from('user_contacts')
            .select('whatsapp_number')
            .eq('user_id', userId)
            .maybeSingle();
          if (contactData?.whatsapp_number) {
            whatsappNum = contactData.whatsapp_number;
          }
        } catch (contactErr) {
          // Fallback gracefully if migration is pending
        }

        finalProfile = {
          ...profileData,
          whatsapp_number: whatsappNum,
        };
        setProfile(finalProfile);
      } else {
        setProfile(null);
      }

      // 2. Check admin role
      const { data: adminData } = await supabase
        .from('admin_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      const adminFlag = Boolean(adminData && (adminData.role === 'admin' || adminData.role === 'moderator'));
      setIsAdmin(adminFlag);

      if (finalProfile) {
        setCache(cacheKey, { profile: finalProfile, isAdmin: adminFlag }, 120000); // 2-min cache
      }
    } catch (err) {
      console.error('Failed to load user profile or role:', err);
    }
  }, []);

  // Fetch pending actionable notification counts for requests badge (ACTIVE listings only)
  const fetchNotificationCounts = useCallback(async (userId) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId || !isSupabaseConfigured) {
      setNotificationCounts({ sellingPending: 0, buyingAccepted: 0, total: 0 });
      setHasUnseenRequests(false);
      return;
    }

    try {
      // 1. Pending requests on active listings where user is seller
      const { data: sData } = await supabase
        .from('interest_requests')
        .select('id, created_at, listings!inner(status)')
        .eq('seller_id', targetUserId)
        .eq('status', 'pending')
        .eq('listings.status', 'active');

      // 2. Accepted requests on active listings where user is buyer
      const { data: bData } = await supabase
        .from('interest_requests')
        .select('id, created_at, responded_at, listings!inner(status)')
        .eq('buyer_id', targetUserId)
        .eq('status', 'accepted')
        .eq('listings.status', 'active');

      const sellingPending = sData?.length || 0;
      const buyingAccepted = bData?.length || 0;
      const total = sellingPending + buyingAccepted;

      setNotificationCounts({
        sellingPending,
        buyingAccepted,
        total,
      });

      // Notification dot logic: only show dot if there are requests newer than last viewed timestamp
      if (total === 0) {
        setHasUnseenRequests(false);
        return;
      }

      let lastViewed = null;
      try {
        lastViewed = localStorage.getItem(`bookloop_requests_last_viewed_${targetUserId}`);
      } catch (e) {}

      if (!lastViewed) {
        setHasUnseenRequests(true);
        return;
      }

      const lastViewedTime = new Date(lastViewed).getTime();
      const hasNewSelling = (sData || []).some(
        (r) => new Date(r.created_at).getTime() > lastViewedTime
      );
      const hasNewBuying = (bData || []).some(
        (r) => new Date(r.responded_at || r.created_at).getTime() > lastViewedTime
      );

      setHasUnseenRequests(hasNewSelling || hasNewBuying);
    } catch (e) {
      console.error('Error fetching notification counts:', e);
      setNotificationCounts({ sellingPending: 0, buyingAccepted: 0, total: 0 });
      setHasUnseenRequests(false);
    }
  }, [user?.id]);

  // Mark requests as seen when the user visits the requests page
  const markRequestsAsSeen = useCallback(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`bookloop_requests_last_viewed_${user.id}`, new Date().toISOString());
    } catch (e) {}
    setHasUnseenRequests(false);
  }, [user?.id]);

  // Initialize session and listen to auth changes
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Check active session
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      const authUser = initialSession?.user;
      
      // Strict Email Verification Check:
      // If user has not verified email, treat them as completely unauthenticated
      if (authUser && !isUserVerified(authUser)) {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setSession(initialSession);
      setUser(authUser ?? null);
      if (authUser) {
        fetchProfileAndRole(authUser.id).finally(() => setLoading(false));
        fetchNotificationCounts(authUser.id);
      } else {
        setLoading(false);
      }
    });

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      const authUser = newSession?.user;

      // If user arrives via email verification link (/verified or /auth/*), do NOT auto-login
      const isVerificationFlow = typeof window !== 'undefined' && 
        (window.location.pathname.includes('verified') || window.location.pathname.includes('/auth/'));

      if (isVerificationFlow) {
        if (event === 'SIGNED_IN') {
          await supabase.auth.signOut();
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      if (authUser && !isUserVerified(authUser)) {
        // Unverified user detected, force sign out to block any unverified state
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setSession(newSession);
      setUser(authUser ?? null);
      if (authUser) {
        await fetchProfileAndRole(authUser.id);
        fetchNotificationCounts(authUser.id);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setNotificationCounts({ sellingPending: 0, buyingAccepted: 0, total: 0 });
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [fetchProfileAndRole]);

  // Sign up with institution selection & metadata
  const signUp = async ({ email, password, displayName, institutionId, courseOrClass }) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Please add your credentials to .env.local');
    }

    const redirectUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/verified`
      : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
          institution_id: institutionId || null,
          course_or_class: courseOrClass || null,
        },
      },
    });

    if (error) throw error;

    // Immediately sign out to ensure unverified users cannot bypass verification
    // They must verify their email, and then log in fresh
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);

    return data;
  };

  // Sign in with strict email verification guard
  const signIn = async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Please add your credentials to .env.local');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        throw new Error('Your email address has not been verified yet. Please check your inbox and verify before signing in.');
      }
      throw error;
    }

    // Double check email verification on returned user
    if (!isUserVerified(data.user)) {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      throw new Error('Please verify your email address before signing in. Check your inbox for the confirmation link.');
    }

    setUser(data.user);
    setSession(data.session);
    await fetchProfileAndRole(data.user.id, true);
    return data;
  };

  // Request OTP login / recovery (Registered users only, with DoS rate-limiting)
  const signInWithOtp = async ({ email }) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Please add your credentials to .env.local');
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Rate-limit check (anti-abuse, anti-DoS)
    const rateCheck = checkOtpRateLimit(cleanEmail);
    if (!rateCheck.allowed) {
      throw new Error(rateCheck.reason);
    }

    // 2. Supabase signInWithOtp with shouldCreateUser: false
    // ensures OTP is sent ONLY to existing registered users
    const { data, error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        shouldCreateUser: false,
      },
    });

    if (error) {
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('signups not allowed') || msg.includes('user not found')) {
        throw new Error('No registered account found with this email. Please check the address or sign up.');
      } else if (msg.includes('rate limit')) {
        throw new Error('Too many requests from this device. Please wait a minute and try again.');
      }
      throw error;
    }

    // Record request timestamp for anti-spam rate limiting
    recordOtpRequest(cleanEmail);
    return data;
  };

  // Verify OTP and establish authenticated session
  const verifyOtp = async ({ email, token }) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured. Please add your credentials to .env.local');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    // Check brute-force lockout
    if (isOtpVerifyLocked(cleanEmail)) {
      throw new Error('Too many invalid attempts. For your security, this code has expired. Please request a new OTP.');
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });

    if (error) {
      recordOtpVerifyFailure(cleanEmail);
      if (error.message?.toLowerCase().includes('token has expired') || error.message?.toLowerCase().includes('invalid')) {
        throw new Error('Incorrect or expired OTP code. Please check your email or request a new code.');
      }
      throw error;
    }

    resetOtpVerifyFailures(cleanEmail);

    if (data?.user) {
      setUser(data.user);
      setSession(data.session);
      await fetchProfileAndRole(data.user.id, true);
    }

    return data;
  };

  // Update password (for users logged in via OTP who want to set a new password)
  const updatePassword = async (newPassword) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
    return data;
  };

  // Sign out
  const signOut = async () => {
    if (!isSupabaseConfigured) return;
    if (user?.id) {
      removeCache(`profile_${user.id}`);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  };

  // Manual refresh of profile (e.g. after updating WhatsApp number or bio)
  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfileAndRole(user.id, true);
    }
  };

  const value = {
    user,
    session,
    profile,
    isAdmin,
    loading,
    notificationCounts,
    hasUnseenRequests,
    fetchNotificationCounts,
    markRequestsAsSeen,
    signUp,
    signIn,
    signInWithOtp,
    verifyOtp,
    updatePassword,
    signOut,
    refreshProfile,
    isConfigured: isSupabaseConfigured,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
