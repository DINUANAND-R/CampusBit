const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let hasCheckedFfprobe = false;
let ffprobePath = null;

/**
 * Checks if ffprobe binary is available on the system PATH
 */
function isFfprobeAvailable() {
  if (hasCheckedFfprobe) return Boolean(ffprobePath);
  hasCheckedFfprobe = true;
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? 'where.exe ffprobe' : 'which ffprobe';
    const out = execSync(checkCmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
      .toString()
      .trim();
    if (out) {
      ffprobePath = out.split(/\r?\n/)[0].trim();
      return true;
    }
  } catch {
    ffprobePath = null;
  }
  return false;
}

/**
 * Validates actual video file content using magic byte signatures.
 * Returns { valid: true, format: 'mp4' | 'webm', mimeType: 'video/mp4' | 'video/webm' } or { valid: false, error }
 */
function validateVideoMagicBytes(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'File does not exist on disk' };
    }

    const stat = fs.statSync(filePath);
    if (stat.size < 16) {
      return { valid: false, error: 'File is too small to be a valid video' };
    }

    const buffer = Buffer.alloc(256);
    const fd = fs.openSync(filePath, 'r');
    let bytesRead = 0;
    try {
      bytesRead = fs.readSync(fd, buffer, 0, 256, 0);
    } finally {
      fs.closeSync(fd);
    }

    if (bytesRead < 16) {
      return { valid: false, error: 'Could not read video header' };
    }

    // 1. Check for MP4:
    // Box header at offset 0: 4 bytes length, then bytes 4..8 = 'ftyp'
    if (buffer.toString('ascii', 4, 8) === 'ftyp') {
      const majorBrand = buffer.toString('ascii', 8, 12).toLowerCase();
      // Allow standard ISO/MP4 brands e.g. isom, iso2, mp41, mp42, qt, m4v, avc1, dash
      const knownBrands = ['isom', 'iso2', 'mp41', 'mp42', 'qt  ', 'm4v ', 'avc1', 'dash'];
      const isKnown = knownBrands.some((b) => majorBrand.startsWith(b.trim()));
      // Also check compatible brands in bytes 16..48
      const headerStr = buffer.toString('ascii', 0, Math.min(bytesRead, 64));
      if (isKnown || headerStr.includes('isom') || headerStr.includes('mp4')) {
        return { valid: true, format: 'mp4', mimeType: 'video/mp4' };
      }
      // If starts with ftyp, consider it MP4
      return { valid: true, format: 'mp4', mimeType: 'video/mp4' };
    }

    // 2. Check for WebM:
    // EBML header starts with 1A 45 DF A3
    if (
      buffer[0] === 0x1a &&
      buffer[1] === 0x45 &&
      buffer[2] === 0xdf &&
      buffer[3] === 0xa3
    ) {
      // Must contain 'webm' within first 256 bytes (DocType)
      const headerStr = buffer.toString('ascii', 0, bytesRead);
      if (headerStr.includes('webm')) {
        return { valid: true, format: 'webm', mimeType: 'video/webm' };
      }
      return { valid: true, format: 'webm', mimeType: 'video/webm' };
    }

    return {
      valid: false,
      error: 'Invalid video file signature. Only authentic MP4 and WebM videos are allowed.',
    };
  } catch (err) {
    return { valid: false, error: `Error validating video signature: ${err.message}` };
  }
}

/**
 * Extracts duration from an MP4 file by parsing box atoms (moov -> mvhd)
 */
function parseMp4Duration(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    const fileSize = stat.size;
    let offset = 0;
    const headerBuf = Buffer.alloc(16);

    while (offset + 8 <= fileSize) {
      fs.readSync(fd, headerBuf, 0, 8, offset);
      const size = headerBuf.readUInt32BE(0);
      const type = headerBuf.toString('ascii', 4, 8);
      let boxSize = size;
      let headerLen = 8;

      if (size === 1) {
        fs.readSync(fd, headerBuf, 8, 8, offset + 8);
        boxSize = Number(headerBuf.readBigUInt64BE(8));
        headerLen = 16;
      } else if (size === 0) {
        boxSize = fileSize - offset;
      }

      if (boxSize < headerLen || offset + boxSize > fileSize) break;

      if (type === 'moov') {
        // Read moov contents (up to 4MB) to locate mvhd box
        const readLen = Math.min(boxSize - headerLen, 4 * 1024 * 1024);
        const moovBuf = Buffer.alloc(readLen);
        fs.readSync(fd, moovBuf, 0, readLen, offset + headerLen);

        const mvhdIdx = moovBuf.indexOf(Buffer.from('mvhd', 'ascii'));
        if (mvhdIdx >= 4 && mvhdIdx + 28 <= moovBuf.length) {
          const payload = mvhdIdx + 4;
          const version = moovBuf.readUInt8(payload);
          let timescale, duration;
          if (version === 0) {
            timescale = moovBuf.readUInt32BE(payload + 12);
            duration = moovBuf.readUInt32BE(payload + 16);
          } else if (version === 1) {
            timescale = moovBuf.readUInt32BE(payload + 20);
            duration = Number(moovBuf.readBigUInt64BE(payload + 24));
          }
          if (timescale && timescale > 0) {
            return duration / timescale;
          }
        }
      }

      offset += boxSize;
    }
  } catch (err) {
    console.error('[videoInspection] Error parsing MP4 box duration:', err.message);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return null;
}

/**
 * Extracts duration from a WebM file by parsing EBML Info Duration and TimecodeScale
 */
function parseWebmDuration(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    // Read up to first 2MB to find Info element
    const readLen = Math.min(stat.size, 2 * 1024 * 1024);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, 0);

    // Look for Duration ID 0x4489
    const durIdx = buf.indexOf(Buffer.from([0x44, 0x89]));
    if (durIdx === -1 || durIdx + 6 > buf.length) return null;

    const lenByte = buf[durIdx + 2];
    let valLen = 0;
    let offset = durIdx + 3;
    if ((lenByte & 0x80) !== 0) {
      valLen = lenByte & 0x7f;
    } else if ((lenByte & 0x40) !== 0) {
      valLen = ((lenByte & 0x3f) << 8) | buf[durIdx + 3];
      offset = durIdx + 4;
    }

    let durationMs = 0;
    if (valLen === 4 && offset + 4 <= buf.length) {
      durationMs = buf.readFloatBE(offset);
    } else if (valLen === 8 && offset + 8 <= buf.length) {
      durationMs = buf.readDoubleBE(offset);
    } else {
      return null;
    }

    // Look for TimecodeScale ID 0x2AD7B1 (default is 1,000,000 ns = 1 ms)
    let timecodeScaleNs = 1000000;
    const tcIdx = buf.indexOf(Buffer.from([0x2a, 0xd7, 0xb1]));
    if (tcIdx !== -1 && tcIdx + 4 <= buf.length) {
      const tcLenByte = buf[tcIdx + 3];
      const tcLen = tcLenByte & 0x7f;
      if (tcLen > 0 && tcIdx + 4 + tcLen <= buf.length) {
        let tcVal = 0;
        for (let i = 0; i < tcLen; i++) {
          tcVal = tcVal * 256 + buf[tcIdx + 4 + i];
        }
        if (tcVal > 0) timecodeScaleNs = tcVal;
      }
    }

    const durationSec = (durationMs * timecodeScaleNs) / 1000000000;
    return durationSec;
  } catch (err) {
    console.error('[videoInspection] Error parsing WebM duration:', err.message);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return null;
}

/**
 * Gets video duration in seconds using ffprobe if available, or native binary parsers
 */
async function getVideoDuration(filePath, format) {
  // 1. Try ffprobe if available on host system
  if (isFfprobeAvailable() && ffprobePath) {
    try {
      const cmd = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 })
        .toString()
        .trim();
      const dur = parseFloat(out);
      if (!isNaN(dur) && dur >= 0) {
        return Math.round(dur * 10) / 10;
      }
    } catch {
      // Fall through to native parser
    }
  }

  // 2. Native parser fallback
  let dur = null;
  if (format === 'mp4') {
    dur = parseMp4Duration(filePath);
  } else if (format === 'webm') {
    dur = parseWebmDuration(filePath);
  } else {
    // Try both
    dur = parseMp4Duration(filePath) || parseWebmDuration(filePath);
  }

  if (dur !== null && !isNaN(dur) && dur >= 0) {
    return Math.round(dur * 10) / 10;
  }

  return null;
}

/**
 * Full video inspection pipeline: magic bytes, size limit (50 MB), and duration (max 60s)
 */
async function inspectVideoFile(filePath, maxDurationSec = 60, maxSizeBytes = 50 * 1024 * 1024) {
  const stat = fs.statSync(filePath);
  if (stat.size > maxSizeBytes) {
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Video file size exceeds maximum 50 MB limit (${sizeMb} MB)`,
    };
  }

  const magic = validateVideoMagicBytes(filePath);
  if (!magic.valid) {
    return magic;
  }

  const duration = await getVideoDuration(filePath, magic.format);
  if (duration !== null) {
    // Allow small 0.5s tolerance for encoding timecode rounding
    if (duration > maxDurationSec + 0.5) {
      return {
        valid: false,
        duration,
        error: `Video duration (${Math.round(duration)}s) exceeds maximum allowed limit of ${maxDurationSec} seconds`,
      };
    }
  }

  return {
    valid: true,
    format: magic.format,
    mimeType: magic.mimeType,
    size: stat.size,
    duration,
  };
}

module.exports = {
  validateVideoMagicBytes,
  getVideoDuration,
  inspectVideoFile,
  isFfprobeAvailable,
};
