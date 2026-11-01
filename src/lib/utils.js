import { supabase } from './supabase';

/**
 * BookLoop Utility Functions
 * Single source of truth for money formatting, categories, institution types and data transformations
 */

// Format listing reference number (e.g. 'BL-10042' or 'BL-E7F2A1')
export function formatListingRef(listingOrId) {
  if (!listingOrId) return 'BL-1000';
  if (typeof listingOrId === 'object') {
    if (listingOrId.reference_no) return listingOrId.reference_no;
    if (listingOrId.id) return `BL-${listingOrId.id.slice(0, 6).toUpperCase()}`;
  }
  if (typeof listingOrId === 'string') {
    if (listingOrId.startsWith('BL-')) return listingOrId;
    return `BL-${listingOrId.slice(0, 6).toUpperCase()}`;
  }
  return 'BL-1000';
}

// Convert integer paise to Indian Rupee string (e.g. 25000 paise -> ₹250)
export function formatRupees(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return '₹0';
  const rupees = Math.floor(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

// Convert paise to plain numeric rupees for input fields
export function paiseToRupees(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return 0;
  return Math.floor(paise / 100);
}

// Convert rupees to integer paise for database storage (strictly non-negative)
export function rupeesToPaise(rupees) {
  const parsed = parseFloat(rupees);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

// Resolve image URL from storage path
export function getListingImageUrl(storagePath) {
  if (!storagePath) return null;
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }
  const { data } = supabase.storage.from('listing-photos').getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

// Standard categories specified in the brief
export const BOOK_CATEGORIES = [
  'Engineering & Tech',
  'Medical & Health Sciences',
  'Commerce & Management',
  'Arts & Humanities',
  'Junior College / 11th & 12th',
  'School Boards (CBSE / ICSE / State)',
  'Competitive Exams (JEE / NEET / UPSC / GATE)',
  'Fiction & General Reading',
  'Other',
];

// Institution Types
export const INSTITUTION_TYPES = [
  { value: 'School', label: 'School & Junior College (1st - 12th Std / CBSE / ICSE)' },
  { value: 'College', label: 'College & University (Undergraduate / Postgraduate)' },
  { value: 'Other', label: 'Competitive Exam Prep / Coaching Institutes' },
];

/**
 * Accurate category matcher for School vs College vs Others
 * Strictly maps to defined `inst.institution_type` ('School', 'College', 'Other' / 'Others')
 * Falls back to name keywords ONLY if institution_type is completely undefined/blank.
 */
export function matchesInstitutionType(inst, targetType) {
  if (!inst) return false;
  if (!targetType) return true;

  const rawType = (inst.institution_type || '').toLowerCase().trim();
  const target = targetType.toLowerCase().trim();

  // 1. Primary Mapping: If category (institution_type) is defined on the institution, map directly!
  if (rawType) {
    if (target === 'school') {
      return rawType === 'school' || rawType.startsWith('school') || rawType.includes('school');
    }
    if (target === 'college') {
      return (
        rawType === 'college' ||
        rawType === 'university' ||
        rawType.startsWith('college') ||
        rawType.startsWith('univ')
      );
    }
    if (target === 'other' || target === 'others') {
      return (
        rawType === 'other' ||
        rawType === 'others' ||
        rawType.includes('coaching') ||
        rawType.includes('academy')
      );
    }
    return false;
  }

  // 2. Secondary heuristic fallback ONLY if institution_type is completely undefined/blank
  const name = (inst.name || '').toLowerCase().trim();
  if (target === 'school') {
    return (
      name.includes('school') ||
      name.includes('vidyalaya') ||
      name.includes('prashala') ||
      name.includes('higher secondary')
    );
  }

  if (target === 'other' || target === 'others') {
    return (
      name.includes('allen') ||
      name.includes('aakash') ||
      name.includes('coaching') ||
      name.includes('academy') ||
      name.includes('vidyapeeth') ||
      name.includes('physics wallah') ||
      name.includes('kautilya') ||
      name.includes('prep') ||
      name.includes('catalyser')
    );
  }

  if (target === 'college') {
    return (
      name.includes('college') ||
      name.includes('institute') ||
      name.includes('university')
    );
  }

  return true;
}

// Standard book conditions
export const BOOK_CONDITIONS = [
  { value: 'Like New', label: 'Like New (Unmarked, crisp pages)' },
  { value: 'Good', label: 'Good (Minor wear, light pencil notes)' },
  { value: 'Fair', label: 'Fair (Highlighted, worn spine or cover)' },
];

// Validate and format Indian WhatsApp numbers
export function validateAndFormatWhatsApp(input) {
  if (!input || !input.trim()) {
    return { isValid: false, formatted: '', error: 'WhatsApp number is required.' };
  }

  const cleaned = input.trim();
  const digitsOnly = cleaned.replace(/\D/g, '');

  // Exactly 10 digits starting with 6-9
  if (digitsOnly.length === 10) {
    if (!/^[6-9]/.test(digitsOnly)) {
      return { isValid: false, formatted: '', error: 'Mobile number must start with 6, 7, 8, or 9.' };
    }
    return { isValid: true, formatted: `+91${digitsOnly}`, error: null };
  }

  // 12 digits starting with 91 followed by 6-9
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    const localNumber = digitsOnly.slice(2);
    if (!/^[6-9]/.test(localNumber)) {
      return { isValid: false, formatted: '', error: 'Mobile number must start with 6, 7, 8, or 9.' };
    }
    return { isValid: true, formatted: `+${digitsOnly}`, error: null };
  }

  return {
    isValid: false,
    formatted: '',
    error: 'Please enter a valid 10-digit mobile number (e.g., 9876543210 or +919876543210).',
  };
}

// Clean international phone number to wa.me format
export function createWhatsAppUrl(phoneNumber, bookTitle) {
  if (!phoneNumber) return '#';
  // Strip non-digit characters
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  // Default to India country code 91 if 10 digits provided
  const fullNumber = cleanNumber.length === 10 ? `91${cleanNumber}` : cleanNumber;
  const message = encodeURIComponent(
    `Hi! I saw your listing for "${bookTitle || 'your textbook'}" on BookLoop and my request was accepted. When and where can we meet on campus to complete the handover?`
  );
  return `https://wa.me/${fullNumber}?text=${message}`;
}
