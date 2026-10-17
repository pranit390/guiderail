// The side panel can't show Chrome's mic prompt, so the permission is granted here once for the whole extension.
const result = document.querySelector<HTMLElement>("#result")!;

document.querySelector("#allow")!.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    result.textContent = "Microphone allowed. Open a Google page and press ⌘⇧K (Ctrl+Shift+K) to start.";
  } catch {
    result.textContent = "The microphone was blocked. Allow it from the camera icon in the address bar, then try again.";
  }
});
