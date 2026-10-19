chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'parse') return;
  const doc = new DOMParser().parseFromString(msg.html, 'text/html');
  const loginPage = Boolean(doc.querySelector('input[type="password"]')) && !doc.querySelector('.gradebook-course');
  reply({ data: BollesGrades.parseGrades(doc), layout: BollesGrades.describeLayout(doc), loginPage });
});
