import { useState, useRef, useEffect } from 'react';
import { Upload, X, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { getImageUrl } from '../utils/imageUrl';

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Reusable Multi-Image Upload Component
 *
 * Props:
 * - existingImages: Array of existing image records [{ url, filename }]
 * - onExistingImagesChange: Callback (updatedExistingList) => void
 * - newFiles: Array of newly selected File objects
 * - onNewFilesChange: Callback (updatedFileList) => void
 * - maxImages: Number (default 5)
 * - disabled: Boolean
 */
export default function ImageUpload({
  existingImages = [],
  onExistingImagesChange = () => {},
  newFiles = [],
  onNewFilesChange = () => {},
  maxImages = MAX_IMAGES,
  disabled = false,
}) {
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState([]);
  const fileInputRef = useRef(null);

  // Synchronize object URLs for local previews of newly selected files
  useEffect(() => {
    const urls = newFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews(urls);

    // Revoke object URLs on cleanup to prevent memory leaks
    return () => {
      urls.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [newFiles]);

  const totalCount = existingImages.length + newFiles.length;

  const handleFileSelection = (e) => {
    setError('');
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;

    // Reset input so the user can re-select the same file if needed
    if (fileInputRef.current) fileInputRef.current.value = '';

    const remainingSlots = maxImages - totalCount;
    if (remainingSlots <= 0) {
      setError(`Maximum of ${maxImages} images allowed per listing.`);
      return;
    }

    const validFiles = [];
    const rejectedErrors = [];

    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
        rejectedErrors.push(`"${file.name}" is not a supported format. Please use JPEG, PNG, or WebP.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        rejectedErrors.push(`"${file.name}" exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
        continue;
      }
      validFiles.push(file);
    }

    if (rejectedErrors.length > 0) {
      setError(rejectedErrors.join(' '));
    }

    if (!validFiles.length) return;

    if (validFiles.length > remainingSlots) {
      setError(
        `You can only add ${remainingSlots} more image${remainingSlots === 1 ? '' : 's'}. Added the first ${remainingSlots}.`
      );
    }

    const filesToAdd = validFiles.slice(0, remainingSlots);
    onNewFilesChange([...newFiles, ...filesToAdd]);
  };

  const removeExisting = (indexToRemove) => {
    setError('');
    const updated = existingImages.filter((_, idx) => idx !== indexToRemove);
    onExistingImagesChange(updated);
  };

  const removeNewFile = (indexToRemove) => {
    setError('');
    const updated = newFiles.filter((_, idx) => idx !== indexToRemove);
    onNewFilesChange(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header & count */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-600 text-slate-300 uppercase tracking-wider block">
          Photos ({totalCount} / {maxImages})
        </label>
        <span className="text-xs text-slate-400">
          JPEG, PNG, WebP &bull; Max 5 MB each
        </span>
      </div>

      {/* Validation error display */}
      {error && (
        <div className="flex items-start gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs leading-relaxed animate-fade-in">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Dropzone / Upload button */}
      {totalCount < maxImages && (
        <div
          onClick={() => !disabled && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          tabIndex={disabled ? -1 : 0}
          role="button"
          aria-label="Upload item photos"
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
            disabled
              ? 'border-surface-600 bg-surface-800/40 opacity-50 cursor-not-allowed'
              : 'border-brand-500/30 hover:border-brand-500/60 bg-surface-700/30 hover:bg-surface-700/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            id="listing-images-input"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelection}
            disabled={disabled}
            className="hidden"
          />
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 text-brand-400 flex items-center justify-center mx-auto mb-3">
            <Upload size={22} />
          </div>
          <p className="font-600 text-slate-200 text-sm mb-1">
            Click to upload photos
          </p>
          <p className="text-xs text-slate-400">
            Select one or multiple photos from your device
          </p>
        </div>
      )}

      {/* Preview grid */}
      {totalCount > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {/* Existing images (from backend) */}
          {existingImages.map((img, i) => {
            const src = getImageUrl(img);
            return (
              <div
                key={`existing-${img.filename || img.url || i}`}
                className="relative group rounded-xl overflow-hidden aspect-square bg-surface-800 border border-white/5"
              >
                <img
                  src={src}
                  alt={`Listing photo ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-1.5 left-1.5 text-[10px] bg-black/70 text-slate-300 px-1.5 py-0.5 rounded backdrop-blur-sm">
                  Saved
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeExisting(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-500/90 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Newly selected files (local previews) */}
          {previews.map((item, i) => (
            <div
              key={`new-${item.file.name}-${item.file.size}-${i}`}
              className="relative group rounded-xl overflow-hidden aspect-square bg-surface-800 border border-brand-500/30"
            >
              <img
                src={item.url}
                alt={`New upload ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1.5 left-1.5 text-[10px] bg-brand-500/80 text-white px-1.5 py-0.5 rounded font-600 backdrop-blur-sm">
                New
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeNewFile(i)}
                  aria-label={`Remove new photo ${i + 1}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-500/90 hover:bg-rose-600 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-500 text-xs flex items-center gap-1.5">
          <ImageIcon size={14} /> At least 1 image is required to publish this listing.
        </p>
      )}
    </div>
  );
}
