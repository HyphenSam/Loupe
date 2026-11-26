/* jpegtran's transform as one function over memory, for Loupe (tools/jpegtran/README.md). It follows
 * jpegtran.c's main(): read the coefficients, transform them with transupp.c, write them again. No pixel is
 * decoded, so nothing is re-encoded. Errors come back as libjpeg's message instead of exiting. */
#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten.h>

#include "jpeglib.h"
#include "transupp.h"

/* `options` bits. */
#define LOUPE_PERFECT 1  /* fail unless every block survives (-perfect) */
#define LOUPE_TRIM 2     /* drop partial blocks on the moving edges (-trim) */
#define LOUPE_COPY_ALL 4 /* keep every marker (-copy all); otherwise none (-copy none) */

/* One call at a time (JavaScript is single-threaded here), so one jump and one message serve both objects. */
static jmp_buf jump;
static char message[JMSG_LENGTH_MAX];

static void on_error(j_common_ptr cinfo) {
  (*cinfo->err->format_message)(cinfo, message);
  longjmp(jump, 1);
}

/* Warnings (a corrupt but readable scan) are counted, not printed. */
static void on_output(j_common_ptr cinfo) { (void)cinfo; }

/* Returns NULL with the result in *out (free it with free()) and its length in *out_size, or the error. `crop` is
 * jpegtran's -crop spec ("WxH+X+Y"), or empty for none. `transform` is a JXFORM_CODE. */
EMSCRIPTEN_KEEPALIVE
const char *jpegtran(const unsigned char *in, unsigned long in_size, int transform, int options, const char *crop,
                     unsigned char **out, unsigned long *out_size) {
  struct jpeg_decompress_struct src;
  struct jpeg_compress_struct dst;
  struct jpeg_error_mgr src_err, dst_err;
  jpeg_transform_info info;
  JCOPY_OPTION copy = options & LOUPE_COPY_ALL ? JCOPYOPT_ALL : JCOPYOPT_NONE;
  jvirt_barray_ptr *src_coef, *dst_coef;
  unsigned char *buffer = NULL;
  unsigned long size = 0;

  *out = NULL;
  *out_size = 0;
  memset(&info, 0, sizeof(info));
  info.transform = (JXFORM_CODE)transform;
  info.perfect = options & LOUPE_PERFECT ? TRUE : FALSE;
  info.trim = options & LOUPE_TRIM ? TRUE : FALSE;
  info.force_grayscale = FALSE;
  info.crop = FALSE;
  if (crop && *crop && !jtransform_parse_crop_spec(&info, crop)) return "The crop isn't one jpegtran reads.";

  src.err = jpeg_std_error(&src_err);
  src_err.error_exit = on_error;
  src_err.output_message = on_output;
  dst.err = jpeg_std_error(&dst_err);
  dst_err.error_exit = on_error;
  dst_err.output_message = on_output;
  jpeg_create_decompress(&src);
  jpeg_create_compress(&dst);
  if (setjmp(jump)) {
    jpeg_destroy_compress(&dst);
    jpeg_destroy_decompress(&src);
    /* Not freed: once the destination has grown, `buffer` points at memory libjpeg has already freed. */
    return message;
  }

  jpeg_mem_src(&src, in, in_size);
  jcopy_markers_setup(&src, copy);
  (void)jpeg_read_header(&src, TRUE);
  if (!jtransform_request_workspace(&src, &info)) {
    jpeg_destroy_compress(&dst);
    jpeg_destroy_decompress(&src);
    return "The transformation is not perfect.";
  }
  src_coef = jpeg_read_coefficients(&src);
  jpeg_copy_critical_parameters(&src, &dst);
  dst_coef = jtransform_adjust_parameters(&src, &dst, src_coef, &info);
  /* Progressive stays progressive; Huffman tables are optimised, which changes no coefficient. */
  if (src.progressive_mode) jpeg_simple_progression(&dst);
  dst.optimize_coding = TRUE;
  jpeg_mem_dest(&dst, &buffer, &size);
  jpeg_write_coefficients(&dst, dst_coef);
  jcopy_markers_execute(&src, &dst, copy);
  jtransform_execute_transformation(&src, &dst, src_coef, &info);
  jpeg_finish_compress(&dst);
  jpeg_destroy_compress(&dst);
  (void)jpeg_finish_decompress(&src);
  jpeg_destroy_decompress(&src);

  *out = buffer;
  *out_size = size;
  return NULL;
}
