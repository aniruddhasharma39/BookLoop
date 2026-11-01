import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, BookMarked, CheckCircle, GraduationCap, School, Mail, Eye, EyeOff } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Alert from '../components/common/Alert';
import SearchableInstitutionSelect from '../components/common/SearchableInstitutionSelect';
import { INSTITUTION_TYPES, matchesInstitutionType } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchCachedInstitutions } from '../lib/cache';

// Fallback seed institutions for offline/pre-DB inspection
const FALLBACK_INSTITUTIONS = [
  // Engineering Colleges (Indore)
  { id: '22222222-2222-2222-2222-222222222201', name: 'Acropolis Institute of Technology & Research (AITR)', institution_type: 'College', area: 'Bypass Road, Manglia' },
  { id: '22222222-2222-2222-2222-222222222202', name: 'Shri Govindram Seksaria Institute of Technology and Science (SGSITS)', institution_type: 'College', area: 'Vallabh Nagar' },
  { id: '22222222-2222-2222-2222-222222222203', name: 'Institute of Engineering & Technology, DAVV (IET DAVV)', institution_type: 'College', area: 'Khandwa Road' },
  { id: '22222222-2222-2222-2222-222222222204', name: 'IPS Academy, Institute of Engineering & Science', institution_type: 'College', area: 'Rajendra Nagar' },
  { id: '22222222-2222-2222-2222-222222222205', name: 'Medi-Caps University (Faculty of Engineering)', institution_type: 'College', area: 'A.B. Road, Pigdamber' },
  { id: '22222222-2222-2222-2222-222222222206', name: 'Indian Institute of Technology Indore (IIT Indore)', institution_type: 'College', area: 'Simrol' },

  // Medical & Pharmacy (Indore)
  { id: '22222222-2222-2222-2222-222222222207', name: 'Mahatma Gandhi Memorial Medical College (MGM)', institution_type: 'College', area: 'A.B. Road' },
  { id: '22222222-2222-2222-2222-222222222208', name: 'Sri Aurobindo Institute of Medical Sciences (SAIMS)', institution_type: 'College', area: 'Sanwer Road' },
  { id: '22222222-2222-2222-2222-222222222209', name: 'Index Medical College Hospital & Research Centre', institution_type: 'College', area: 'Nemawar Road' },
  { id: '22222222-2222-2222-2222-222222222210', name: 'Department of Pharmacy, SGSITS', institution_type: 'College', area: 'Vallabh Nagar' },
  { id: '22222222-2222-2222-2222-222222222211', name: 'Acropolis Institute of Pharmaceutical Education (AIPER)', institution_type: 'College', area: 'Manglia' },
  { id: '22222222-2222-2222-2222-222222222212', name: 'Modern Institute of Pharmaceutical Sciences', institution_type: 'College', area: 'Alwasa' },

  // Commerce & Management (Indore)
  { id: '22222222-2222-2222-2222-222222222213', name: 'Institute of Management Studies, DAVV (IMS DAVV)', institution_type: 'College', area: 'Khandwa Road' },
  { id: '22222222-2222-2222-2222-222222222214', name: 'Prestige Institute of Management & Research (PIMR)', institution_type: 'College', area: 'Scheme 54, Vijay Nagar' },
  { id: '22222222-2222-2222-2222-222222222215', name: 'Jaipuria Institute of Management', institution_type: 'College', area: 'Indore-Dewas Highway' },
  { id: '22222222-2222-2222-2222-222222222216', name: 'Daly College Business School (DCBS)', institution_type: 'College', area: 'Residency Area' },
  { id: '22222222-2222-2222-2222-222222222217', name: 'Renaissance College of Commerce & Management', institution_type: 'College', area: 'Bypass Road' },

  // Schools (Indore)
  { id: '11111111-1111-1111-1111-111111111101', name: 'The Daly College', institution_type: 'School', area: 'Residency Area' },
  { id: '11111111-1111-1111-1111-111111111102', name: 'Delhi Public School (DPS Indore)', institution_type: 'School', area: 'Nipania, Bypass Road' },
  { id: '11111111-1111-1111-1111-111111111103', name: 'Choithram School', institution_type: 'School', area: 'Manik Bagh Road' },
  { id: '11111111-1111-1111-1111-111111111104', name: 'The Emerald Heights International School', institution_type: 'School', area: 'A.B. Road, Rau' },
  { id: '11111111-1111-1111-1111-111111111105', name: 'The Shishukunj International School', institution_type: 'School', area: 'Jhalaria, Bypass Road' },
  { id: '11111111-1111-1111-1111-111111111106', name: 'St. Raphael’s Higher Secondary School', institution_type: 'School', area: '15 Old Palasia' },

  // Coaching (Indore)
  { id: '33333333-3333-3333-3333-333333333301', name: 'Allen Career Institute - Indore Center', institution_type: 'Other', area: 'South Tukoganj' },
  { id: '33333333-3333-3333-3333-333333333302', name: 'Aakash Institute - Indore Hub', institution_type: 'Other', area: 'Vijay Nagar' },
  { id: '33333333-3333-3333-3333-333333333303', name: 'Kautilya Academy', institution_type: 'Other', area: 'Bhawarkua' },
];

export default function SignupPage() {
  const { signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [institutionType, setInstitutionType] = useState('College'); // 'School' | 'College' | 'Other'
  const [institutionId, setInstitutionId] = useState('');
  const [courseOrClass, setCourseOrClass] = useState('');

  const [allInstitutions, setAllInstitutions] = useState(FALLBACK_INSTITUTIONS);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Fetch active institutions with client cache
  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await fetchCachedInstitutions();
        if (data && data.length > 0) {
          setAllInstitutions(data);
        }
      } catch (err) {
        console.warn('Failed to load institutions from Supabase:', err);
      }
    }
    loadInstitutions();
  }, []);

  // Filter institutions using robust matcher
  let filteredInstitutions = allInstitutions.filter((item) => {
    return matchesInstitutionType(item, institutionType);
  });

  // Safety fallback: if no items matched that specific tier, show all institutions so dropdown is never empty
  if (filteredInstitutions.length === 0) {
    filteredInstitutions = allInstitutions;
  }

  const handleTypeChange = (newType) => {
    setInstitutionType(newType);
    setInstitutionId(''); // Reset institution selection when level changes
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!displayName.trim()) {
      setErrorMessage('Please enter your display name.');
      return;
    }
    if (!institutionId) {
      setErrorMessage(`Please select your ${institutionType === 'School' ? 'school' : 'institution'} from the list.`);
      return;
    }
    if (!email || !password) {
      setErrorMessage('Please provide a valid email and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (!termsAccepted) {
      setErrorMessage('You must confirm and agree to the Terms of Service, Privacy Notice, and Campus Rules.');
      return;
    }

    setLoading(true);
    try {
      await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        institutionId,
        courseOrClass: courseOrClass.trim() || null,
      });

      setSignupSuccess(true);
    } catch (err) {
      console.error('Signup error:', err);
      setErrorMessage(err.message || 'Unable to complete registration. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  if (signupSuccess) {
    return (
      <div style={{ maxWidth: '480px', margin: 'var(--space-6) auto' }}>
        <Card style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-secondary-soft-blue)',
            color: 'var(--color-primary-navy)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-4)'
          }}>
            <Mail size={32} />
          </div>

          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)', marginBottom: 'var(--space-2)' }}>
            Check your inbox!
          </h2>

          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)', lineHeight: 1.6, marginBottom: 'var(--space-3)' }}>
            A confirmation link was sent to<br />
            <strong>{email}</strong>
          </p>

          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            Please click the link in your email to verify your address. Once verified, you can sign in and start exploring or listing books right away.
          </p>

          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
            Didn't receive the email? Check your spam or promotions folder.
          </p>

          <div>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="md">
                Go to Sign In
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '480px', margin: 'var(--space-4) auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-primary-navy)',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-2)'
        }}>
          <BookMarked size={26} />
        </div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
          Join BookLoop
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Find affordable books from students in your city
        </p>
      </div>

      {errorMessage && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Alert variant="error" onClose={() => setErrorMessage('')}>
            {errorMessage}
          </Alert>
        </div>
      )}

      <Card>
        <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            label="Display Name"
            required
            placeholder="e.g. Rahul S."
            helperText="Visible to other students on listings and accepted requests."
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />

          {/* Searchable Institution Selector with School / College / Others */}
          <SearchableInstitutionSelect
            institutionType={institutionType}
            onTypeChange={(newType) => {
              setInstitutionType(newType);
              setInstitutionId('');
            }}
            institutionId={institutionId}
            onInstitutionChange={(newId) => setInstitutionId(newId)}
            institutions={allInstitutions}
            required
            label={
              institutionType === 'School'
                ? 'Select School'
                : institutionType === 'College'
                  ? 'Select College / University'
                  : 'Select Coaching / Exam Prep Academy'
            }
            helperText="Selecting your institution helps campus peers find nearby books. It is self-selected, not proof of attendance."
          />

          <Input
            label={institutionType === 'School' ? 'Class / Standard' : 'Course / Year'}
            placeholder={institutionType === 'School' ? 'e.g. Class 10 CBSE, 12th Science' : 'e.g. 2nd Year B.Tech Computer Engineering'}
            value={courseOrClass}
            onChange={(e) => setCourseOrClass(e.target.value)}
          />

          <Input
            label="Email Address"
            type="email"
            required
            autoComplete="email"
            placeholder="you@student.edu or personal email"
            helperText="A verification link will be sent to this email."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            suffix={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: showPassword ? 'var(--color-primary-navy)' : '#94A3B8',
                  transition: 'color 0.15s ease',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            }
          />

          <div style={{
            fontSize: 'var(--font-size-xs)',
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                id="signup-terms-checkbox"
                required
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  accentColor: 'var(--color-primary-navy)',
                  marginTop: '2px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--color-text-main)', lineHeight: 1.5, fontSize: '0.85rem' }}>
                I confirm that I have read and agree to the{' '}
                <Link to="/terms" target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--color-primary-navy)', textDecoration: 'underline' }}>
                  Terms of Service
                </Link>
                ,{' '}
                <Link to="/privacy" target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--color-primary-navy)', textDecoration: 'underline' }}>
                  Privacy Notice
                </Link>
                , and{' '}
                <Link to="/rules" target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--color-primary-navy)', textDecoration: 'underline' }}>
                  Campus Meetup Rules
                </Link>
                .
              </span>
            </label>

            <div style={{
              fontSize: '0.78rem',
              color: 'var(--color-text-muted)',
              lineHeight: 1.45,
              borderTop: '1px solid #E2E8F0',
              paddingTop: 'var(--space-2)',
            }}>
              <strong>Student Privacy Notice:</strong> We never publicly expose phone numbers or personal details. Handover contacts unlock only when a request is accepted. Students under 18 must have parental or legal guardian consent.
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            fullWidth
            style={{ marginTop: 'var(--space-2)' }}
          >
            <UserPlus size={18} />
            <span>Create Student Account</span>
          </Button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-5)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 600 }}>
            Sign In
          </Link>
        </div>
      </Card>
    </div>
  );
}
