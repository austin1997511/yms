const quoteCatalog={"sanko-bazaar.jp":"/ap/item/i/[a-zA-Z0-9]+","www.daytona-park.com":"/item/[0-9]+","zozo.jp":"/shop/[a-z0-9_-]+/goods(?:-sale)?/[0-9]+","converse-tokyo.jp":"/item/[a-z0-9_/-]+","www.isseymiyake.com":"(?:/ja|/en)?/products/[a-z0-9_-]+","www.viviennewestwood-tokyo.com":"/(?:f/dsg|item)/[a-z0-9_.-]+","wtaps.com":"/(?:products|collections/[a-z0-9_-]+/products)/[a-z0-9_-]+","kithtokyo.com":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","windandsea.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","shop-jp.doverstreetmarket.com":"(?:/en|/ja)?/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","www.pokemoncenter-online.com":"/(?:item/)?[0-9]{8,14}\\.html","www.donguri-sora.com":"/(?:category/[a-z0-9_-]+|item)/[a-z0-9_-]+\\.html","www.palcloset.jp":"/display/item/[a-z0-9_-]+","shop.sanrio.co.jp":"/(?:item/detail|products)/[a-z0-9_-]+","www.ec-store.net":"/sws/g/g[a-z0-9_-]+","www.felissimo.co.jp":"/(?:youmore/)?[0-9]{6}\\.html","camshop.jp":"/products/[a-z0-9_-]+","www.beams.co.jp":"/item/[a-z0-9_-]+/[a-z0-9_-]+/[0-9]+","goldy.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","clesste.com":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","www.neweracap.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","www.plazastyle.com":"/(?:ec/)?(?:item|products)/[a-z0-9_./-]+","www.seesee.jp":"/(?:collections/[a-z0-9_-]+/)?products/[a-z0-9_-]+","store.goslowcaravan.com":"/(?:c/[a-z0-9_-]+/)*[a-z0-9_-]+/[a-z0-9_-]+","www.maryquant.co.jp":"/(?:products|item)/[a-z0-9_-]+"};

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
  const color = String(e.parameter.colvar || '');
  if (color && (!base.startsWith('https://sanko-bazaar.jp/ap/item/i/') || !/^[a-zA-Z0-9]{1,12}$/.test(color))) return reply({error:'顏色款式代碼格式錯誤。'});
  const url = base + (color ? '?colvar=' + color : store === 'chiikawa' && variant ? '?variant=' + variant : '');
  try {
    const response = fetchShopPage(url, store);
    const status = response.getResponseCode();
    if(status!==200){
      const message=status===404||status===410?'商品頁已找不到，請核對網址或換一個仍在銷售的商品。'
        :status===403||status===429?'商店拒絕或限制自動取價。'
        :[301,302,303,307,308].includes(status)?'商店轉址到其他位置，請先開啟商品頁，再複製最終商品網址。'
        :'商店未回傳可讀取的商品頁。';
      return reply({error:message+'（HTTP '+status+'）',status});
    }
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


function fetchShopPage(url, store) {
  const options={followRedirects:false,muteHttpExceptions:true};
  let response=UrlFetchApp.fetch(url,options);
  if(store!=='catalog'||url.includes('?colvar='))return response;
  const origin=url.match(/^https:\/\/[a-z0-9.-]+/)?.[0];
  const seen=new Set([url]);
  for(let i=0;i<2&&[301,302,303,307,308].includes(response.getResponseCode());i++){
    const headers=response.getAllHeaders();
    const raw=headers.Location??headers.location;
    if(typeof raw!=='string'||!origin)break;
    const path=raw.startsWith(origin+'/')?raw.slice(origin.length):raw;
    if(!path.startsWith('/')||path.startsWith('//'))break;
    const next=catalogUrl(origin.slice(8)+path.replace(/\/$/,''));
    if(!next||seen.has(next))break;
    seen.add(next);
    response=UrlFetchApp.fetch(next,options);
  }
  return response;
}
