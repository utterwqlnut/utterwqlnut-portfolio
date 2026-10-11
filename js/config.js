/*
 * ─────────────────────────────────────────────────────────────
 *  PORTFOLIO CONFIG
 *  Anything marked with data-bind / data-href in index.html is
 *  filled from here.
 * ─────────────────────────────────────────────────────────────
 */
window.PORTFOLIO = {
  name: "Dhruva Chayapathy",
  // Two lines for the stacked wordmark in the header
  wordmark: ["DHRUVA", "CHAYAPATHY"],
  initials: "DC",
  handle: "utterwqlnut",
  role: "Computer Engineering @ Georgia Tech",
  tagline: "Distributed + ML systems.",
  location: "Atlanta, GA",
  email: "dchayapathy3@gatech.edu",
  year: new Date().getFullYear(),

  links: {
    github: "https://github.com/utterwqlnut",
    linkedin: "https://www.linkedin.com/in/dhruva-chayapathy/",
    scholar: "https://scholar.google.com/citations?user=uD941UsAAAAJ&hl=en",
    resume: "assets/resume.pdf",
  },

  // utter, the chat blob. `endpoint` is the serverless function that calls Claude
  // (api/chat.js). If it isn't reachable, utter falls back to built-in answers.
  agent: { name: "utter", endpoint: "/api/chat" },

  // From Google Scholar (update by hand when it changes)
  scholar: { citations: 24, hIndex: 3 },

  // One entry per paper; `links` lists every place it was published
  publications: [
    {
      title: "Time Series Viewmakers for Robust Disruption Prediction",
      venue: "NeurIPS Workshop (ML4PS) · Springer IFIP AI Workshop",
      year: "2024–25",
      role: "First author",
      links: [
        { label: "NeurIPS ML4PS", url: "https://raw.githubusercontent.com/ml4physicalsciences/ml4physicalsciences.github.io/master/2024/files/NeurIPS_ML4PS_2024_141.pdf" },
        { label: "arXiv", url: "https://arxiv.org/abs/2410.11065" },
        { label: "Springer", url: "https://link.springer.com/chapter/10.1007/978-3-032-21184-2_6" },
      ],
    },
    {
      title: "Benchmarking Text Representations for Crystal Structure Generation with Large Language Models",
      venue: "ICLR Workshop (AI4Mat)",
      year: 2025,
      role: "Co-author",
      links: [{ label: "OpenReview", url: "https://openreview.net/forum?id=w1JsxPYWLL" }],
    },
    {
      title: "DisruptionBench and Complimentary New Models: Two Advancements in Machine Learning Driven Disruption Prediction",
      venue: "Journal of Fusion Energy",
      year: 2025,
      role: "Co-author",
      links: [{ label: "Springer", url: "https://link.springer.com/article/10.1007/s10894-025-00495-2" }],
    },
  ],

  skills: {
    languages: ["Python", "Go", "Java", "C++", "TypeScript", "Rust", "SQL"],
    infra: ["AWS", "Docker", "Linux", "Terraform", "gRPC"],
    data: ["PostgreSQL", "Redis", "Dask", "Pandas", "NumPy"],
    ml: ["PyTorch", "JAX", "HuggingFace", "TensorFlow"],
    web: ["React", "Next.js", "FastAPI", "Django", "Hono"],
  },
};
