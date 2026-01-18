function saveOptions() {
  const apiKey = document.getElementById('apiKey').value;
  chrome.storage.sync.set({
    psiApiKey: apiKey
  }, function () {
    // Update status to let user know options were saved.
    const status = document.getElementById('status');
    status.textContent = 'API Key saved.';
    setTimeout(function () {
      status.textContent = '';
    }, 1500);
  });
}

function restoreOptions() {
  // Use default value psiApiKey = '' .
  chrome.storage.sync.get({
    psiApiKey: ''
  }, function (items) {
    document.getElementById('apiKey').value = items.psiApiKey;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);