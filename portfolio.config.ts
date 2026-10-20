// Everything personal on the site lives in this file. Edit freely — the UI reads it at build time.
// Content below was copied from anvay.moe and github.com/AnvayDev on 2026-10-19.
// Values marked `// placeholder` were not on either site; change or delete them.

export interface Link { label: string; url: string }

export interface PortfolioConfig {
  /** Shown on the toolbar user button and the portfolio header. */
  name: string;
  /** Short line under the name (like a beatmap's artist line). */
  tagline: string;
  /** Square image, shown on the toolbar user button and About panel. */
  avatar: string;
  /** Label of the main-menu button that replaces osu!'s "edit". Lower-case like the other buttons. */
  menuButtonLabel: string;

  about: {
    paragraphs: string[];
    /** Rendered like beatmap statistics (label / value). */
    facts: { label: string; value: string }[];
  };

  education: {
    school: string;
    degree: string;
    period: string;
    details: string[];
  }[];

  /** Skills show as difficulties; `level` (0–10) is drawn with osu!'s star-rating colours. */
  skills: { name: string; status: string; level: number }[];
  /** Extra tools listed under the skills section. */
  tools: string[];

  experience: {
    role: string;
    org: string;
    period: string;
    bullets: string[];
    url?: string;
  }[];

  projects: {
    title: string;
    subtitle: string;
    /** Shown like a ranked-status pill. */
    status: string;
    description: string[];
    tech: string[];
    links: Link[];
    /** Optional background image (path under /public or a URL). Falls back to a default osu! background. */
    image?: string;
  }[];

  github: {
    username: string;
    /** Fetch public repos from the GitHub API at runtime and list them under "github". */
    fetchRepos: boolean;
    /** Repos to hide from the live list. */
    hideRepos: string[];
  };

  socials: { label: string; handle: string; url: string }[];

  resume: {
    /** Path under /public. */
    file: string;
    downloadName: string;
  };

  /** Torus is a commercial font licensed to ppy. Set to false to use Inter everywhere instead. */
  useTorusFont: boolean;
}

const config: PortfolioConfig = {
  name: 'Anvay Patel',
  tagline: 'Computer Science @ NYU Courant CDS',
  avatar: '/portfolio/avatar.jpg',
  menuButtonLabel: 'portfolio',

  about: {
    paragraphs: [
      "I'm a first-year at NYU Courant CDS pursuing a B.S. in Computer Science, expected May 2030, with a deep orientation toward software engineering.",
      'My work centers on back-end systems like RAG pipelines, APIs, and containers, alongside applied machine learning and the mathematics underneath it.',
      "Outside of software, I'm a sailing instructor, a ski instructor, an avid market researcher, and a long-term builder of things that ship.",
    ],
    facts: [
      { label: 'Academic CS', value: '2+ years' },
      { label: 'Industry', value: 'Splore AI' },
      { label: 'Community service', value: '200+ hours' },
      { label: 'Personal projects', value: '5+ years' },
    ],
  },

  education: [
    {
      school: 'NYU Courant CDS',
      degree: 'B.S. Computer Science',
      period: 'Expected May 2030',
      details: ['First semester: Intro to Programming, Calculus I, Writing as Inquiry.', '16 AP credit units.'],
    },
    {
      school: 'Eastside Catholic',
      degree: "Class of '26",
      period: '2026',
      details: ['Second Honors.', 'AP Scholar with Distinction.'],
    },
  ],

  skills: [
    { name: 'Python', status: 'Primary', level: 7.0 }, // placeholder level
    { name: 'Java', status: 'Strong', level: 6.0 }, // placeholder level
    { name: 'SQL', status: 'Active', level: 5.0 }, // placeholder level
    { name: 'FastAPI + Docker', status: 'Applied', level: 4.5 }, // placeholder level
  ],
  tools: ['FastAPI', 'Spring Boot', 'OpenWebUI', 'Docker', 'MySQL', 'Swagger', 'PyTorch', 'NumPy', 'Matplotlib'],

  experience: [
    {
      role: 'Intern',
      org: 'Splore AI',
      period: '2025',
      bullets: [
        'Shipped a Dockerized RAG pipeline (FastAPI + MySQL).',
        'Benchmarked 3 LLM styles on accuracy-to-cost to pick the production model.',
      ],
    },
    { role: 'Member', org: 'NYU OSIRIS Lab', period: 'Current', bullets: ['Newly joined NYU OSIRIS Lab.'] },
    { role: 'Research Assistant', org: 'NYU VIPS', period: 'Current', bullets: ['Research assistant with NYU VIPS.'] },
    { role: 'Sailing & Ski Instructor', org: 'Instructor', period: 'Ongoing', bullets: ['50+ students taught.'] },
  ],

  projects: [
    {
      title: 'Macro Placement',
      subtitle: "HRT's Macro Placement Challenge",
      status: '1.27 cost',
      description: ["Simulated-annealing macro placer for HRT's challenge; 1.27 cost on ibm01."],
      tech: ['Python'],
      links: [{ label: 'GitHub', url: 'https://github.com/AnvayDev/Bocchi-MacroPlacementChallange' }],
    },
    {
      title: 'Clothing CNN',
      subtitle: 'FashionClassifier',
      status: '99% acc',
      description: ['PyTorch CNN over 300K images and 7 classes; 99% held-out accuracy.'],
      tech: ['Python', 'PyTorch'],
      links: [{ label: 'GitHub', url: 'https://github.com/AnvayDev/FashionClassifier' }],
    },
    {
      title: 'anvay.moe',
      subtitle: 'Persona-inspired portfolio',
      status: 'shipped',
      description: ['Persona-inspired portfolio built with React and Vite.'],
      tech: ['React', 'Vite'],
      links: [{ label: 'Visit', url: 'https://anvay.moe' }],
    },
    {
      title: 'osu!lazer web',
      subtitle: 'This site',
      status: 'shipped',
      description: ["A browser port of osu!lazer's menus, song select and music player that doubles as this portfolio."],
      tech: ['TypeScript', 'Vite', 'WebAudio', 'IndexedDB'],
      links: [],
    },
    {
      title: 'Deep Learning Certificate',
      subtitle: 'Certification',
      status: 'complete',
      description: ['Completed a deep learning certification.'],
      tech: ['PyTorch'],
      links: [],
    },
  ],

  github: {
    username: 'AnvayDev',
    fetchRepos: true,
    hideRepos: [],
  },

  socials: [
    { label: 'GitHub', handle: 'AnvayDev', url: 'https://github.com/AnvayDev' },
    { label: 'LinkedIn', handle: 'in/anvaypatel', url: 'https://www.linkedin.com/in/anvaypatel/' },
    { label: 'Discord', handle: 'lemonloves', url: 'https://discord.com/users/1389257205970370653' },
    { label: 'Email', handle: 'anvay.patel@icloud.com', url: 'mailto:anvay.patel@icloud.com' },
    { label: 'NYU email', handle: 'anp6897@nyu.edu', url: 'mailto:anp6897@nyu.edu' },
    { label: 'Website', handle: 'anvay.moe', url: 'https://anvay.moe' },
  ],

  resume: {
    file: '/portfolio/resume.pdf',
    downloadName: 'Anvay Patel - Resume.pdf',
  },

  useTorusFont: true,
};

export default config;
