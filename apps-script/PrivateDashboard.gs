// Deploy as the user accessing the web app. Require a signed-in Google account.
const YMS_ALLOWED_EMAILS = new Set([
  'yeemianselect@gmail.com',
  'chengyuweng1996@gmail.com'
]);

function doGet() {
  const visitor = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = (Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!visitor || visitor !== effective || !YMS_ALLOWED_EMAILS.has(visitor)) {
    return ymsUnavailable('請使用已獲授權的 Google 帳號登入 yms。');
  }

  const token = PropertiesService.getScriptProperties().getProperty('YMS_GITHUB_READ_TOKEN');
  if (!token) return ymsUnavailable('尚未設定 GitHub 讀取權限。');

  try {
    const response = UrlFetchApp.fetch(
      'https://api.github.com/repos/austin1997511/yms/contents/index.html?ref=main',
      {
        method: 'get',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        followRedirects: false,
        muteHttpExceptions: true
      }
    );
    if (response.getResponseCode() !== 200) {
      return ymsUnavailable('暫時讀不到私人後台。請確認 GitHub 權限。');
    }
    const html = response.getContentText('UTF-8');
    if (!/^\s*<!doctype html>/i.test(html)) return ymsUnavailable('後台檔案格式有誤。');
    return HtmlService.createHtmlOutput(html).setTitle('yms 私人後台');
  } catch (_) {
    return ymsUnavailable('暫時無法載入私人後台，請稍後重試。');
  }
}

function ymsUnavailable(message) {
  return HtmlService.createHtmlOutput('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>yms</title><p>' + message + '</p></html>').setTitle('yms 私人後台');
}
