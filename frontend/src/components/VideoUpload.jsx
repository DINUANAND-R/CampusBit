import { useState, useRef, useEffect } from 'react';
import { Video, X, AlertCircle, RefreshCw, Play, Film, CheckCircle } from 'lucide-react';
import { getVideoUrl } from '../utils/imageUrl';

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_DURATION_SEC = 60;
const ALLOWED_MIME_TYPES = ['video/mp4', 'video/webm'];

/**
 * Reusable Product Video Upload Component
 *
 * Props:
 * - existingVideo: { url, filename, duration, size, mimeType } | null
 * - onExistingVideoChange: (video | null) => void
 * - selectedFile: File | null
 * - onFileChange: (file | null) => void
 * - disabled: boolean
 */
export default function VideoUpload({
  existingVideo = null,
  onExistingVideoChange = () => {},
  selectedFile = null,
  onFileChange = () => {},
  disabled = false,
}) {
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [checkingDuration, setCheckingDuration] = useState(false);
  const fileInputRef = useRef(null);

  // Manage object URL for previewing newly selected file
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      setVideoDuration(null);
      return;
    }

    const objUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objUrl);

    // Read metadata and duration from newly selected video file in browser
    setCheckingDuration(true);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = objUrl;

    tempVideo.onloadedmetadata = () => {
      setCheckingDuration(false);
      const dur = tempVideo.duration;
      if (!isNaN(dur) && isFinite(dur)) {
        if (dur > MAX_DURATION_SEC + 0.5) {
          setError(
            `Video duration (${Math.round(dur)}s) exceeds the 60-second limit. Please select a clip that is 60 seconds or shorter.`
          );
          onFileChange(null);
        } else {
          setVideoDuration(Math.round(dur * 10) / 10);
        }
      }
    };

    tempVideo.onerror = () => {
      setCheckingDuration(false);
      // Let server inspect if browser can't decode metadata locally
    };

    return () => {
      URL.revokeObjectURL(objUrl);
    };
  }, [selectedFile, onFileChange]);

  const formatFileSize = (bytes) => {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (seconds) => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleFileChange = (e) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so user can reselect the same file if needed
    if (fileInputRef.current) fileInputRef.current.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase();
    const isMp4OrWebm =
      ALLOWED_MIME_TYPES.includes(file.type.toLowerCase()) ||
      ext === 'mp4' ||
      ext === 'webm';

    if (!isMp4OrWebm) {
      setError(`"${file.name}" is not a supported format. Please upload an MP4 or WebM video.`);
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      setError(
        `"${file.name}" exceeds the 50 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      );
      return;
    }

    // Inspect duration before confirming
    const tempUrl = URL.createObjectURL(file);
    const vCheck = document.createElement('video');
    vCheck.preload = 'metadata';
    vCheck.src = tempUrl;

    vCheck.onloadedmetadata = () => {
      URL.revokeObjectURL(tempUrl);
      const dur = vCheck.duration;
      if (!isNaN(dur) && isFinite(dur) && dur > MAX_DURATION_SEC + 0.5) {
        setError(
          `Video duration (${Math.round(dur)}s) exceeds the maximum allowed 60-second limit. Please select a shorter video.`
        );
      } else {
        onFileChange(file);
      }
    };

    vCheck.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      // Fallback: accept file and let server validate magic bytes & duration
      onFileChange(file);
    };
  };

  const handleRemove = () => {
    setError('');
    if (selectedFile) {
      onFileChange(null);
    }
    if (existingVideo) {
      onExistingVideoChange(null);
    }
  };

  const hasVideo = Boolean(selectedFile || existingVideo);
  const activeVideoUrl = selectedFile ? previewUrl : getVideoUrl(existingVideo);
  const currentDuration = selectedFile ? videoDuration : existingVideo?.duration;
  const currentSize = selectedFile ? selectedFile.size : existingVideo?.size;
  const currentFilename = selectedFile ? selectedFile.name : (existingVideo?.filename || 'Uploaded Video');

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-600 text-slate-300 uppercase tracking-wider block flex items-center gap-1.5">
            <Film size={14} className="text-brand-400" />
            Product Video <span className="text-slate-500 font-400 lowercase text-[11px]">(optional)</span>
          </label>
          <p className="text-slate-400 text-xs mt-0.5">
            Upload 1 short video clip showcasing item condition and functionality.
          </p>
        </div>
        <span className="text-[11px] font-500 px-2 py-0.5 rounded-full bg-surface-700 text-slate-400 border border-white/5">
          {hasVideo ? '1 / 1 video' : '0 / 1 video'}
        </span>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-3.5 py-2.5 text-xs animate-fade-in">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {/* Main View: Either Video Player or Empty Dropzone */}
      {hasVideo ? (
        <div className="bg-surface-800/80 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 animate-fade-in">
          {/* Video Player Preview */}
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-64 flex items-center justify-center">
            {activeVideoUrl ? (
              <video
                src={activeVideoUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full object-contain"
              >
                Your browser does not support HTML video playback.
              </video>
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                <Video size={32} />
                <span className="text-xs">Loading video preview…</span>
              </div>
            )}
          </div>

          {/* Video details metadata bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-600 text-slate-200 max-w-[180px] sm:max-w-xs truncate" title={currentFilename}>
                {currentFilename}
              </span>
              {currentSize > 0 && (
                <span className="px-2 py-0.5 rounded bg-surface-700 text-slate-300 font-mono text-[11px]">
                  {formatFileSize(currentSize)}
                </span>
              )}
              {currentDuration !== null && currentDuration !== undefined && (
                <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 font-mono text-[11px] flex items-center gap-1">
                  ⏱️ {formatDuration(currentDuration)} ({Math.round(currentDuration)}s)
                </span>
              )}
              {selectedFile && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-1">
                  <CheckCircle size={11} /> Ready to upload
                </span>
              )}
            </div>

            {/* Actions: Replace / Remove */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="btn btn-secondary btn-sm py-1 px-2.5 text-xs flex items-center gap-1.5"
                title="Select a different video file"
              >
                <RefreshCw size={12} /> Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled}
                className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-1.5"
                title="Remove video from listing"
              >
                <X size={12} /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty Upload Dropzone */
        <div
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer select-none ${
            disabled
              ? 'border-white/5 opacity-50 cursor-not-allowed'
              : 'border-white/10 hover:border-brand-400/50 hover:bg-surface-800/40'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center">
            <Video size={24} />
          </div>
          <div>
            <p className="font-600 text-slate-200 text-sm">
              Click to upload product video
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              MP4 or WebM &bull; Maximum 50 MB &bull; Up to 60 seconds
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            className="btn btn-secondary btn-sm py-1 px-3 text-xs pointer-events-none mt-1"
          >
            Select Video File
          </button>
        </div>
      )}
    </div>
  );
}
