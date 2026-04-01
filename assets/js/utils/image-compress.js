/**
 * Client-side bill image compression for upload and storage.
 * Resizes to max dimension (default 1200px) and re-encodes as JPEG for smaller file size.
 */

(function (global) {
  var MAX_WIDTH = 1200;
  var JPEG_QUALITY = 0.8;

  /**
   * Compress an image file for bill upload (mobile-friendly size).
   * @param {File} file - Image file from input or camera
   * @param {Object} options - Optional: { maxWidth: number, quality: number }
   * @returns {Promise<{ base64: string, mimeType: string }>}
   */
  function compressBillImage(file, options) {
    var maxWidth = (options && options.maxWidth) || MAX_WIDTH;
    var quality = (options && options.quality) != null ? options.quality : JPEG_QUALITY;

    return readFileAsDataUrl(file)
      .then(function (dataUrl) { return drawResizedAndExport(dataUrl, maxWidth, quality); });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  function drawResizedAndExport(dataUrl, maxWidth, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        var scale = w > h
          ? Math.min(1, maxWidth / w)
          : Math.min(1, maxWidth / h);
        var cw = Math.round(w * scale);
        var ch = Math.round(h * scale);

        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);

        canvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            blobToBase64(blob).then(function (base64) {
              resolve({ base64: base64, mimeType: 'image/jpeg' });
            }).catch(reject);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = function () { reject(new Error('Invalid image')); };
      img.src = dataUrl;
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
        resolve(match ? match[1] : '');
      };
      reader.onerror = function () { reject(new Error('Failed to read blob')); };
      reader.readAsDataURL(blob);
    });
  }

  global.SplitifyImageCompress = {
    compressBillImage: compressBillImage
  };
})(typeof window !== 'undefined' ? window : this);
