const body = document.body;
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
const navDropdowns = Array.from(document.querySelectorAll('.nav-item--dropdown')).reduce(
  (accumulator, wrapper) => {
    if (!(wrapper instanceof HTMLElement)) return accumulator;
    const toggle = wrapper.querySelector('.nav-dropdown-toggle');
    const menu = wrapper.querySelector('.nav-dropdown-menu');

    if (toggle instanceof HTMLElement && menu instanceof HTMLElement) {
      accumulator.push({ wrapper, toggle, menu });
    }

    return accumulator;
  },
  []
);
const themeToggle = document.querySelector('.theme-toggle');
const yearElement = document.getElementById('year');
const backToTopLink = document.querySelector('.back-to-top');

const prefersReducedMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

function setTheme(isDark) {
  body.classList.toggle('theme-dark', isDark);
  body.classList.toggle('theme-light', !isDark);
  if (themeToggle) {
    themeToggle.innerHTML = isDark ? '<span aria-hidden="true">☀️</span>' : '<span aria-hidden="true">🌙</span>';
  }
}

function setupTheme() {
  if (!themeToggle) return;

  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  const storedTheme = window.localStorage.getItem('theme');

  if (storedTheme === 'dark' || (!storedTheme && prefersDarkScheme.matches)) {
    setTheme(true);
  } else {
    setTheme(false);
  }

  prefersDarkScheme.addEventListener('change', (event) => {
    if (window.localStorage.getItem('theme')) return;
    setTheme(event.matches);
  });

  themeToggle.addEventListener('click', () => {
    const isDark = !body.classList.contains('theme-dark');
    setTheme(isDark);
    window.localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

function setupNav() {
  const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const closeDropdown = (dropdown) => {
    dropdown.toggle.setAttribute('aria-expanded', 'false');
    dropdown.menu.hidden = true;
    dropdown.wrapper.setAttribute('data-open', 'false');
  };

  const closeAllDropdowns = () => {
    navDropdowns.forEach((dropdown) => {
      closeDropdown(dropdown);
    });
  };

  const openDropdown = (dropdown) => {
    closeAllDropdowns();
    dropdown.toggle.setAttribute('aria-expanded', 'true');
    dropdown.menu.hidden = false;
    dropdown.wrapper.setAttribute('data-open', 'true');
  };

  if (navDropdowns.length) {
    navDropdowns.forEach((dropdown) => {
      closeDropdown(dropdown);

      dropdown.toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const isExpanded = dropdown.toggle.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
          closeDropdown(dropdown);
        } else {
          openDropdown(dropdown);
        }
      });

      dropdown.toggle.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (dropdown.toggle.getAttribute('aria-expanded') !== 'true') {
            openDropdown(dropdown);
          }
          const firstItem = dropdown.menu.querySelector(focusableSelector);
          if (firstItem instanceof HTMLElement) {
            firstItem.focus();
          }
        } else if (event.key === 'Escape') {
          closeDropdown(dropdown);
        }
      });

      dropdown.menu.addEventListener('click', (event) => {
        if (event.target instanceof HTMLAnchorElement) {
          closeAllDropdowns();
        }
      });

      dropdown.menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          closeDropdown(dropdown);
          dropdown.toggle.focus();
        }
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (navDropdowns.some((dropdown) => dropdown.wrapper.contains(target))) {
        return;
      }
      closeAllDropdowns();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeAllDropdowns();
      }
    });
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      closeAllDropdowns();
      navToggle.setAttribute('aria-expanded', String(!isExpanded));
      navLinks?.setAttribute('data-visible', String(!isExpanded));
      body.classList.toggle('nav-open', !isExpanded);
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks?.setAttribute('data-visible', 'false');
        body.classList.remove('nav-open');
        closeAllDropdowns();
        navToggle.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 720) {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks?.setAttribute('data-visible', 'false');
        body.classList.remove('nav-open');
        closeAllDropdowns();
      }
    });
  }

  navLinks?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle?.setAttribute('aria-expanded', 'false');
      navLinks.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
      closeAllDropdowns();
    }
  });
}

function setupBackToTop() {
  if (!backToTopLink) return;

  backToTopLink.addEventListener('click', (event) => {
    event.preventDefault();

    const behavior = prefersReducedMotion?.matches ? 'auto' : 'smooth';
    const scrollTarget =
      document.scrollingElement || document.documentElement || document.body || window;
    const scrollOptions = { top: 0, left: 0, behavior };

    try {
      if (scrollTarget && typeof scrollTarget.scrollTo === 'function') {
        scrollTarget.scrollTo(scrollOptions);
      } else if (typeof window.scrollTo === 'function') {
        window.scrollTo(scrollOptions);
      }
    } catch (error) {
      window.scrollTo(0, 0);
    }
  });
}

const TOKEN_MODES = {
  words: {
    description: 'Word tokens keep whole words intact and make it easy to read the sentence like a human.',
    defaultToken: 'words-transformers'
  },
  subwords: {
    description:
      'Subword pieces break rarer words into reusable fragments so the model never has to emit an unknown token.',
    defaultToken: 'subwords-trans'
  },
  vision: {
    description:
      'Vision transformers slice an image into equal patches and treat each patch like a token alongside the class token.',
    defaultToken: 'vision-patch1'
  }
};

const TOKEN_DETAILS = {
  'words-cls': {
    title: '[CLS] · classification token',
    summary: 'A learned sentinel that gathers information from the whole sentence for downstream heads.',
    facts: [
      { label: 'Role', value: 'Global summary vector' },
      { label: 'Learns', value: 'To pay attention to every other token' }
    ]
  },
  'words-transformers': {
    title: '"Transformers" · subject',
    summary: 'Sets the topic of the sentence and supplies context to the verbs that follow.',
    facts: [
      { label: 'Carries', value: 'What the sentence is about' },
      { label: 'Attention', value: 'Looks to verbs to understand actions' }
    ]
  },
  'words-help': {
    title: '"help" · verb',
    summary: 'Signals the primary action the subject performs for the object phrase.',
    facts: [
      { label: 'Carries', value: 'Action performed by transformers' },
      { label: 'Needs', value: 'Context from subject and object' }
    ]
  },
  'words-models': {
    title: '"models" · noun',
    summary: 'The object being helped, which will absorb meaning from the surrounding verbs.',
    facts: [
      { label: 'Carries', value: 'Who receives the help' },
      { label: 'Attention', value: 'Balances context from both verbs' }
    ]
  },
  'words-connect': {
    title: '"connect" · verb',
    summary: 'Describes the downstream effect and links the object to the ideas it should learn.',
    facts: [
      { label: 'Carries', value: 'Action applied to ideas' },
      { label: 'Paired with', value: 'The noun “ideas” and helper verb “help”' }
    ]
  },
  'words-ideas': {
    title: '"ideas" · noun',
    summary: 'Destination for the action—represents abstract concepts that the models should relate.',
    facts: [
      { label: 'Carries', value: 'Concepts being connected' },
      { label: 'Needs', value: 'Signals from verbs to know how to behave' }
    ]
  },
  'words-sep': {
    title: '[SEP] · separator token',
    summary: 'Marks the end of the sentence so padding and subsequent inputs stay separate.',
    facts: [
      { label: 'Role', value: 'Sequence boundary' },
      { label: 'Learns', value: 'To dampen attention at the sentence edge' }
    ]
  },
  'subwords-cls': {
    title: '[CLS] · still the summary token',
    summary: 'Even with subwords the special sentinel stays the same.',
    facts: [
      { label: 'Mode', value: 'Same as word-level' },
      { label: 'Benefit', value: 'Keeps a stable pooling location' }
    ]
  },
  'subwords-trans': {
    title: '"trans" · root piece',
    summary: 'Captures the start of “transformers”, letting the model reuse the prefix in other words.',
    facts: [
      { label: 'Why split', value: 'Rare words share prefixes' },
      { label: 'Paired with', value: 'Suffix token ##formers' }
    ]
  },
  'subwords-formers': {
    title: '"##formers" · suffix piece',
    summary: 'Completes the rare word so the combined embedding matches the original term.',
    facts: [
      { label: 'Prefix join', value: 'Attaches to “trans”' },
      { label: 'Learns', value: 'How suffix changes meaning' }
    ]
  },
  'subwords-help': {
    title: '"help" · frequent word',
    summary: 'Common words often stay whole because the vocabulary already includes them.',
    facts: [
      { label: 'Frequency', value: 'High—kept as a single token' },
      { label: 'Benefit', value: 'Saves the model from splitting easy words' }
    ]
  },
  'subwords-model': {
    title: '"model" · root piece',
    summary: 'Base meaning of the plural noun.',
    facts: [
      { label: 'Paired suffix', value: '##s adds plurality' },
      { label: 'Reuse', value: 'Also appears in words like "modeling"' }
    ]
  },
  'subwords-s': {
    title: '"##s" · suffix piece',
    summary: 'Marks plurality or verb tense depending on context.',
    facts: [
      { label: 'Teaches', value: 'How suffixes alter grammar' },
      { label: 'Shares', value: 'Used for many plural words' }
    ]
  },
  'subwords-connect': {
    title: '"connect" · verb stem',
    summary: 'Stays whole because it is frequent enough to be in the vocabulary.',
    facts: [
      { label: 'Frequency', value: 'Common action word' },
      { label: 'Pairs with', value: 'Objects like “ideas”' }
    ]
  },
  'subwords-idea': {
    title: '"idea" · noun stem',
    summary: 'Root meaning of the noun before plurality is applied.',
    facts: [
      { label: 'Paired suffix', value: '##s gives plural ideas' },
      { label: 'Embedding', value: 'Reused for related words like “ideal”' }
    ]
  },
  'subwords-s2': {
    title: '"##s" · second suffix',
    summary: 'Another copy of the plural suffix for the noun “ideas”.',
    facts: [
      { label: 'Reuse', value: 'Same learned vector as the other ##s token' },
      { label: 'Effect', value: 'Signals plurality to the model' }
    ]
  },
  'subwords-sep': {
    title: '[SEP] · separator token',
    summary: 'Same sequence boundary marker used in the word-level view.',
    facts: [
      { label: 'Consistency', value: 'Special tokens stay identical across vocabularies' },
      { label: 'Learns', value: 'To block attention beyond the sentence' }
    ]
  },
  'vision-class': {
    title: '[CLS] · vision summary token',
    summary: 'Aggregates information from all image patches so classifiers have a single vector.',
    facts: [
      { label: 'Role', value: 'Global image descriptor' },
      { label: 'Learns', value: 'To balance texture, color, and layout' }
    ]
  },
  'vision-patch1': {
    title: 'Patch 1 · top-left',
    summary: 'Represents the first 16×16 region of the image, capturing local edges and colors.',
    facts: [
      { label: 'Patch size', value: '16 × 16 pixels' },
      { label: 'Focus', value: 'Corner textures and background' }
    ]
  },
  'vision-patch2': {
    title: 'Patch 2 · top-center',
    summary: 'Next patch across the image, aligned horizontally with Patch 1.',
    facts: [
      { label: 'Shares', value: 'Overlaps context with neighbors' },
      { label: 'Helps with', value: 'Capturing long horizontal structures' }
    ]
  },
  'vision-patch3': {
    title: 'Patch 3 · top-right',
    summary: 'Captures the upper-right corner details.',
    facts: [
      { label: 'Complement', value: 'Balances the left patches' },
      { label: 'Attention', value: 'Links to distant patches for long-range cues' }
    ]
  },
  'vision-patch4': {
    title: 'Patch 4 · bottom-left',
    summary: 'Begins the second row of patches with new texture information.',
    facts: [
      { label: 'Spatial role', value: 'Connects top and bottom halves' },
      { label: 'Combines', value: 'Local features with global context' }
    ]
  },
  'vision-patch5': {
    title: 'Patch 5 · bottom-center',
    summary: 'Middle patch in the second row, bridging surrounding regions.',
    facts: [
      { label: 'Attention', value: 'Shares information with all neighbors' },
      { label: 'Helps with', value: 'Capturing shapes across rows' }
    ]
  },
  'vision-patch6': {
    title: 'Patch 6 · bottom-right',
    summary: 'Completes the grid and preserves boundary information.',
    facts: [
      { label: 'Role', value: 'Edges and corners' },
      { label: 'Learns', value: 'How borders differ from the center' }
    ]
  },
  'vision-sep': {
    title: '[SEP] · end of image tokens',
    summary: 'Marks the end of the patch sequence so the model knows where padding begins.',
    facts: [
      { label: 'Role', value: 'Sequence boundary' },
      { label: 'Pairs with', value: 'Start-of-sequence [CLS]' }
    ]
  }
};

const VECTOR_DIMENSIONS = ['Dim 1', 'Dim 2', 'Dim 3', 'Dim 4'];
const VECTOR_TOKENS = ['[CLS]', 'Transformers', 'help', 'models', 'connect', 'ideas'];
const VECTOR_SETS = {
  query: {
    description: 'Queries look for the context a token needs—large values emphasise features it will pull from others.',
    matrix: [
      [0.82, 0.15, -0.24, 0.44],
      [0.38, 0.74, 0.02, -0.16],
      [0.52, 0.28, 0.41, -0.32],
      [0.21, 0.18, 0.63, -0.05],
      [0.64, 0.22, 0.35, 0.14],
      [0.29, 0.11, 0.47, 0.26]
    ]
  },
  key: {
    description: 'Keys advertise what information a token offers to everyone else during attention.',
    matrix: [
      [0.77, 0.08, -0.18, 0.52],
      [0.42, 0.68, 0.15, -0.21],
      [0.24, 0.33, 0.57, -0.12],
      [0.19, 0.25, 0.72, -0.08],
      [0.36, 0.14, 0.48, 0.31],
      [0.18, 0.12, 0.41, 0.28]
    ]
  },
  value: {
    description: 'Values carry the information that will actually be mixed once attention weights are applied.',
    matrix: [
      [0.65, 0.12, -0.22, 0.38],
      [0.48, 0.56, 0.18, -0.11],
      [0.22, 0.28, 0.61, -0.16],
      [0.17, 0.26, 0.74, -0.05],
      [0.34, 0.18, 0.49, 0.27],
      [0.21, 0.14, 0.52, 0.24]
    ]
  }
};

const ATTENTION_TOKENS = [
  'words-cls',
  'words-transformers',
  'words-help',
  'words-models',
  'words-connect',
  'words-ideas',
  'words-sep'
];

const ATTENTION_HEADS = {
  semantic: {
    description: 'Head 1 highlights semantic relationships—subjects focus on verbs and objects that carry meaning.',
    focuses: {
      'words-cls': {
        note: '[CLS] pools the verbs and objects to summarise the full idea.',
        weights: {
          'words-cls': 0.12,
          'words-transformers': 0.2,
          'words-help': 0.18,
          'words-models': 0.16,
          'words-connect': 0.2,
          'words-ideas': 0.12,
          'words-sep': 0.02
        }
      },
      'words-transformers': {
        note: '"Transformers" leans on the verb phrase to understand what it is doing.',
        weights: {
          'words-cls': 0.14,
          'words-transformers': 0.16,
          'words-help': 0.22,
          'words-models': 0.18,
          'words-connect': 0.16,
          'words-ideas': 0.12,
          'words-sep': 0.02
        }
      },
      'words-help': {
        note: '"help" balances attention between the subject and the action that follows.',
        weights: {
          'words-cls': 0.12,
          'words-transformers': 0.24,
          'words-help': 0.14,
          'words-models': 0.18,
          'words-connect': 0.18,
          'words-ideas': 0.12,
          'words-sep': 0.02
        }
      },
      'words-models': {
        note: '"models" listens to verbs on both sides to understand how it should behave.',
        weights: {
          'words-cls': 0.12,
          'words-transformers': 0.18,
          'words-help': 0.2,
          'words-models': 0.16,
          'words-connect': 0.2,
          'words-ideas': 0.12,
          'words-sep': 0.02
        }
      },
      'words-connect': {
        note: '"connect" strongly references the noun "ideas" to complete the action.',
        weights: {
          'words-cls': 0.1,
          'words-transformers': 0.16,
          'words-help': 0.18,
          'words-models': 0.18,
          'words-connect': 0.14,
          'words-ideas': 0.22,
          'words-sep': 0.02
        }
      },
      'words-ideas': {
        note: '"ideas" looks back to the verbs to know how it is being manipulated.',
        weights: {
          'words-cls': 0.1,
          'words-transformers': 0.18,
          'words-help': 0.16,
          'words-models': 0.2,
          'words-connect': 0.22,
          'words-ideas': 0.12,
          'words-sep': 0.02
        }
      }
    }
  },
  position: {
    description: 'Head 2 keeps track of ordering so the model remembers which tokens are neighbors.',
    focuses: {
      'words-cls': {
        note: '[CLS] keeps a light anchor on every position to stabilise the summary.',
        weights: {
          'words-cls': 0.2,
          'words-transformers': 0.16,
          'words-help': 0.14,
          'words-models': 0.14,
          'words-connect': 0.14,
          'words-ideas': 0.14,
          'words-sep': 0.08
        }
      },
      'words-transformers': {
        note: '"Transformers" mostly attends forward to the upcoming verb.',
        weights: {
          'words-cls': 0.12,
          'words-transformers': 0.18,
          'words-help': 0.2,
          'words-models': 0.16,
          'words-connect': 0.14,
          'words-ideas': 0.12,
          'words-sep': 0.08
        }
      },
      'words-help': {
        note: '"help" splits attention between the subject before it and the object phrase after it.',
        weights: {
          'words-cls': 0.1,
          'words-transformers': 0.2,
          'words-help': 0.18,
          'words-models': 0.18,
          'words-connect': 0.18,
          'words-ideas': 0.1,
          'words-sep': 0.06
        }
      },
      'words-models': {
        note: '"models" anchors itself between the surrounding verbs.',
        weights: {
          'words-cls': 0.1,
          'words-transformers': 0.16,
          'words-help': 0.18,
          'words-models': 0.16,
          'words-connect': 0.2,
          'words-ideas': 0.14,
          'words-sep': 0.06
        }
      },
      'words-connect': {
        note: '"connect" keeps a strong link with the nouns around it.',
        weights: {
          'words-cls': 0.1,
          'words-transformers': 0.14,
          'words-help': 0.18,
          'words-models': 0.2,
          'words-connect': 0.16,
          'words-ideas': 0.16,
          'words-sep': 0.06
        }
      },
      'words-ideas': {
        note: '"ideas" looks backward to the verbs and forward to the sentence boundary.',
        weights: {
          'words-cls': 0.1,
          'words-transformers': 0.12,
          'words-help': 0.16,
          'words-models': 0.2,
          'words-connect': 0.2,
          'words-ideas': 0.14,
          'words-sep': 0.08
        }
      }
    }
  }
};

const PIPELINE_STEPS = [
  {
    id: 'mix',
    title: 'Self-attention mixes contextual clues',
    description:
      'Each query weights the value vectors from every token and sums them into a context-rich representation.',
    highlights: [
      {
        title: 'Weighted values',
        detail: 'Attention weights act like knobs controlling how much of each token flows into the mix.'
      },
      {
        title: 'Multi-head view',
        detail: 'Different heads emphasise syntax, long-range links, or specific phrases at the same time.'
      }
    ],
    chips: ['context vector', 'multi-head concat']
  },
  {
    id: 'ffn',
    title: 'Feed-forward layers reshape meaning',
    description:
      'A tiny shared MLP refines every token independently, adding non-linear features after attention.',
    highlights: [
      {
        title: 'Non-linearity',
        detail: 'Activation functions let the model capture richer interactions than weighted sums alone.'
      },
      {
        title: 'Parameter sharing',
        detail: 'The same weights apply to each token, so the block learns transformations that generalise.'
      }
    ],
    chips: ['GELU', 'two-layer MLP']
  },
  {
    id: 'residual',
    title: 'Residual connections keep information flowing',
    description:
      'Skip connections and layer normalisation stabilise training and preserve the original signal.',
    highlights: [
      {
        title: 'Skip paths',
        detail: 'Residuals add the previous representation back in so gradients travel unimpeded.'
      },
      {
        title: 'Layer norm',
        detail: 'Normalisation keeps activations in a healthy range for the next block.'
      }
    ],
    chips: ['residual', 'layer norm']
  },
  {
    id: 'prediction',
    title: 'Output heads turn features into predictions',
    description:
      'Depending on the task, the model reads the [CLS] token, the final token, or all tokens to produce answers.',
    highlights: [
      {
        title: 'CLS classifier',
        detail: 'A linear layer on [CLS] is common for classification problems.'
      },
      {
        title: 'Autoregressive head',
        detail: 'Decoders project each token to vocabulary logits for next-token prediction.'
      }
    ],
    chips: ['logits', 'softmax']
  }
];

function setupStageNavigation() {
  const nav = document.querySelector('[data-stage-nav]');
  const panels = new Map();
  document.querySelectorAll('[data-stage-panel]').forEach((panel) => {
    panels.set(panel.dataset.stagePanel, panel);
  });
  if (!nav || panels.size === 0) return;

  const buttons = Array.from(nav.querySelectorAll('[data-stage]'));
  if (buttons.length === 0) return;

  const activateStage = (stageId) => {
    buttons.forEach((button) => {
      const isActive = button.dataset.stage === stageId;
      button.classList.toggle('is-active', isActive);
      const panel = panels.get(button.dataset.stage);
      if (panel) {
        panel.classList.toggle('is-active', isActive);
      }
    });

    if (!panels.has(stageId)) {
      panels.forEach((panel, id) => {
        panel.classList.toggle('is-active', id === stageId);
      });
    }
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      activateStage(button.dataset.stage);
    });
  });

  const initialStage =
    buttons.find((button) => button.classList.contains('is-active'))?.dataset.stage || buttons[0].dataset.stage;
  activateStage(initialStage);
}

function setupTokenExplorer() {
  const modeSwitch = document.querySelector('[data-token-mode-switch]');
  const modeButtons = modeSwitch ? Array.from(modeSwitch.querySelectorAll('[data-token-mode]')) : [];
  const tokenGroups = Array.from(document.querySelectorAll('[data-token-group]'));
  const tokenButtons = Array.from(document.querySelectorAll('[data-token]'));
  const modeDescription = document.querySelector('[data-token-mode-description]');
  const inspector = document.querySelector('[data-token-inspector]');
  const titleEl = inspector?.querySelector('[data-token-title]');
  const summaryEl = inspector?.querySelector('[data-token-summary]');
  const factsEl = inspector?.querySelector('[data-token-facts]');

  if (!inspector || modeButtons.length === 0 || tokenButtons.length === 0) return;

  const tokenLabels = new Map();
  tokenButtons.forEach((button) => {
    tokenLabels.set(button.dataset.token, button.textContent.trim());
  });

  const defaultInspector = {
    title: titleEl?.textContent || 'Choose a token to inspect',
    summary:
      summaryEl?.textContent || 'Toggle between token views and tap a token to see how transformers break down the input.'
  };

  const renderFacts = (facts) => {
    if (!factsEl) return;
    factsEl.innerHTML = '';
    if (Array.isArray(facts) && facts.length > 0) {
      facts.forEach((fact) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'token-inspector__fact';
        const dt = document.createElement('dt');
        dt.textContent = fact.label;
        const dd = document.createElement('dd');
        dd.textContent = fact.value;
        wrapper.append(dt, dd);
        factsEl.appendChild(wrapper);
      });
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'token-inspector__empty';
      fallback.textContent = 'This token leans on its neighbors for additional context.';
      factsEl.appendChild(fallback);
    }
  };

  const setInspector = (tokenId) => {
    tokenButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.token === tokenId);
    });

    const info = TOKEN_DETAILS[tokenId];
    if (!info) {
      if (titleEl) titleEl.textContent = defaultInspector.title;
      if (summaryEl) summaryEl.textContent = defaultInspector.summary;
      renderFacts([]);
      return;
    }

    if (titleEl) {
      titleEl.textContent = info.title || tokenLabels.get(tokenId) || defaultInspector.title;
    }
    if (summaryEl) {
      summaryEl.textContent = info.summary || defaultInspector.summary;
    }
    renderFacts(info.facts);
  };

  const setMode = (mode) => {
    modeButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tokenMode === mode);
    });

    tokenGroups.forEach((group) => {
      const isActive = group.dataset.tokenGroup === mode;
      group.hidden = !isActive;
      group.setAttribute('aria-hidden', String(!isActive));
    });

    if (modeDescription) {
      modeDescription.textContent = TOKEN_MODES[mode]?.description || modeDescription.textContent;
    }

    const fallbackToken =
      TOKEN_MODES[mode]?.defaultToken ||
      tokenButtons.find((button) => button.dataset.token?.startsWith(`${mode}-`))?.dataset.token ||
      tokenButtons[0]?.dataset.token;

    if (fallbackToken) {
      setInspector(fallbackToken);
    } else {
      renderFacts([]);
    }
  };

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setMode(button.dataset.tokenMode);
    });
  });

  tokenButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setInspector(button.dataset.token);
    });
  });

  const initialMode =
    modeButtons.find((button) => button.classList.contains('is-active'))?.dataset.tokenMode ||
    modeButtons[0]?.dataset.tokenMode;
  if (initialMode) {
    setMode(initialMode);
  }
}

function setupVectors() {
  const picker = document.querySelector('[data-vector-picker]');
  const buttons = picker ? Array.from(picker.querySelectorAll('[data-vector]')) : [];
  const board = document.querySelector('[data-vector-board]');
  const description = document.querySelector('[data-vector-description]');

  if (!board || buttons.length === 0) return;

  const render = (vectorId) => {
    const config = VECTOR_SETS[vectorId] || VECTOR_SETS.query;

    buttons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.vector === vectorId);
    });

    if (description) {
      description.textContent =
        config?.description ||
        'Each projection highlights what the token wants to read, advertise, or carry into the next layer.';
    }

    board.innerHTML = '';

    const headers = ['Token', ...VECTOR_DIMENSIONS];
    headers.forEach((label, index) => {
      const header = document.createElement('div');
      header.className = index === 0 ? 'vector-board__header vector-board__header--token' : 'vector-board__header';
      header.textContent = label;
      board.appendChild(header);
    });

    VECTOR_TOKENS.forEach((token, rowIndex) => {
      const tokenCell = document.createElement('div');
      tokenCell.className = 'vector-board__token';
      tokenCell.textContent = token;
      board.appendChild(tokenCell);

      const row = config?.matrix?.[rowIndex] || [];
      VECTOR_DIMENSIONS.forEach((_, columnIndex) => {
        const value = row[columnIndex] ?? 0;
        const cell = document.createElement('div');
        cell.className = 'vector-cell';
        const strength = Math.min(Math.abs(value), 1);
        cell.dataset.polarity = value >= 0 ? 'positive' : 'negative';
        cell.style.setProperty('--vector-strength', strength);
        cell.style.setProperty('--vector-position', value >= 0 ? 'left' : 'right');
        const span = document.createElement('span');
        span.className = 'vector-cell__value';
        span.textContent = value.toFixed(2);
        cell.appendChild(span);
        board.appendChild(cell);
      });
    });
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      render(button.dataset.vector);
    });
  });

  const initial = buttons.find((button) => button.classList.contains('is-active'))?.dataset.vector || 'query';
  render(initial);
}

function setupAttention() {
  const headButtons = Array.from(document.querySelectorAll('[data-head]'));
  const queryButtons = Array.from(document.querySelectorAll('[data-query]'));
  const board = document.querySelector('[data-attention-board]');
  const note = document.querySelector('[data-attention-note]');

  if (!board || headButtons.length === 0 || queryButtons.length === 0) return;

  const tokenLabels = new Map();
  document.querySelectorAll('[data-token]').forEach((button) => {
    tokenLabels.set(button.dataset.token, button.textContent.trim());
  });

  let activeHead = headButtons.find((button) => button.classList.contains('is-active'))?.dataset.head || 'semantic';
  let activeQuery = queryButtons.find((button) => button.classList.contains('is-active'))?.dataset.query ||
    queryButtons[0]?.dataset.query;

  const render = () => {
    const head = ATTENTION_HEADS[activeHead] || ATTENTION_HEADS.semantic;
    const focus = head?.focuses?.[activeQuery];

    if (note) {
      note.textContent = focus?.note || head?.description || '';
    }

    board.innerHTML = '';

    ATTENTION_TOKENS.forEach((tokenId) => {
      const row = document.createElement('div');
      row.className = 'attention-bar';

      const label = document.createElement('span');
      label.className = 'attention-bar__label';
      label.textContent = tokenLabels.get(tokenId) || tokenId;

      const track = document.createElement('div');
      track.className = 'attention-bar__track';
      const fill = document.createElement('div');
      fill.className = 'attention-bar__fill';
      const weight = Math.max(Math.min(focus?.weights?.[tokenId] ?? 0, 1), 0);
      fill.style.setProperty('--attention-weight', weight);
      track.appendChild(fill);

      const value = document.createElement('span');
      value.className = 'attention-bar__value';
      value.textContent = `${Math.round(weight * 100)}%`;

      row.append(label, track, value);
      board.appendChild(row);
    });
  };

  headButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeHead = button.dataset.head;
      headButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
      render();
    });
  });

  queryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeQuery = button.dataset.query;
      queryButtons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
      render();
    });
  });

  render();
}

function setupPipeline() {
  const stepsContainer = document.querySelector('[data-pipeline-steps]');
  const buttons = stepsContainer ? Array.from(stepsContainer.querySelectorAll('[data-step]')) : [];
  const titleEl = document.querySelector('[data-pipeline-title]');
  const descriptionEl = document.querySelector('[data-pipeline-description]');
  const highlightsEl = document.querySelector('[data-pipeline-highlights]');
  const chipsEl = document.querySelector('[data-pipeline-chips]');

  if (buttons.length === 0) return;

  const setStep = (stepId) => {
    const step = PIPELINE_STEPS.find((item) => item.id === stepId) || PIPELINE_STEPS[0];

    buttons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.step === step.id);
    });

    if (titleEl) {
      titleEl.textContent = step.title;
    }

    if (descriptionEl) {
      descriptionEl.textContent = step.description;
    }

    if (highlightsEl) {
      highlightsEl.innerHTML = '';
      step.highlights.forEach((highlight) => {
        const item = document.createElement('li');
        item.className = 'pipeline-highlight';
        const strong = document.createElement('strong');
        strong.textContent = highlight.title;
        const detail = document.createElement('span');
        detail.textContent = highlight.detail;
        item.append(strong, detail);
        highlightsEl.appendChild(item);
      });
    }

    if (chipsEl) {
      chipsEl.innerHTML = '';
      step.chips.forEach((chip) => {
        const chipEl = document.createElement('span');
        chipEl.className = 'pipeline-chip';
        chipEl.textContent = chip;
        chipsEl.appendChild(chipEl);
      });
    }
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      setStep(button.dataset.step);
    });
  });

  const initialStep = buttons.find((button) => button.classList.contains('is-active'))?.dataset.step || buttons[0].dataset.step;
  setStep(initialStep);
}

function initTransformerLab() {
  setupStageNavigation();
  setupTokenExplorer();
  setupVectors();
  setupAttention();
  setupPipeline();
}

document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupNav();
  setupBackToTop();
  initTransformerLab();
  if (yearElement) {
    yearElement.textContent = String(new Date().getFullYear());
  }
});
