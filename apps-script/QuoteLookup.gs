function doGet(e) {
  const reply = value => ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
  const store = String(e.parameter.store || 'chiikawa');

  const handle = String(e.parameter.product || '');
  const stores = {
    chiikawa: [/^[a-z0-9][a-z0-9-]{0,127}$/, id => 'https://chiikawamarket.jp/products/' + id],
    disney: [/^\d{13}$/, id => 'https://store.disney.co.jp/goods/' + id + '.html'],
    dreampocket: [/^\/c(?:\/[a-z0-9_-]+){1,8}$/i, id => 'https://www.dreampocket-webshop.jp' + id],
    graniph: [/^\/item-detail(?:\/[a-z0-9_-]+){1,4}$/i, id => 'https://www.graniph.com' + id]
  };
  if (!Object.prototype.hasOwnProperty.call(stores, store)) return reply({error: '不支援的商店。'});
  const [pattern, productUrl] = stores[store];
  if (handle.length > 220 || !pattern.test(handle)) return reply({error: '商品代碼格式錯誤。'});
  const variant = String(e.parameter.variant || '');
  if (variant && !/^\d{1,24}$/.test(variant)) {
    return reply({error: '商品款式代碼格式錯誤。'});
  }
  const url = productUrl(handle) + (store === 'chiikawa' && variant ? '?variant=' + variant : '');
  try {
    const response = UrlFetchApp.fetch(url, {followRedirects: false, muteHttpExceptions: true});
    if (response.getResponseCode() !== 200) return reply({error: '商店未回傳商品頁。'});
    if (response.getContent().length > 3000000) return reply({error: '商品頁超過可讀取大小。'});
    const content = response.getContentText();
    const tags = content.match(/<title\b[^>]*>[\s\S]*?<\/title\s*>|<meta\b[^>]*>|<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script\s*>/gi) || [];
    return reply({store, html: tags.join('\n'), prices: displayedPrices(store, content)});
  } catch (error) {
    return reply({error: '取價暫時失敗。'});
  }
}

function displayedPrices(store, html) {
  const patterns = {
    dreampocket: /class=["'][^"']*\bfs-c-productPrice__main\b[^"']*["'][\s\S]{0,650}?class=["'][^"']*\bfs-c-price__value\b[^"']*["'][^>]*>\s*(?:[¥￥]|&yen;)?\s*([0-9,]+)\s*(?:円)?\s*</gi,
    graniph: /class=["'][^"']*\bp-products-detail-option__price\b[^"']*["'][^>]*>\s*(?:[¥￥]|&yen;)?\s*([0-9,]+)\s*(?:円|[（(]税込[）)])?\s*</gi
  };
  if (!patterns[store]) return [];
  return [...new Set(Array.from(html.matchAll(patterns[store]), match => match[1])
    .filter(value => /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value))
    .map(value => Number(value.replace(/,/g, '')))
    .filter(value => Number.isSafeInteger(value) && value > 0))];
}
