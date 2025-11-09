const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `block-${Math.random().toString(36).slice(2, 10)}`;

export const defaultContent = {
  hero: {
    eyebrow: 'Penn State M.S. Electrical Engineering · ML systems focus',
    title: 'Hello, I am Ka Ming',
    lead: "I'm an electrical engineering master's student at Penn State focusing on machine learning.",
    primary: {
      label: 'Explore the learning journal',
      url: '#posts'
    },
    secondary: {
      label: 'LinkedIn profile',
      url: 'https://www.linkedin.com/in/ka-ming-lui/'
    },
    current: [
      'Teaching Assistant · Penn State University',
      'M.S. Electrical Engineering candidate · Penn State',
      'Temple University Electrical Engineering alum'
    ],
    focus: ['Machine Learning']
  },
  about: {
    title: 'Engineering rigor meets machine learning momentum.',
    paragraphs: [
      'My background in electrical engineering keeps me grounded in measurement science, hardware constraints, and safety-critical thinking. As a master\'s student at Penn State, I now focus that rigor on building machine learning systems that can be audited, trusted, and iterated quickly.',
      'I thrive when translating domain expertise into ML-ready datasets, shaping modeling experiments, and productizing the insights—whether for research collaborations, student teams, or industry partners.'
    ]
  },
  learning: {
    title: 'Current questions I\'m unpacking',
    topics: []
  },
  posts: {
    title: 'Working notes on machine learning concepts',
    ctaLabel: 'Get updates',
    ctaUrl: 'mailto:hello@kaminglui.com?subject=Learning%20journal%20updates',
    entries: []
  },
  projects: {
    title: 'Hands-on work that blends ML with hardware',
    items: []
  },
  sidebar: {
    blocks: [
      {
        id: createId(),
        title: 'Toolkit',
        type: 'list',
        items: ['Python · PyTorch · TensorFlow', 'NumPy · Pandas · scikit-learn', 'Weights & Biases · MLflow · DVC', 'MATLAB · C/C++ · Rust']
      },
      {
        id: createId(),
        title: 'Learning cadence',
        type: 'text',
        body: 'Weekly writing sprints keep concepts fresh, paired with reading groups and lab demos so theory meets hands-on exploration.'
      }
    ]
  },
  contact: {
    title: "Let's teach machines responsibly together.",
    body:
      "I'm interested in research collaborations, technical writing, and ML product partnerships that value transparency and inclusive design. Share a short overview of what you're exploring and how I can help.",
    primary: {
      label: 'hello@kaminglui.com',
      url: 'mailto:hello@kaminglui.com'
    },
    secondary: {
      label: 'Connect on LinkedIn',
      url: 'https://www.linkedin.com/in/ka-ming-lui/'
    },
    meta: 'Based in Pennsylvania · Working remotely and on-site as needed.'
  },
  experienceFallback: {
    positions: [
      {
        title: 'Penn State University',
        subtitle: 'Teaching Assistant · Part-time · Aug 2024 — Present · State College, Pennsylvania',
        description:
          'Supporting electrical engineering courses on circuits and machine learning instrumentation while coaching students through responsible AI labs.'
      },
      {
        title: 'Temple University College of Engineering',
        subtitle: 'Undergraduate Researcher · Part-time · Aug 2022 — May 2023 · Philadelphia, Pennsylvania',
        description:
          'Collaborated on embedded sensing research, maintaining Ubuntu and secure shell workflows while documenting experiments for faculty partners.'
      },
      {
        title: 'City of Philadelphia Commissioners',
        subtitle: 'Polling Place Interpreter · Freelance · Aug 2017 — Aug 2019 · Philadelphia, Pennsylvania',
        description:
          'Provided multilingual support at election sites and coordinated logistics that kept voting lines moving efficiently.'
      }
    ],
    education: [
      {
        title: 'Penn State University College of Engineering',
        subtitle: 'Master of Science, Electrical Engineering · Apr 2024 — Present',
        description: 'Graduate focus on machine learning for instrumentation and human-centered evaluation.'
      },
      {
        title: 'Temple University College of Engineering',
        subtitle: "Bachelor of Science, Electrical Engineering · Aug 2019 — May 2023",
        description: 'Undergraduate coursework highlighted circuit design, signal processing, and machine learning foundations.'
      }
    ]
  }
};
