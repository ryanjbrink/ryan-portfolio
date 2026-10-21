/** Visual identity for pages + sources — recognize without reading. */
window.RB_STATS_VISUALS = {
  /*
   * image = Pages section / timeline thumbs (home entry points)
   * tint  = journey-flow frosted glass (feel of each page)
   */
  pages: {
    "/": {
      label: "Home",
      image: "Images/home-cards/home.jpg",
      tint: "#9eb0c4", /* soft hero sky */
    },
    "/index.html": {
      label: "Home",
      image: "Images/home-cards/home.jpg",
      tint: "#9eb0c4",
    },
    "/about": {
      label: "About",
      image: "Images/favicon.svg",
      tint: "#F84D00", /* badge orange */
    },
    "/current-role.html": {
      label: "Current role",
      image: "Images/hcanew.png",
      tint: "#e05929", /* role terracotta */
    },
    "/fordscan.html": {
      label: "Ford",
      image: "Images/home-cards/ford.jpg",
      tint: "#4a6fa5", /* industrial scan blue */
    },
    "/landstarresearch.html": {
      label: "Landstar",
      image: "Images/home-cards/landstar.jpg",
      tint: "#1a5fb4", /* freight / hook blue */
    },
    "/simplevariables.html": {
      label: "Variables",
      image: "Images/home-cards/variables.jpg",
      tint: "#59C3F9", /* holo cyan */
    },
    "/phoney.html": {
      label: "Phoney",
      image: "Images/home-cards/phoney.jpg",
      tint: "#9748FF", /* Figma purple */
    },
    "/solaire.html": {
      label: "Solaire",
      image: "Images/home-cards/solaire.jpg",
      tint: "#6a9e8f", /* clinical teal */
    },
  },

  /** Inline brand marks — monochrome so they fit home glass UI */
  sourceIcons: {
    "(direct)": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3.2 4 10.2V21h5.2v-6.2h5.6V21H20V10.2L12 3.2Z"/></svg>`,
    "linkedin.com": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.5 9.2H3.7V20h2.8V9.2ZM5.1 4a1.65 1.65 0 1 0 0 3.3 1.65 1.65 0 0 0 0-3.3ZM20.3 13.1c0-3.3-1.8-4.8-4.1-4.8-1.9 0-2.8 1-3.3 1.8V9.2H10v10.8h2.8v-6c0-1.6.3-3.1 2.3-3.1s2 1.9 2 3.2V20h2.8v-6.9Z"/></svg>`,
    "google.com": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.3c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="currentColor" d="M12 22c2.7 0 5-0.9 6.7-2.4l-3.2-2.5c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.9v2.6A10 10 0 0 0 12 22Z"/><path fill="currentColor" d="M6.2 13.8A6 6 0 0 1 5.9 12c0-.6.1-1.3.3-1.8V7.6H2.9A10 10 0 0 0 2 12c0 1.6.4 3.1 1 4.4l3.2-2.6Z"/><path fill="currentColor" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2A10 10 0 0 0 2.9 7.6l3.3 2.6C7 7.7 9.3 5.9 12 5.9Z"/></svg>`,
    "twitter.com": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.2 3H21l-6.5 7.4L22 21h-5.5l-4.3-5.6L7 21H4.2l7-7.9L2.5 3H8l3.9 5.1L18.2 3Zm-1 16.2h1.5L7 4.7H5.4l11.8 14.5Z"/></svg>`,
    "x.com": `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.2 3H21l-6.5 7.4L22 21h-5.5l-4.3-5.6L7 21H4.2l7-7.9L2.5 3H8l3.9 5.1L18.2 3Zm-1 16.2h1.5L7 4.7H5.4l11.8 14.5Z"/></svg>`,
    newsletter: `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.5 5.5h17A1.5 1.5 0 0 1 22 7v10a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17V7a1.5 1.5 0 0 1 1.5-1.5Zm8.5 7.2L4.8 7.4v9.1h14.4V7.4L12 12.7Zm0-1.7 6.8-4.5H5.2L12 11Z"/></svg>`,
  },

  pageFor(path) {
    const key = path === "/index.html" ? "/" : path;
    return (
      this.pages[key] ||
      this.pages[path] ||
      { label: path, image: "Images/favicon.svg", tint: "#94a3b8" }
    );
  },

  sourceIcon(host) {
    const h = (host || "(direct)").toLowerCase();
    if (this.sourceIcons[h]) return this.sourceIcons[h];
    if (h.includes("linkedin")) return this.sourceIcons["linkedin.com"];
    if (h.includes("google")) return this.sourceIcons["google.com"];
    if (h.includes("twitter") || h === "x.com") return this.sourceIcons["twitter.com"];
    if (h.includes("news") || h.includes("mail")) return this.sourceIcons.newsletter;
    return this.sourceIcons["(direct)"];
  },
};
