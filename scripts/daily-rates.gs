// ===== SETTINGS =====
const EMAIL = 'radsbrewery@gmail.com';
const CURRENCIES = ['EUR', 'NOK', 'CHF', 'USD'];
const SKIP_IF_NO_NEW_RATE = true; // don't send on weekends/holidays
const SEND_HOUR = 13;             // NBP publishes table A at ~11:45–12:15 Warsaw time
const CITIES = [
  { name: 'Szczecin', lat: 53.4285, lon: 14.5528, tz: 'Europe/Warsaw' },
  { name: 'Tromsø',   lat: 69.6496, lon: 18.9560, tz: 'Europe/Oslo' },
];
// Gemini key (optional): Project Settings → Script properties → add GEMINI_KEY
// ====================

function sendDailyRates() {
  // --- Exchange rates: NBP table A, the two most recent publications ---
  const rates = getRates();
  const todayStr = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd');
  if (SKIP_IF_NO_NEW_RATE && rates.today !== todayStr) return;

  const rows = CURRENCIES.map(c => {
    const now = rates.now[c];
    const before = rates.before[c];
    const pct = (now - before) / before * 100;
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '•';
    const sign = pct > 0 ? '+' : '';
    return { c, now, arrow, change: `${sign}${pct.toFixed(2)}%`, pct };
  });

  // --- Weather ---
  const forecasts = CITIES.map(city => {
    try {
      return { city, days: getForecast(city) };
    } catch (e) {
      return { city, days: null };
    }
  });

  // --- World summary ---
  const summary = getWorldSummary();

  const text =
    `Rates for ${rates.today} (change vs ${rates.prev}):\n\n` +
    rows.map(r => `${r.c}/PLN: ${r.now.toFixed(4)}  ${r.arrow} ${r.change}`).join('\n') +
    '\n\n' + forecasts.map(forecastText).join('\n') +
    `\n\n🌍 ${summary}`;

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">' +
    `<h3 style="margin:0 0 8px">Rates for ${rates.today} ` +
    `<span style="font-weight:normal;color:#777">(vs ${rates.prev}, NBP)</span></h3>` +
    '<table cellpadding="4" style="border-collapse:collapse">' +
    rows.map(r => {
      const color = r.pct > 0 ? '#2e7d32' : r.pct < 0 ? '#c62828' : '#777';
      return `<tr><td><b>${r.c}</b>/PLN</td><td style="text-align:right">${r.now.toFixed(4)}</td>` +
        `<td style="color:${color};text-align:right">${r.arrow} ${r.change}</td></tr>`;
    }).join('') +
    '</table>' +
    '<h3 style="margin:24px 0 8px">7-day forecast</h3>' +
    forecastChartHtml(forecasts) +
    `<p style="margin-top:24px">🌍 ${esc(summary)}</p>` +
    '</div>';

  MailApp.sendEmail(EMAIL, `EUR/NOK/CHF/USD → PLN – ${rates.today}`, text, { htmlBody: html });
}

// Run once by hand to (re)create the daily trigger at SEND_HOUR Warsaw time.
function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendDailyRates')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendDailyRates')
    .timeBased().everyDays(1).atHour(SEND_HOUR).inTimezone('Europe/Warsaw')
    .create();
}

// NBP mid rates are already "PLN per 1 unit", so no inversion is needed.
function getRates() {
  const res = UrlFetchApp.fetch('https://api.nbp.pl/api/exchangerates/tables/A/last/2/?format=json');
  const [prev, today] = JSON.parse(res.getContentText())
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const mid = t => Object.fromEntries(t.rates.map(r => [r.code, r.mid]));
  return { today: today.effectiveDate, prev: prev.effectiveDate, now: mid(today), before: mid(prev) };
}

function getForecast(city) {
  const url = 'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${city.lat}&longitude=${city.lon}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
    `&timezone=${encodeURIComponent(city.tz)}&forecast_days=7`;
  const d = JSON.parse(UrlFetchApp.fetch(url).getContentText()).daily;
  return d.time.map((date, i) => ({
    date,
    code: d.weather_code[i],
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i],
  }));
}

// WMO weather codes → emoji
function weatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

function dayLabel(date) {
  return Utilities.formatDate(new Date(date + 'T12:00:00Z'), 'UTC', 'EEE d');
}

function forecastText(f) {
  if (!f.days) return `${f.city.name}: forecast unavailable`;
  return `${f.city.name}: ` +
    f.days.map(d => `${dayLabel(d.date)} ${Math.round(d.max)}/${Math.round(d.min)}°`).join(', ');
}

// Min–max temperature bars built from table cells, so Gmail shows them without loading images.
// Both cities share one scale, so the bars are directly comparable.
function forecastChartHtml(forecasts) {
  const all = forecasts.filter(f => f.days).flatMap(f => f.days);
  if (!all.length) return '<p>Forecast unavailable.</p>';

  const lo = Math.floor(Math.min(...all.map(d => d.min)) / 5) * 5;
  let hi = Math.ceil(Math.max(...all.map(d => d.max)) / 5) * 5;
  if (hi === lo) hi = lo + 5;
  const W = 220;
  const px = t => Math.round((t - lo) / (hi - lo) * W);
  const barColor = t => t < 0 ? '#4a90d9' : t < 10 ? '#7cb9e8' : t < 20 ? '#f2b134' : '#e8590c';
  const cell = (w, bg) => w > 0
    ? `<td style="width:${w}px;height:12px;background:${bg};font-size:0;line-height:0;padding:0">&nbsp;</td>`
    : '';

  return forecasts.map(f => {
    if (!f.days) return `<p><b>${esc(f.city.name)}</b>: forecast unavailable</p>`;
    const rows = f.days.map(d => {
      const left = px(d.min);
      const bar = Math.max(px(d.max) - left, 3);
      const right = Math.max(W - left - bar, 0);
      const rain = d.rain > 0 ? `💧 ${d.rain.toFixed(1)} mm` : '';
      return '<tr>' +
        `<td style="white-space:nowrap;color:#555">${dayLabel(d.date)}</td>` +
        `<td>${weatherIcon(d.code)}</td>` +
        `<td style="text-align:right;color:#4a90d9">${Math.round(d.min)}°</td>` +
        `<td style="padding:0 4px"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:${W}px;background:#eee"><tr>` +
        cell(left, '#eee') + cell(bar, barColor(d.max)) + cell(right, '#eee') +
        '</tr></table></td>' +
        `<td style="color:#e8590c"><b>${Math.round(d.max)}°</b></td>` +
        `<td style="white-space:nowrap;color:#1e6fb8;font-size:12px">${rain}</td>` +
        '</tr>';
    }).join('');
    return `<p style="margin:12px 0 4px"><b>${esc(f.city.name)}</b></p>` +
      '<table cellpadding="3" style="border-collapse:collapse">' +
      '<tr style="font-size:11px;color:#999"><td></td><td></td><td></td>' +
      `<td style="padding:0 4px"><span style="float:left">${lo}°</span><span style="float:right">${hi}°</span></td>` +
      '<td></td><td></td></tr>' +
      rows + '</table>';
  }).join('');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getWorldSummary() {
  let items = [];
  try {
    const xml = UrlFetchApp.fetch('https://feeds.bbci.co.uk/news/world/rss.xml').getContentText();
    items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item')
      .slice(0, 10)
      .map(i => ({ title: i.getChildText('title'), desc: i.getChildText('description') }));
  } catch (e) {
    return 'News unavailable today.';
  }

  const geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (geminiKey) {
    try {
      const prompt = 'Summarize what is happening in the world today in ONE short sentence, ' +
        'based on these headlines:\n' + items.map(i => '- ' + i.title).join('\n');
      const res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-goog-api-key': geminiKey },
          payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      return JSON.parse(res.getContentText()).candidates[0].content.parts[0].text.trim();
    } catch (e) {
      // fall through to plain headline
    }
  }
  return `${items[0].title} – ${items[0].desc}`;
}
