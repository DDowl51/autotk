/** 扫码落地页 HTML（纯字符串模板，无依赖）。 */

export interface LandingInput {
  app: string; // 已校验的白名单键（wda/autotk），可安全内联
  title: string;
  session: string; // hex token
  baseUrl: string; // https 源
}

export function renderLanding(i: LandingInput): string {
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>安装 ${i.title}</title>
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{margin:0;font:16px/1.6 -apple-system,system-ui,"PingFang SC",sans-serif;
       background:#0b0b0c;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  main{width:100%;max-width:420px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#9a9aa2;margin:0 0 24px;font-size:14px}
  ol{padding-left:20px;color:#c7c7cf;font-size:14px;margin:0 0 24px}
  ol li{margin:6px 0}
  .btn{display:block;width:100%;text-align:center;padding:14px;border:0;border-radius:0;
       font-size:16px;font-weight:600;cursor:pointer;margin:10px 0;text-decoration:none;
       background:#c6ff3a;color:#0b0b0c}
  .btn[disabled]{background:#2a2a2e;color:#6b6b73;cursor:not-allowed}
  #status{font-size:13px;color:#9a9aa2;text-align:center;margin-top:14px}
</style>
</head>
<body data-session="${i.session}" data-app="${i.app}" data-base="${i.baseUrl}">
<main>
  <h1>安装 ${i.title}</h1>
  <p class="sub">用 Safari 打开本页，按两步装好，全程不用电脑。</p>
  <ol>
    <li><b>第一步</b>：点下方「开始登记」，安装提示的描述文件（设置里点"允许/安装"）。</li>
    <li><b>第二步</b>：登记完成后下方按钮亮起，点它安装 ${i.title}。</li>
    <li>首次还需到「设置 → 通用 → VPN与设备管理」<b>信任开发者</b>，并开<b>开发者模式</b>。</li>
  </ol>
  <a class="btn" href="/ota/${i.app}/enroll.mobileconfig?s=${i.session}">第一步：开始登记</a>
  <button class="btn" id="install" disabled>第二步：安装 ${i.title}</button>
  <p id="status">等待登记…</p>
</main>
<script>
  var s=document.body.dataset.session, app=document.body.dataset.app, base=document.body.dataset.base;
  var statusEl=document.getElementById('status'), btn=document.getElementById('install');
  function poll(){
    fetch('/ota/'+app+'/status?s='+encodeURIComponent(s)).then(function(r){return r.json()}).then(function(j){
      if(j.state==='ready'){
        var murl=base+'/ota/'+app+'/manifest.plist?s='+encodeURIComponent(s);
        btn.onclick=function(){ location.href='itms-services://?action=download-manifest&url='+encodeURIComponent(murl) };
        btn.disabled=false; statusEl.textContent='登记完成，点上面的按钮安装'; return;
      }
      if(j.state==='pool-full'){ statusEl.textContent='暂无可用名额，请联系管理员添加账号'; return; }
      if(j.state==='processing'){ statusEl.textContent='本机已登记，但苹果正在处理中（新账号首次约需几小时~一天）。处理完成后，重新扫码打开本页即可安装。'; return; }
      if(j.state==='error'){ statusEl.textContent='登记失败：'+(j.error||'未知错误'); return; }
      statusEl.textContent='正在登记本机…'; setTimeout(poll,2000);
    }).catch(function(){ setTimeout(poll,2000) });
  }
  poll();
</script>
</body>
</html>`;
}
