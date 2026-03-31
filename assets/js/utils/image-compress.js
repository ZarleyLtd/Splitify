(function (global) {
  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var m = String(reader.result || '').match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return reject(new Error('Invalid image file'));
        resolve({ mimeType: m[1], base64: m[2] });
      };
      reader.onerror = function () { reject(new Error('Failed to read image')); };
      reader.readAsDataURL(file);
    });
  }

  global.SplitifyImageCompress = {
    compressBillImage: function (file) {
      // Keep simple and robust; backend accepts base64 directly.
      return readAsDataUrl(file);
    }
  };
})(typeof window !== 'undefined' ? window : this);
