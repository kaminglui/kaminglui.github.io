// Restored default content configuration after asset cleanup.
const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `block-${Math.random().toString(36).slice(2, 10)}`;

export const defaultContent = {
  hero: {
    eyebrow: 'Penn State M.S. Electrical Engineering',
    title: 'Hello, I am Ka Ming',
    lead: "I'm an electrical engineering master's student at Penn State focusing on machine learning.",
    primary: {
      label: 'Explore the Learning Journal',
      url: '#posts'
    },
    secondary: {
      label: 'LinkedIn Profile',
      url: 'https://www.linkedin.com/in/ka-ming-lui'
    },
    current: [
      'Teaching Assistant · Penn State University',
      'M.S. Electrical Engineering candidate · Penn State',
      'Temple University Electrical Engineering alum'
    ],
    focus: ['Machine Learning']
  },
  about: {
    title: 'A Little Bit About Myself',
    paragraphs: [
      'My background in electrical engineering keeps me grounded in measurement science, constraints, and critical thinking. As a master\'s student at Penn State.',
      'I thrive when translating domain expertise into ML-ready datasets, shaping modeling experiments, and productizing the insights.'
    ]
  },
  learning: {
    title: 'Exploring Potentials',
    topics: []
  },
  posts: {
    title: 'Approach to concept breakdown',
    ctaLabel: '',
    ctaUrl: '',
    entries: []
  },
  projects: {
    title: 'Involvement',
    items: []
  },
  sidebar: {
    blocks: [
      {
        id: createId(),
        title: 'Toolkit',
        type: 'list',
        items: [
          'Coding · Python, C/C++, MATLAB',
          'Multilingual · Chinese (Cantonese, Mandarin), English, Japanese'
        ]
      },
      {
        id: createId(),
        title: 'Learning Cadence',
        type: 'text',
        body: ''
      }
    ]
  },
  contact: {
    title: "Let's Connect.",
    body: 'Connect with me on LinkedIn if you have opportunities or ideas to collaborate on.',
    primary: null,
    secondary: null,
    meta: 'I am looking for a Machine Learning related job position.'
  },
  experienceFallback: {
    positions: [
      {
        title: 'Penn State University',
        subtitle: 'Teaching Assistant · Part-time · Aug 2024 — Present · State College, Pennsylvania',
        description:
          'Supporting electrical engineering courses on circuits lab (EE 210).'
      },
      {
        title: 'Temple University College of Engineering',
        subtitle: 'Undergraduate Researcher · Part-time · Aug 2022 — May 2023 · Philadelphia, Pennsylvania',
        description:
          'Collaborated on embedded sensing research, maintaining systematic workflows on Github, while formulating solutions and experiments for faculty partners.'
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
        description: 'Graduate focus on machine learning, domain adaptation with Maximum Entropy and Improved Iterative Scaling (ME-IIS).'
      },
      {
        title: 'Temple University College of Engineering',
        subtitle: "Bachelor of Science, Electrical Engineering · Aug 2019 — May 2023",
        description: 'Undergraduate coursework, circuit design, and signal processing.'
      }
    ]
  }
};
