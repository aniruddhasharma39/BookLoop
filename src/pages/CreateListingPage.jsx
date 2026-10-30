import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, PlusCircle, AlertCircle, X, School, GraduationCap, ShieldAlert } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import Alert from '../components/common/Alert';
import { BOOK_CATEGORIES, BOOK_CONDITIONS, rupeesToPaise, matchesInstitutionType } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function CreateListingPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [edition, setEdition] = useState('');
  const [category, setCategory] = useState('');
  const [institutionType, setInstitutionType] = useState('College'); // 'School' | 'College' | 'Other'
  const [institutionId, setInstitutionId] = useState('');
  const [courseOrExam, setCourseOrExam] = useState('');
  const [condition, setCondition] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [description, setDescription] = useState('');
  
  // Institutions list from Supabase
  const [institutions, setInstitutions] = useState([]);

  // Photos (at least 1, max 3)
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch active institutions from Supabase
  useEffect(() => {
    async function loadInstitutions() {
      if (!isSupabaseConfigured) return;
      try {
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name, city, area, institution_type')
          .eq('is_active', true)
          .order('name');

        if (!error && data) {
          setInstitutions(data);

          // If user has a default institution in profile, initialize with it
          if (profile?.institution_id) {
            setInstitutionId(profile.institution_id);
            const userInst = data.find((i) => i.id === profile.institution_id);
            if (userInst) {
              setInstitutionType(matchesInstitutionType(userInst, 'School') ? 'School' : 'College');
            }
          }
        }
      } catch (err) {
        console.error('Failed to load institutions:', err);
      }
    }

    loadInstitutions();
  }, [profile]);

  // Auto-switch institution level when category changes
  const handleCategoryChange = (newCat) => {
    setCategory(newCat);

    if (
      newCat === 'School Boards (CBSE / ICSE / State)' ||
      newCat === 'Junior College / 11th & 12th'
    ) {
      setInstitutionType('School');
      const currentInst = institutions.find((i) => i.id === institutionId);
      if (currentInst && !matchesInstitutionType(currentInst, 'School')) {
        setInstitutionId('');
      }
    } else if (
      newCat === 'Engineering & Tech' ||
      newCat === 'Medical & Health Sciences' ||
      newCat === 'Commerce & Management' ||
      newCat === 'Arts & Humanities'
    ) {
      setInstitutionType('College');
      const currentInst = institutions.find((i) => i.id === institutionId);
      if (currentInst && !matchesInstitutionType(currentInst, 'College')) {
        setInstitutionId('');
      }
    }
  };

  const handleTypeChange = (newType) => {
    setInstitutionType(newType);
    setInstitutionId('');
  };

  // Filter institutions according to selected level (School vs College vs Other)
  let filteredInstitutions = institutions.filter((inst) => {
    return matchesInstitutionType(inst, institutionType);
  });

  if (filteredInstitutions.length === 0) {
    filteredInstitutions = institutions;
  }

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (selectedFiles.length + files.length > 3) {
      setErrorMessage('You can upload a maximum of 3 photos per listing.');
      return;
    }

    // Validate size (max 5MB each) and mime type (jpeg, png, webp)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        setErrorMessage(`Photo "${file.name}" has an unsupported format. Please upload JPG, PNG, or WebP.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage(`Photo "${file.name}" is larger than the 5MB size limit.`);
        return;
      }
    }

    const updatedFiles = [...selectedFiles, ...files].slice(0, 3);
    setSelectedFiles(updatedFiles);

    // Create preview object URLs
    const newPreviews = updatedFiles.map((file) => URL.createObjectURL(file));
    setPreviewUrls(newPreviews);
  };

  const removePhoto = (index) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    const newPreviews = previewUrls.filter((_, i) => i !== index);
    setPreviewUrls(newPreviews);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (profile?.account_status === 'suspended') {
      setErrorMessage('Your account is currently suspended. Suspended accounts cannot publish new book listings.');
      return;
    }

    // 1. Mandatory Photo validation (At least 1 photo required)
    if (selectedFiles.length === 0) {
      setErrorMessage('At least one photo is required. Please upload a clear photo of the textbook cover or condition.');
      return;
    }

    // 2. Title & category validation
    if (!title.trim()) {
      setErrorMessage('Please enter the book title.');
      return;
    }
    if (!category) {
      setErrorMessage('Please select a category.');
      return;
    }
    if (!institutionId) {
      setErrorMessage(`Please select the relevant ${institutionType === 'School' ? 'school' : 'college / campus'} for this book.`);
      return;
    }
    if (!condition) {
      setErrorMessage('Please select the book condition.');
      return;
    }

    // 3. Price validation
    const priceNum = parseFloat(priceRupees);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorMessage('Price must be a valid non-negative number.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('Supabase is not configured. Please check your credentials in .env');
      return;
    }

    setSubmitting(true);
    setUploadStatus('Saving book listing details...');

    try {
      const pricePaise = rupeesToPaise(priceNum);

      // 1. Insert listing row with authenticated seller_id
      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .insert({
          seller_id: user.id,
          institution_id: institutionId,
          title: title.trim(),
          author: author.trim() || null,
          edition: edition.trim() || null,
          category,
          course_or_exam: courseOrExam.trim() || null,
          condition,
          description: description.trim() || null,
          price_paise: pricePaise,
          status: 'active',
        })
        .select()
        .single();

      if (listingError) throw listingError;

      // 2. Upload photos with progress tracking
      for (let i = 0; i < selectedFiles.length; i++) {
        setUploadStatus(`Uploading photo ${i + 1} of ${selectedFiles.length}...`);
        const file = selectedFiles[i];
        const fileExt = file.name.split('.').pop() || 'jpg';
        const filePath = `${listingData.id}/${Date.now()}_${i}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('listing-photos')
          .upload(filePath, file, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadErr) {
          console.error('Storage upload error:', uploadErr);
        } else {
          await supabase.from('listing_images').insert({
            listing_id: listingData.id,
            storage_path: filePath,
            display_order: i,
          });
        }
      }

      setUploadStatus('Finalizing listing...');
      setSuccessMessage('Your textbook is now listed on BookLoop!');
      setTimeout(() => {
        navigate(`/listings/${listingData.id}`);
      }, 1000);
    } catch (err) {
      console.error('Failed to create listing:', err);
      setErrorMessage(err.message || 'Failed to publish listing. Please try again.');
    } finally {
      setSubmitting(false);
      setUploadStatus('');
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
          List a Textbook
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Help a junior student and give your unused book a second life.
        </p>
      </div>

      {errorMessage && (
        <Alert variant="error" onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success">{successMessage}</Alert>
      )}

      {profile?.account_status === 'suspended' && (
        <Alert variant="error" title="Account Suspended">
          Your account is currently suspended due to safety or moderation actions. You cannot publish new book listings. If you believe this is in error, contact{' '}
          <a href="mailto:support@bookloop.in" style={{ fontWeight: 600, textDecoration: 'underline' }}>
            support@bookloop.in
          </a>.
        </Alert>
      )}

      <Card>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Photos Upload (Mandatory at least 1 photo) */}
          <div className="form-field">
            <label className="form-label">
              Book Photos <span className="form-required">*</span> (At least 1 photo required, up to 3)
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginTop: 'var(--space-2)' }}>
              {previewUrls.map((url, idx) => (
                <div key={idx} style={{ position: 'relative', width: '90px', height: '90px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                  <img src={url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    aria-label="Remove photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              {selectedFiles.length < 3 && (
                <label style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: 'var(--radius-md)',
                  border: '2px dashed var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--font-size-xs)'
                }}>
                  <Camera size={22} />
                  <span>Add Photo</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
            <p className="form-feedback form-feedback--helper">
              Supported formats: JPG, PNG, WebP (Max 5MB each). Real photos of the front cover and pages build trust.
            </p>
          </div>

          <Input
            label="Book Title"
            required
            placeholder="e.g. Higher Engineering Mathematics"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Author (Optional)"
              placeholder="e.g. B. S. Grewal"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <Input
              label="Edition (Optional)"
              placeholder="e.g. 44th Edition"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
            />
          </div>

          {/* Academic Category */}
          <Select
            label="Category"
            required
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            options={BOOK_CATEGORIES.map((c) => ({ value: c, label: c }))}
            placeholder="Select academic category..."
            helperText="Selecting a school or college category automatically filters institutes accordingly."
          />

          {/* Institute Level Selector */}
          <div className="form-field">
            <label className="form-label">
              Institute Type <span className="form-required">*</span>
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
            label={institutionType === 'School' ? 'School / Campus' : 'College / University'}
            required
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            options={filteredInstitutions.map((i) => ({
              value: i.id,
              label: `${i.name} (${i.area})`,
            }))}
            placeholder={`Select ${institutionType === 'School' ? 'school' : 'college'} where book is relevant...`}
            helperText={`Showing ${filteredInstitutions.length} ${institutionType.toLowerCase()}s in your city.`}
          />

          <Input
            label={institutionType === 'School' ? 'Class / Standard (Optional)' : 'Course / Year / Exam (Optional)'}
            placeholder={institutionType === 'School' ? 'e.g. Class 10 CBSE, 12th Science' : 'e.g. First Year Engineering, B.Com Sem 3'}
            value={courseOrExam}
            onChange={(e) => setCourseOrExam(e.target.value)}
          />

          <Select
            label="Condition"
            required
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            options={BOOK_CONDITIONS}
            placeholder="Select book condition..."
          />

          <Input
            label="Selling Price"
            type="number"
            min="0"
            required
            prefix="₹"
            placeholder="250"
            helperText="Enter price in Rupees (stored securely as integer paise in the database)."
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
          />

          <div className="form-field">
            <label className="form-label">Short Description (Optional)</label>
            <div className="input-wrapper" style={{ padding: 'var(--space-2)' }}>
              <textarea
                rows={3}
                className="form-input"
                placeholder="Mention any highlights, missing CD, or preferred campus meetup spot..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Community Standards & Safety Note (Brief Section 7) */}
          <Alert variant="info" title="Community Rules & Safety">
            Please be honest about the condition of your book. Counterfeit, photocopied, or pirated textbooks are strictly prohibited on BookLoop.
          </Alert>

          <Button
            type="submit"
            variant="accent"
            size="lg"
            loading={submitting}
            disabled={profile?.account_status === 'suspended'}
            fullWidth
            style={{ marginTop: 'var(--space-2)' }}
          >
            <PlusCircle size={20} />
            <span>{uploadStatus || 'Publish Listing'}</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
