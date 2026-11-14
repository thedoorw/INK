// Opt in this INK tab before the Presence and Native modules start.
if (window.location.origin === "https://thedoorw.github.io" &&
    window.location.pathname === "/INK/" &&
    new URLSearchParams(window.location.search).get("ink-g2") === "1") {
  window.INK_G2_DIRECT_ENABLED = true;
}
