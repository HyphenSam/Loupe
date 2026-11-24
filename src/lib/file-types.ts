/** What Loupe opens (SPEC.md section 3), by MIME type: the manifest's file handlers and the file input's
 * `accept` both come from here. Raw MIME types aren't standard; these are the ones systems use. */
export const FILE_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg', '.jpe', '.jfif'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/avif': ['.avif'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif', '.hif'],
  'image/jxl': ['.jxl'],
  'image/gif': ['.gif'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tif', '.tiff'],
  'image/x-adobe-dng': ['.dng'],
  'image/x-canon-cr2': ['.cr2'],
  'image/x-canon-cr3': ['.cr3'],
  'image/x-canon-crw': ['.crw'],
  'image/x-nikon-nef': ['.nef'],
  'image/x-nikon-nrw': ['.nrw'],
  'image/x-sony-arw': ['.arw'],
  'image/x-sony-sr2': ['.sr2'],
  'image/x-fuji-raf': ['.raf'],
  'image/x-olympus-orf': ['.orf'],
  'image/x-panasonic-rw2': ['.rw2'],
  'image/x-pentax-pef': ['.pef'],
  'image/x-samsung-srw': ['.srw'],
  'image/x-hasselblad-3fr': ['.3fr'],
  'image/x-phaseone-iiq': ['.iiq'],
  'image/x-sigma-x3f': ['.x3f'],
}

/** The file input's `accept`: the MIME types and the extensions, since pickers match either. Dropped
 * files are tried whatever they're called, because extensions lie. */
export const ACCEPT = [...Object.keys(FILE_TYPES), ...Object.values(FILE_TYPES).flat()].join(',')
