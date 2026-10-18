export {};

const openButton = document.querySelector<HTMLButtonElement>("#open")!;
const openResult = document.querySelector<HTMLElement>("#open-result")!;
const shortcut = document.querySelector<HTMLElement>("#shortcut")!;
const shortcutHelp = document.querySelector<HTMLElement>("#shortcut-help")!;
const copyResult = document.querySelector<HTMLElement>("#copy-result")!;
let windowId: number | undefined;

// Resolve the window before the click so open() runs directly in the user gesture.
chrome.windows.getCurrent().then((window) => {
  if (window.id === undefined) throw new Error("No current Chrome window");
  windowId = window.id;
  openButton.disabled = false;
}).catch(() => {
  openResult.textContent = "Could not find this Chrome window. Reload this page or use GuideRail’s toolbar icon.";
});

openButton.addEventListener("click", () => {
  if (windowId === undefined) return;
  chrome.sidePanel.open({ windowId }).then(() => {
    openResult.textContent = "GuideRail is open. Open a Google page to get started.";
  }).catch(() => {
    openResult.textContent = "Could not open GuideRail. Try this button again or use its toolbar icon.";
  });
});

function refreshShortcut() {
  chrome.commands.getAll().then((commands) => {
    const assigned = commands.find((command) => command.name === "_execute_action")?.shortcut;
    shortcut.textContent = assigned ? `Your keyboard shortcut: ${assigned}` : "Keyboard shortcut: not set.";
    shortcutHelp.hidden = Boolean(assigned);
  }).catch(() => {
    shortcut.textContent = "Could not read your keyboard shortcut. Check Chrome’s shortcut settings.";
    shortcutHelp.hidden = false;
  });
}
refreshShortcut();
window.addEventListener("focus", refreshShortcut);

document.querySelector("#copy-shortcuts")!.addEventListener("click", () => {
  navigator.clipboard.writeText("chrome://extensions/shortcuts").then(() => {
    copyResult.textContent = "Copied. Paste the address into Chrome’s address bar.";
  }).catch(() => {
    copyResult.textContent = "Could not copy. Paste chrome://extensions/shortcuts into Chrome’s address bar.";
  });
});

// The side panel can't show Chrome's mic prompt, so permission is granted here once for the whole extension.
const result = document.querySelector<HTMLElement>("#result")!;

document.querySelector("#allow")!.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    result.textContent = "Microphone allowed. Click Open GuideRail above, then open a Google page to start.";
  } catch {
    result.textContent = "The microphone was blocked. Allow it from the camera icon in the address bar, then try again.";
  }
});
