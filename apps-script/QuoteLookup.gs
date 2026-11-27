function doGet(e) {
  const reply = value => ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
  const handle = String(e.parameter.product || '');
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(handle)) {
    return reply({error: '商品代碼格式錯誤。'});
  }
  const variant = String(e.parameter.variant || '');
  if (variant && !/^\d{1,24}$/.test(variant)) {
    return reply({error: '商品款式代碼格式錯誤。'});
  }
  const url = 'https://chiikawamarket.jp/products/' + handle + (variant ? '?variant=' + variant : '');
  try {
    const response = UrlFetchApp.fetch(url, {followRedirects: false, muteHttpExceptions: true});
    if (response.getResponseCode() !== 200) return reply({error: '商店未回傳商品頁。'});
    if (response.getContent().length > 3000000) return reply({error: '商品頁超過可讀取大小。'});
    const content = response.getContentText();
    const tags = content.match(/<title\b[^>]*>[\s\S]*?<\/title\s*>|<meta\b[^>]*>|<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script\s*>/gi) || [];
    return reply({html: tags.join('\n')});
  } catch (error) {
    return reply({error: '取價暫時失敗。'});
  }
}
