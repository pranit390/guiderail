// Thin on purpose (ADR 0004): open the side panel, ask for the mic once, tell the panel about tab changes.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.runtime.sendMessage({ kind: "tab_changed", tabId }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.active) {
    chrome.runtime.sendMessage({ kind: "tab_changed", tabId, url: tab.url }).catch(() => {});
  }
});
