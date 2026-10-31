import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, BookMarked, CheckCircle, GraduationCap, School, Mail, Eye, EyeOff } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Alert from '../components/common/Alert';
import { INSTITUTION_TYPES, matchesInstitutionType } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Fallback seed institutions for offline/pre-DB inspection
const FALLBACK_INSTITUTIONS = [
  // Schools
  { id: '11111111-1111-1111-1111-111111111101', name: 'The Bishop’s School & Junior College', institution_type: 'School', area: 'Camp' },
  { id: '11111111-1111-1111-1111-111111111102', name: 'St. Vincent’s High School and Junior College', institution_type: 'School', area: 'Camp' },
  { id: '11111111-1111-1111-1111-111111111103', name: 'Loyola High School and Junior College', institution_type: 'School', area: 'Pashan' },
  { id: '11111111-1111-1111-1111-111111111104', name: 'Delhi Public School (DPS Pune)', institution_type: 'School', area: 'Mohammadwadi' },
  { id: '11111111-1111-1111-1111-111111111105', name: 'Orchid School', institution_type: 'School', area: 'Baner' },
  { id: '11111111-1111-1111-1111-111111111106', name: 'Symbiosis School & Junior College', institution_type: 'School', area: 'Prabhat Road' },

  // Colleges
  { id: '22222222-2222-2222-2222-222222222201', name: 'College of Engineering, Pune (COEP Tech)', institution_type: 'College', area: 'Shivajinagar' },
  { id: '22222222-2222-2222-2222-222222222202', name: 'Pune Institute of Computer Technology (PICT)', institution_type: 'College', area: 'Dhankawadi' },
  { id: '22222222-2222-2222-2222-222222222203', name: 'Vishwakarma Institute of Technology (VIT)', institution_type: 'College', area: 'Bibwewadi' },
  { id: '22222222-2222-2222-2222-222222222204', name: 'Fergusson College (Autonomous)', institution_type: 'College', area: 'FC Road' },
  { id: '22222222-2222-2222-2222-222222222205', name: 'B. J. Government Medical College', institution_type: 'College', area: 'Pune Station' },
  { id: '22222222-2222-2222-2222-222222222206', name: 'Brihan Maharashtra College of Commerce (BMCC)', institution_type: 'College', area: 'Shivajinagar' },

  // Other / Coaching
  { id: '33333333-3333-3333-3333-333333333301', name: 'Allen Career Institute - Pune Center', institution_type: 'Other', area: 'FC Road' },
  { id: '33333333-3333-3333-3333-333333333302', name: 'Aakash Institute - Pune Hub', institution_type: 'Other', area: 'Kothrud' },
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

  // Fetch active institutions from Supabase
  useEffect(() => {
    async function loadInstitutions() {
      try {
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name, city, area, institution_type')
          .eq('is_active', true)
          .order('name');

        if (!error && data && data.length > 0) {
          setAllInstitutions(data);
        } else if (error) {
          console.warn('Could not fetch remote institutions, using default Pune list:', error.message);
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

          {/* Education Level Selector */}
          <div className="form-field">
            <label className="form-label">
              Education Level <span className="form-required">*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              <button
                type="button"
                onClick={() => handleTypeChange('School')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${institutionType === 'School' ? 'var(--color-primary-navy)' : 'var(--color-border)'}`,
                  backgroundColor: institutionType === 'School' ? 'var(--color-soft-blue)' : 'var(--color-card-bg)',
                  color: 'var(--color-primary-navy)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                <School size={16} />
                <span>School / 1st-12th</span>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('College')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${institutionType === 'College' ? 'var(--color-primary-navy)' : 'var(--color-border)'}`,
                  backgroundColor: institutionType === 'College' ? 'var(--color-soft-blue)' : 'var(--color-card-bg)',
                  color: 'var(--color-primary-navy)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer',
                  minHeight: '44px',
                }}
              >
                <GraduationCap size={16} />
                <span>College / University</span>
              </button>
            </div>
          </div>

          {/* Dynamic Institution Dropdown (Filtered to Level) */}
          <Select
            label={institutionType === 'School' ? 'Select School' : 'Select College / University'}
            required
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            options={filteredInstitutions.map((i) => ({
              value: i.id,
              label: `${i.name} (${i.area || i.city || 'Pune'})`,
            }))}
            placeholder={`Choose your ${institutionType.toLowerCase()}...`}
            helperText="Selecting your institution helps juniors find nearby books. It is self-selected, not proof of attendance."
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
