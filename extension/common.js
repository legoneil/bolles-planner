// Shared by the Schoology page script and the background worker: turn a
// parsed grades page into what's saved in chrome.storage.

function gradesResult(data, layout, url, domain) {
  if (!data.courses.length) {
    return {
      status: { ok: false, at: Date.now(), message: 'Couldn’t find any courses on the grades page.' },
      layout,
    };
  }
  const withPercent = data.courses.filter((c) => c.percent !== null).length;
  return {
    grades: { ...data, url, domain },
    status: { ok: true, at: Date.now(), message: `Read ${data.courses.length} courses${withPercent ? ` (${withPercent} with percentages)` : ''}.` },
    // Grade-free outline, kept so "Copy debug info" works even when reading succeeds.
    layout,
  };
}
