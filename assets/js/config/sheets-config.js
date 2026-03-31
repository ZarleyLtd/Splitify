(function (global) {
  global.SPLITIFY_CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbxQ484qyGz_PpiiAiECD9LFzZwNWCJar9-5JjSHdmqYjtCf4B2XbX6INGju9uuz-vih/exec'
  };
})(typeof window !== 'undefined' ? window : this);

var SPLITIFY_PUBLISHED_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQuoARrfq8AB9ntNW845pGKRwvJG8Ge_F_yynlULXZtt4Xg10fCKxgoA_K4kljg-S79Z4S3SdO4fu9N/pub';

var SPLITIFY_SHEET_GIDS = {
  Bills:    '1401637191',
  Claims:   '1135443068',
  BillMeta: '1501722460',
  Config:   '0'
};

var SheetsConfig = {
  getSheetUrl: function (name) {
    var gid = SPLITIFY_SHEET_GIDS[name];
    if (gid == null) return null;
    return SPLITIFY_PUBLISHED_BASE + '?output=csv&gid=' + gid;
  }
};
