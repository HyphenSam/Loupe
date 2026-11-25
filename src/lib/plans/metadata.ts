/** What every metadata job's planner shares (Privacy, Edit metadata): which files ExifTool can write, and the
 * extension and type a result keeps. */
import { FILE_TYPES } from '../file-types'
import type { ImageInfo } from '../info'
import { EXTENSIONS } from '../names'

/** ExifTool reads these but can't write them: BMP isn't in its write list, and it reads Hasselblad's 3FR only
 * as TIFF (`%noWriteFile` in ExifTool.pm). */
const UNWRITABLE = new Set(['bmp', '3fr'])

/** The extension a metadata job's result keeps: the format's, from the bytes, or a raw file's own. */
export function extensionOf(info: ImageInfo): string {
  if (info.format !== 'raw') return EXTENSIONS[info.format]
  return info.name.match(/\.([A-Za-z0-9]+)$/)?.[1].toLowerCase() ?? info.formatName.toLowerCase()
}

export const typeOf = (extension: string) =>
  Object.entries(FILE_TYPES).find(([, extensions]) => extensions.includes(`.${extension}`))?.[0] ??
  'application/octet-stream'

/** Why ExifTool can't write this file, or null when it can. */
export const unwritable = (info: ImageInfo): string | null =>
  UNWRITABLE.has(extensionOf(info)) ? `Loupe can’t change metadata in a ${info.formatName} file.` : null
