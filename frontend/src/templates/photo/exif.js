// Minimal JPEG EXIF reader: returns the camera's capture time ("YYYY:MM:DD HH:MM:SS", camera local time) or null
export async function exifDateTaken(file) {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off + 4 <= v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null; // bad data or start of image data
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10); // "Exif"
      off += 2 + v.getUint16(off + 2);
    }
  } catch { /* truncated or malformed EXIF */ }
  return null;
}

function readTiff(v, start) {
  const le = v.getUint16(start) === 0x4949; // "II" = little-endian
  const u16 = (o) => v.getUint16(start + o, le);
  const u32 = (o) => v.getUint32(start + o, le);
  const find = (ifd, tag) => {
    for (let i = 0, n = u16(ifd); i < n; i++) if (u16(ifd + 2 + i * 12) === tag) return ifd + 2 + i * 12;
    return null;
  };
  const ascii = (entry) => {
    const count = u32(entry + 4);
    const at = count > 4 ? u32(entry + 8) : entry + 8;
    let s = "";
    for (let i = 0; i < count - 1; i++) s += String.fromCharCode(v.getUint8(start + at + i));
    return s;
  };
  const ifd0 = u32(4);
  const exifIfd = find(ifd0, 0x8769);
  const original = exifIfd && find(u32(exifIfd + 8), 0x9003); // DateTimeOriginal
  if (original) return ascii(original);
  const modified = find(ifd0, 0x0132); // DateTime
  return modified ? ascii(modified) : null;
}
