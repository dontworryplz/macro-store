/* Tema, vurgu rengi ve düşük güç modu ilk boyamadan önce uygulanır. */
(() => {
  const root = document.documentElement;
  const accents = ["default", "red", "blue", "green", "yellow", "purple"];
  try {
    const saved = localStorage.getItem("macro-theme");
    const theme = saved === "light" ? "light" : "dark";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;

    const accent = localStorage.getItem("macro-accent");
    root.dataset.accent = accents.includes(accent) ? accent : "default";

    if (localStorage.getItem("macro-low-power") === "1") {
      root.dataset.lowPower = "1";
    }
  } catch {
    root.dataset.theme = "dark";
    root.dataset.accent = "default";
  }
})();
