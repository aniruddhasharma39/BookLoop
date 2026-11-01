import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Camera, X, CheckCircle, School, GraduationCap, Check } from 'lucide-react';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import SearchableInstitutionSelect from '../components/common/SearchableInstitutionSelect';
import Alert from '../components/common/Alert';
import LoadingState from '../components/common/LoadingState';
import EmptyState from '../components/common/EmptyState';
import {
  BOOK_CATEGORIES,
  BOOK_CONDITIONS,
  rupeesToPaise,
  paiseToRupees,
  matchesInstitutionType,
  getListingImageUrl,
} from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { fetchCachedInstitutions, invalidateCachePattern } from '../lib/cache';

export default function EditListingPage() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Listing Form Fields
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [edition, setEdition] = useState('');
  const [category, setCategory] = useState('');
  const [institutionType, setInstitutionType] = useState('College');
  const [institutionId, setInstitutionId] = useState('');
  const [courseOrExam, setCourseOrExam] = useState('');
  const [condition, setCondition] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');

  // Existing & New Photos
  const [existingImages, setExistingImages] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);

  // Institutions List
  const [institutions, setInstitutions] = useState([]);

  // Fetch listing and institutions
  useEffect(() => {
    async function loadData() {
      if (!isSupabaseConfigured || !id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Fetch institutions (cached)
        const instData = await fetchCachedInstitutions();
        if (instData) setInstitutions(instData);

        // 2. Fetch the listing
        const { data: listing, error: listingErr } = await supabase
          .from('listings')
          .select(`
            *,
            institutions (id, name, area, institution_type),
            listing_images (id, storage_path, display_order)
          `)
          .eq('id', id)
          .single();

        if (listingErr) throw listingErr;
        if (!listing) throw new Error('Listing not found');

        // Check ownership
        if (listing.seller_id !== user?.id && !isAdmin) {
          throw new Error('Unauthorized: You can only edit your own listings.');
        }

        // Populate fields
        setTitle(listing.title || '');
        setAuthor(listing.author || '');
        setEdition(listing.edition || '');
        setCategory(listing.category || '');
        setCourseOrExam(listing.course_or_exam || '');
        setCondition(listing.condition || '');
        setPriceRupees(paiseToRupees(listing.price_paise).toString());
        setDescription(listing.description || '');
        setStatus(listing.status || 'active');

        if (listing.institution_id) {
          setInstitutionId(listing.institution_id);
          const currentInst = instData?.find((i) => i.id === listing.institution_id);
          if (currentInst) {
            if (matchesInstitutionType(currentInst, 'School')) {
              setInstitutionType('School');
            } else if (matchesInstitutionType(currentInst, 'Others')) {
              setInstitutionType('Others');
            } else {
              setInstitutionType('College');
            }
          }
        }

        // Populate existing images
        const imgs = listing.listing_images?.sort((a, b) => a.display_order - b.display_order) || [];
        setExistingImages(imgs);
      } catch (err) {
        console.error('Error loading listing to edit:', err);
        setErrorMessage(err.message || 'Failed to load listing.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, user, isAdmin]);

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    if (
      newCat === 'School Boards (CBSE / ICSE / State)' ||
      newCat === 'Junior College / 11th & 12th'
    ) {
      setInstitutionType('School');
    } else if (newCat === 'Govt & Competitive Exams') {
      setInstitutionType('Others');
    } else if (
      newCat === 'Engineering & Tech' ||
      newCat === 'Medical & Health Sciences' ||
      newCat === 'Commerce & Management' ||
      newCat === 'Arts & Humanities'
    ) {
      setInstitutionType('College');
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const totalAllowed = 3 - existingImages.length;
    if (newFiles.length + files.length > totalAllowed) {
      setErrorMessage(`You can only have up to 3 photos total (currently ${existingImages.length} saved).`);
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setErrorMessage('Only image files are allowed.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage(`Photo "${file.name}" exceeds the 5MB size limit.`);
        return;
      }
    }

    const updated = [...newFiles, ...files].slice(0, totalAllowed);
    setNewFiles(updated);
    const previews = updated.map((f) => URL.createObjectURL(f));
    setNewPreviews(previews);
  };

  const removeExistingImage = async (imgId, storagePath) => {
    try {
      // Delete from listing_images table
      await supabase.from('listing_images').delete().eq('id', imgId);
      // Delete from Supabase Storage
      if (storagePath) {
        await supabase.storage.from('listing-photos').remove([storagePath]);
      }
      setExistingImages((prev) => prev.filter((img) => img.id !== imgId));
    } catch (err) {
      console.error('Failed to remove image:', err);
    }
  };

  const removeNewFile = (idx) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
    setNewPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveListing = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!title.trim()) {
      setErrorMessage('Please enter the book title.');
      return;
    }
    if (!category) {
      setErrorMessage('Please select a category.');
      return;
    }
    if (!institutionId) {
      setErrorMessage('Please select your campus or school.');
      return;
    }
    const priceNum = parseFloat(priceRupees);
    if (isNaN(priceNum) || priceNum < 0) {
      setErrorMessage('Price must be a valid non-negative number.');
      return;
    }

    setSaving(true);
    try {
      const pricePaise = rupeesToPaise(priceNum);

      // 1. Update listing in database
      const { error: updateErr } = await supabase
        .from('listings')
        .update({
          title: title.trim(),
          author: author.trim() || null,
          edition: edition.trim() || null,
          category,
          institution_id: institutionId,
          course_or_exam: courseOrExam.trim() || null,
          condition,
          description: description.trim() || null,
          price_paise: pricePaise,
          status,
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // 2. Upload any new photos
      if (newFiles.length > 0) {
        const currentOrderOffset = existingImages.length;
        for (let i = 0; i < newFiles.length; i++) {
          const file = newFiles[i];
          const fileExt = file.name.split('.').pop() || 'jpg';
          const filePath = `${id}/${Date.now()}_${i}.${fileExt}`;

          const { error: uploadErr } = await supabase.storage
            .from('listing-photos')
            .upload(filePath, file);

          if (!uploadErr) {
            await supabase.from('listing_images').insert({
              listing_id: id,
              storage_path: filePath,
              display_order: currentOrderOffset + i,
            });
          }
        }
      }

      invalidateCachePattern('listings');
      setSuccessMessage('Listing updated successfully!');
      setTimeout(() => {
        navigate(`/listings/${id}`);
      }, 1000);
    } catch (err) {
      console.error('Update error:', err);
      setErrorMessage(err.message || 'Failed to update listing.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkSold = async () => {
    if (!window.confirm('Mark this textbook as sold? This will close any remaining interest requests.')) return;
    setSaving(true);
    try {
      // Use mark_listing_sold RPC if available, or direct update
      const { error: rpcErr } = await supabase.rpc('mark_listing_sold', {
        p_listing_id: id,
      });

      // Close all requests for this listing
      await supabase
        .from('interest_requests')
        .update({ status: 'closed', responded_at: new Date().toISOString() })
        .eq('listing_id', id)
        .in('status', ['pending', 'accepted']);

      if (rpcErr) {
        await supabase.from('listings').update({ status: 'sold', sold_at: new Date().toISOString() }).eq('id', id);
      }

      invalidateCachePattern('listings');
      setStatus('sold');
      setSuccessMessage('Textbook marked as Sold!');
      setTimeout(() => {
        navigate(`/listings/${id}`);
      }, 1000);
    } catch (err) {
      console.error('Mark sold error:', err);
      setErrorMessage(err.message || 'Failed to mark book as sold.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveListing = async () => {
    if (!window.confirm('Remove this listing from the marketplace? It will no longer appear in search.')) return;
    setSaving(true);
    try {
      const { error: listErr } = await supabase.from('listings').update({ status: 'removed' }).eq('id', id);
      if (listErr) throw listErr;

      // Close open requests for this listing so buyers are notified
      await supabase
        .from('interest_requests')
        .update({ status: 'closed', responded_at: new Date().toISOString() })
        .eq('listing_id', id)
        .in('status', ['pending', 'accepted']);

      invalidateCachePattern('listings');
      setStatus('removed');
      setSuccessMessage('Listing removed from marketplace.');
      setTimeout(() => {
        navigate('/search');
      }, 1000);
    } catch (err) {
      console.error('Remove listing error:', err);
      setErrorMessage(err.message || 'Failed to remove listing.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading listing details..." />;
  }

  if (errorMessage && !title) {
    return (
      <EmptyState
        title="Unable to Edit Listing"
        description={errorMessage}
        actionLabel="Back to Browse"
        onAction={() => navigate('/search')}
      />
    );
  }

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to={`/listings/${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)' }}>
          <ArrowLeft size={16} />
          <span>Back to listing</span>
        </Link>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          Status: <strong style={{ textTransform: 'uppercase' }}>{status}</strong>
        </span>
      </div>

      <div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-navy)' }}>
          Edit Listing
        </h1>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          Update book information, price, photos, or status.
        </p>
      </div>

      {errorMessage && (
        <Alert variant="error" onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success">
          {successMessage}
        </Alert>
      )}

      <Card>
        <form onSubmit={handleSaveListing} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            label="Book Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Input
              label="Author (Optional)"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
            <Input
              label="Edition (Optional)"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
            />
          </div>

          <Select
            label="Category"
            required
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            options={BOOK_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />

          <SearchableInstitutionSelect
            institutions={institutions}
            selectedInstitutionId={institutionId}
            institutionType={institutionType}
            onTypeChange={(newType) => {
              setInstitutionType(newType);
              setInstitutionId('');
            }}
            onSelect={(id) => setInstitutionId(id)}
            required
          />

          <Input
            label={institutionType === 'School' ? 'Class / Standard' : 'Course / Year / Exam'}
            value={courseOrExam}
            onChange={(e) => setCourseOrExam(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <Select
              label="Condition"
              required
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              options={BOOK_CONDITIONS}
            />

            <Input
              label="Price (₹)"
              type="number"
              min="0"
              required
              prefix="₹"
              value={priceRupees}
              onChange={(e) => setPriceRupees(e.target.value)}
            />
          </div>

          {/* Photos Management */}
          <div className="form-field">
            <label className="form-label">
              Book Photos ({existingImages.length + newFiles.length} of 3 max)
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center', marginTop: 'var(--space-2)' }}>
              {/* Existing saved photos */}
              {existingImages.map((img) => {
                const imgUrl = getListingImageUrl(img.storage_path);
                return (
                  <div key={img.id} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    <img src={imgUrl} alt="Saved" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(img.id, img.storage_path)}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="Delete saved photo"
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}

              {/* Newly attached photo previews */}
              {newPreviews.map((url, idx) => (
                <div key={idx} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '2px solid var(--color-primary-navy)' }}>
                  <img src={url} alt="New upload" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={() => removeNewFile(idx)}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    title="Remove attachment"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {existingImages.length + newFiles.length < 3 && (
                <label style={{
                  width: '80px',
                  height: '80px',
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
                  <Camera size={18} />
                  <span>Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">Short Description</label>
            <div className="input-wrapper" style={{ padding: 'var(--space-2)' }}>
              <textarea
                rows={3}
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <Button type="submit" variant="primary" size="lg" loading={saving} fullWidth>
              <Save size={18} />
              <span>Save Changes</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* Quick Status Actions */}
      <Card>
        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-primary-navy)', marginBottom: 'var(--space-2)' }}>
          Listing Status & Handover
        </h3>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
          Once you have handed over the book to a junior, mark it as sold to close remaining pending requests.
        </p>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {status !== 'sold' && (
            <Button variant="accent" size="md" onClick={handleMarkSold} loading={saving}>
              <Check size={16} />
              <span>Mark as Sold</span>
            </Button>
          )}

          {status !== 'removed' && (
            <Button variant="danger" size="md" onClick={handleRemoveListing} loading={saving}>
              <Trash2 size={16} />
              <span>Remove from Marketplace</span>
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
