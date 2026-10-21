/* 成大 EMBA 學分追蹤 — 個人資料 + 匯出（PDF／Excel）
   依賴：data.js、core.js（Tracker）、index.html 的 toast / closeAll，
         html2pdf.js 與 SheetJS（皆由 index.html 以 <script defer> 載入）。
   內容原則：匯出檔「只放事實」——姓名、學號、勾選的課與學分、純加總，
            不放任何比較、判斷或結論字眼。 */

(function () {
  const PF_KEY = 'emba_credits_profile_v1';
  const DISCLAIMER = '本表由同學自行勾選填報，僅供系辦核對參考，非正式成績證明。';
  const PDF_FONT = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

  const $ = s => document.querySelector(s);
  const pad = n => String(n).padStart(2, '0');
  const fmt = n => String(Math.round(n * 100) / 100);          // 去掉浮點誤差
  const safeName = s => String(s).replace(/[\\/:*?"<>|\s]+/g, '');

  // 提示：沿用頁面 toast，但可自訂停留時間（長訊息要讀得完）
  function notify(msg, ms) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._); t._ = setTimeout(() => t.classList.remove('on'), ms || 2600);
  }

  // ---------- 個人資料（獨立 key，不影響學分紀錄與備份代碼）----------
  function readProfile() {
    try {
      const o = JSON.parse(localStorage.getItem(PF_KEY) || '{}');
      return { name: String(o.name || '').trim(), sid: String(o.sid || '').trim().toUpperCase() };
    } catch (e) { return { name: '', sid: '' }; }
  }
  function saveProfile() {
    const p = { name: $('#pfName').value.trim(), sid: $('#pfSid').value.trim().toUpperCase() };
    try { localStorage.setItem(PF_KEY, JSON.stringify(p)); } catch (e) { /* 無痕或被擋：略過，欄位仍可用於本次匯出 */ }
    return p;
  }
  function initProfile() {
    const nameEl = $('#pfName'), sidEl = $('#pfSid');
    const p = readProfile();
    nameEl.value = p.name; sidEl.value = p.sid;
    nameEl.addEventListener('input', saveProfile);
    sidEl.addEventListener('input', () => {
      const up = sidEl.value.toUpperCase();
      if (up !== sidEl.value) {                                  // 即時轉大寫，並保留游標位置
        const pos = sidEl.selectionStart;
        sidEl.value = up;
        try { sidEl.setSelectionRange(pos, pos); } catch (e) { /* 部分瀏覽器不支援 */ }
      }
      saveProfile();
    });
    [nameEl, sidEl].forEach(el => el.addEventListener('blur', () => { el.value = el.value.trim(); saveProfile(); }));
  }

  // ---------- 取得要匯出的資料（只含已勾選）----------
  function stamp() {
    const d = new Date();
    const ymd = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    return {
      file: ymd + '-' + pad(d.getHours()) + pad(d.getMinutes()),
      human: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
    };
  }
  function buildSheet() {
    const r = Tracker.compute();
    const groups = [];
    let count = 0, total = 0;
    CATEGORIES.forEach(cat => {
      const rows = r.byCat[cat.key].courses
        .filter(c => Tracker.isDone(c.id))
        .map(c => ({ n: c.n, k: c.k }));
      if (!rows.length) return;
      const sub = rows.reduce((a, x) => a + x.k, 0);
      groups.push({ label: cat.activity ? '其他／活動學分' : cat.key, rows, sub });
      count += rows.length; total += sub;
    });
    const p = readProfile(), t = stamp();
    return { name: p.name, sid: p.sid, stamp: t, groups, count, total };
  }
  function baseFilename(s) {
    return '學分單_' + safeName(s.name) + '_' + safeName(s.sid) + '_' + s.stamp.file;
  }

  // ---------- PDF ----------
  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  // 版面用 div（display:flex）而不是 <table>：html2pdf 的分頁避讓是在元素前插墊高 div，
  // 對 <tr> 無效（實測表格列會被切、內容掉頁），div 列才能真的整列不被切半。
  function buildPdfRoot(s) {
    const root = el('div', 'font-family:' + PDF_FONT + ';color:#111;background:#fff;font-size:13px;line-height:1.5');
    root.appendChild(el('div', 'font-size:22px;font-weight:700;margin-bottom:12px', '成大 EMBA 學分單'));

    const meta = el('div', 'margin-bottom:16px');
    [['姓名', s.name], ['學號', s.sid], ['產出時間', s.stamp.human]].forEach(([k, v]) => {
      const line = el('div', 'display:flex;padding:2px 0');
      line.appendChild(el('div', 'flex:0 0 76px;color:#555', k));
      line.appendChild(el('div', 'flex:1;font-weight:700', v));
      meta.appendChild(line);
    });
    root.appendChild(meta);

    const AVOID = 'page-break-inside:avoid;break-inside:avoid;';
    const cell = 'padding:7px 8px;';
    const list = el('div');
    // 每列固定三欄：類別 / 課名 / 學分（cls = html2pdf 的 avoid 選取用）
    const addRow = (c1, c2, c3, extra) => {
      const row = el('div', AVOID + 'display:flex;border-bottom:1px solid #ddd;' + (extra || ''));
      row.className = 'xrow';
      row.appendChild(el('div', cell + 'flex:0 0 24%', c1));
      row.appendChild(el('div', cell + 'flex:1;min-width:0;word-break:break-all', c2));
      row.appendChild(el('div', cell + 'flex:0 0 14%;text-align:right;font-variant-numeric:tabular-nums', c3));
      list.appendChild(row);
    };
    addRow('類別', '課名', '學分', 'background:#eee;font-weight:700;border-bottom:2px solid #999');
    s.groups.forEach(g => {
      g.rows.forEach(x => addRow(g.label, x.n, fmt(x.k)));
      addRow('', g.label + ' 已勾選學分小計', fmt(g.sub), 'background:#f6f6f6;font-weight:700');
    });
    addRow('', '已勾選學分合計', fmt(s.total), 'background:#e8e8e8;font-weight:700');
    root.appendChild(list);

    const foot = el('div', AVOID + 'margin-top:18px;font-size:11px;color:#555', DISCLAIMER);
    foot.className = 'xrow';
    root.appendChild(foot);
    return root;
  }
  function makePdf(s, filename) {
    const root = buildPdfRoot(s);
    // 放進頁面（螢幕外）讓 html2canvas 能量到版面；輸出完立刻移除
    const holder = el('div', 'position:fixed;left:-10000px;top:0;width:186mm;background:#fff');
    holder.appendChild(root);
    document.body.appendChild(holder);
    const opt = {
      margin: [12, 12, 16, 12],                                   // mm：上 左 下 右（下方留白放頁碼）
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.xrow'] },
    };
    return window.html2pdf().set(opt).from(root).toPdf().get('pdf').then(pdf => {
      const n = pdf.internal.getNumberOfPages(), w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(9); pdf.setTextColor(120);
      for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.text(i + ' / ' + n, w / 2, h - 8, { align: 'center' }); }  // 內建字型，只放阿拉伯數字
    }).save().then(
      () => holder.remove(),
      e => { holder.remove(); throw e; }
    );
  }

  // ---------- Excel（單一工作表「學分單」）----------
  function makeXlsx(s) {
    const aoa = [
      ['成大 EMBA 學分單'],
      ['姓名', s.name],
      ['學號', s.sid],
      ['產出時間', s.stamp.human],
      [],
      ['類別', '課名', '學分'],
    ];
    s.groups.forEach(g => {
      g.rows.forEach(x => aoa.push([g.label, x.n, x.k]));
      aoa.push(['', g.label + ' 已勾選學分小計', g.sub]);
    });
    aoa.push(['', '已勾選學分合計', s.total]);
    aoa.push([]);
    aoa.push([DISCLAIMER]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 46 }, { wch: 8 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },                   // 標題
      { s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 2 } },  // 頁尾聲明
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '學分單');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ---------- 上傳給系辦 ----------
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
      fr.onerror = () => reject(fr.error || new Error('讀取檔案失敗'));
      fr.readAsDataURL(blob);
    });
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // 回傳 { preview: true|false }；失敗時 throw（由呼叫端顯示提示）
  async function uploadToOffice(blob, filename) {
    const UPLOAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwqsGGdhyUJcRYjYLwqZib-xpRaiKFmx9AVvFvGDk6HKJEFvIXlJjUSti_4ixHb5G714Q/exec';   // 學分追蹤-上傳後端（E118 帳號 Apps Script）；空字串 = 預覽版
    if (!UPLOAD_ENDPOINT) {
      // 預覽版：不真的上傳，直接下載系辦會收到的 Excel 供檢視
      downloadBlob(blob, filename);
      notify('預覽版：尚未真正上傳，已下載系辦會收到的 Excel 檔供檢視', 4500);
      return { preview: true };
    }
    const p = readProfile();
    // 上傳碼：同一份檔案重送時後端認得出來，不會重複建檔
    const uploadId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    const res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // text/plain：避免 CORS preflight（Apps Script 不處理 OPTIONS）
      body: JSON.stringify({ uploadId, name: p.name, sid: p.sid, file: await blobToBase64(blob) }),
    });
    if (!res.ok) throw new Error('伺服器回應 ' + res.status);
    let data = null;
    try { data = await res.json(); } catch (e) { /* 讀不到 JSON 就不能確定有存進去 */ }
    if (!data || data.ok !== true) throw new Error((data && data.error) || '無法確認系辦端是否收到，請稍後再試');
    return { preview: false };
  }
  window.uploadToOffice = uploadToOffice;

  // ---------- 匯出流程 ----------
  function showErr(msg) { const e = $('#exErr'); e.textContent = msg; e.hidden = !msg; }
  function openExport() {
    const p = readProfile();
    if (!p.name || !p.sid) {
      const target = !p.name ? $('#pfName') : $('#pfSid');
      notify('請先填寫姓名與學號，才能匯出學分單', 2800);
      target.focus();
      return;
    }
    const s = buildSheet();
    if (!s.count) { notify('還沒勾選任何課程，請先勾選修過的課', 2800); return; }
    $('#exSumName').textContent = s.name;
    $('#exSumSid').textContent = s.sid;
    $('#exSumCount').textContent = s.count + ' 門';
    $('#exSumCr').textContent = fmt(s.total) + ' 學分';
    $('#exUp').checked = false;                                   // 每次預設不勾
    showErr('');
    $('#scrimE').classList.add('on');
  }
  async function doExport() {
    const goBtn = $('#exGo'), cancelBtn = $('#exCancel');
    const wantUpload = $('#exUp').checked;
    showErr('');
    // 先確認函式庫都載入了，免得做一半才失敗
    if (typeof window.html2pdf !== 'function') {
      return showErr('PDF 元件載入失敗，請確認網路連線後重新整理頁面再試。');
    }
    if (wantUpload && typeof window.XLSX === 'undefined') {
      return showErr('Excel 元件載入失敗，請確認網路連線後重新整理頁面再試（或先取消勾選「同步上傳」只匯出 PDF）。');
    }
    const s = buildSheet();
    if (!s.name || !s.sid || !s.count) { closeAll(); return openExport(); }  // 資料在彈窗開著時被改過：重新檢查
    const base = baseFilename(s);
    goBtn.disabled = cancelBtn.disabled = true; goBtn.textContent = '產生中…';
    let pdfDone = false;
    try {
      await makePdf(s, base + '.pdf');
      pdfDone = true;
      let preview = false;
      if (wantUpload) preview = (await uploadToOffice(makeXlsx(s), base + '.xlsx')).preview;
      closeAll();
      if (!wantUpload) notify('已匯出 PDF ✓', 2200);
      else if (!preview) notify('已匯出 PDF，並上傳到系辦 ✓', 3000);
      // 預覽版的提示已在 uploadToOffice 內顯示
    } catch (e) {
      console.error(e);
      showErr(pdfDone ? 'PDF 已匯出，但上傳到系辦失敗，請稍後再試一次。（' + (e.message || e) + '）'
                      : '產生 PDF 時發生問題，請重新整理頁面再試一次。');
    } finally {
      goBtn.disabled = cancelBtn.disabled = false; goBtn.textContent = '匯出';
    }
  }

  initProfile();
  $('#exBtn').addEventListener('click', openExport);
  $('#exGo').addEventListener('click', doExport);
})();
