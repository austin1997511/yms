const quoteCatalog={"www.daytona-park.com":"/item/[0-9]+","zozo.jp":"/shop/[a-z0-9_-]+/goods(?:-sale)?/[0-9]+","converse-tokyo.jp":"/item/[a-z0-9_/-]+","www.isseymiyake.com":"(?:/ja|/en)?/products/[a-z0-9_-]+","www.viviennewestwood-tokyo.com":"/(?:f/dsg|item)/[a-z0-9_.-]+","wtaps.com":"/(?:products|collections/[a-z0-9_-]+/products)/[a-z0-9_-]+","kithtokyo.com":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","windandsea.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","shop-jp.doverstreetmarket.com":"(?:/en|/ja)?/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","www.pokemoncenter-online.com":"/(?:item/)?[0-9]{8,14}\\.html","www.donguri-sora.com":"/(?:category/[a-z0-9_-]+|item)/[a-z0-9_-]+\\.html","www.palcloset.jp":"/display/item/[a-z0-9_-]+","shop.sanrio.co.jp":"/(?:item/detail|products)/[a-z0-9_-]+","www.ec-store.net":"/sws/g/g[a-z0-9_-]+","www.felissimo.co.jp":"/(?:youmore/)?[0-9]{6}\\.html","camshop.jp":"/products/[a-z0-9_-]+","www.beams.co.jp":"/item/[a-z0-9_-]+/[a-z0-9_-]+/[0-9]+","goldy.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","clesste.com":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","www.neweracap.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","www.plazastyle.com":"/(?:ec/)?(?:item|products)/[a-z0-9_./-]+","www.seesee.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","store.goslowcaravan.com":"/(?:c/[a-z0-9_-]+/)*[a-z0-9_-]+/[a-z0-9_-]+","www.maryquant.co.jp":"/(?:products|item)/[a-z0-9_-]+"};

function catalogUrl(handle) {
  const parts=handle.match(/^([a-z0-9.-]+)(\/[A-Za-z0-9_./-]+)$/);
  if(!parts||parts[2].split('/').some(segment=>segment==='.'||segment==='..'))return null;
  const [,host,path]=parts;
  if(!Object.prototype.hasOwnProperty.call(quoteCatalog,host))return null;
  return new RegExp('^(?:'+quoteCatalog[host]+')$','i').test(path)?'https://'+host+path:null;
}

function doGet(e) {
  const reply = value => ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
  const store = String(e.parameter.store || 'chiikawa');

  const handle = String(e.parameter.product || '');
  const stores = {
    chiikawa: [/^[a-z0-9][a-z0-9-]{0,127}$/, id => 'https://chiikawamarket.jp/products/' + id],
    disney: [/^\d{13}$/, id => 'https://store.disney.co.jp/goods/' + id + '.html'],
    dreampocket: [/^\/c(?:\/[a-z0-9_-]+){1,8}$/i, id => 'https://www.dreampocket-webshop.jp' + id],
    catalog: [/^.+$/, catalogUrl],
    graniph: [/^\/item-detail(?:\/[a-z0-9_-]+){1,4}$/i, id => 'https://www.graniph.com' + id]
  };
  if (!Object.prototype.hasOwnProperty.call(stores, store)) return reply({error: '不支援的商店。'});
  const [pattern, productUrl] = stores[store];
  if (handle.length > 220 || !pattern.test(handle)) return reply({error: '商品代碼格式錯誤。'});
  const variant = String(e.parameter.variant || '');
  if (variant && !/^\d{1,24}$/.test(variant)) {
    return reply({error: '商品款式代碼格式錯誤。'});
  }
  const base = productUrl(handle);
  if (!base) return reply({error: '請貼上支援商店的商品詳細頁。'});
  const url = base + (store === 'chiikawa' && variant ? '?variant=' + variant : '');
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

