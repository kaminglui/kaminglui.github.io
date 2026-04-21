const DEFAULT_META =
  '&copy; <span id="year"></span> Ka Ming Lui. Built with accessibility and performance in mind.';

const FOOTER_PRESETS = {
  home: {
    id: 'home',
    layoutClass: 'footer__layout',
    useContentBindings: true,
    backToTopLabel: 'Back to top'
  },
  'ml-playground': {
    layoutClass: 'footer__layout',
    heading: 'Want to explore more clustering demos?',
    body: 'Try the transformer lab or reach out to share your favorite visualization ideas.',
    actions: [
      { label: 'Visit Transformer Lab', href: 'pages/transformer-lab/', variant: 'primary' },
      { label: 'Email Ka-Ming', href: 'mailto:contact@kaminglui.com', variant: 'ghost' }
    ],
    meta: [
      'Curious how this playground works? Inspect the source on GitHub to tweak the algorithm.',
      DEFAULT_META
    ]
  },
  'transformer-lab': {
    layoutClass: 'footer__layout',
    heading: 'Ready for more machine learning stories?',
    body:
      'Head back to the main site to explore projects, journal entries, and the learning roadmap behind this transformer lab.',
    actions: [
      { label: 'View projects', href: 'index.html#projects', variant: 'primary' },
      { label: 'Get in touch', href: 'index.html#contact', variant: 'ghost' }
    ],
    meta: [
      'Enjoyed the walkthrough? Share it with fellow ML explorers.',
      DEFAULT_META
    ]
  }
};

export { DEFAULT_META, FOOTER_PRESETS };
