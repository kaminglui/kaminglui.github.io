const body = document.body;
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
const sectionDropdownToggle = document.querySelector('.nav-dropdown-toggle');
const sectionDropdownMenu = document.getElementById('section-menu');
const sectionDropdownWrapper =
  sectionDropdownToggle instanceof HTMLElement
    ? sectionDropdownToggle.closest('.nav-item--dropdown')
    : null;
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
  const closeDropdown = () => {
    if (sectionDropdownToggle) {
      sectionDropdownToggle.setAttribute('aria-expanded', 'false');
    }
    if (sectionDropdownMenu) {
      sectionDropdownMenu.hidden = true;
    }
    sectionDropdownWrapper?.setAttribute('data-open', 'false');
  };

  const openDropdown = () => {
    if (sectionDropdownToggle) {
      sectionDropdownToggle.setAttribute('aria-expanded', 'true');
    }
    if (sectionDropdownMenu) {
      sectionDropdownMenu.hidden = false;
    }
    sectionDropdownWrapper?.setAttribute('data-open', 'true');
  };

  if (sectionDropdownToggle && sectionDropdownMenu) {
    closeDropdown();

    sectionDropdownToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isExpanded = sectionDropdownToggle.getAttribute('aria-expanded') === 'true';
      if (isExpanded) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    sectionDropdownToggle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (sectionDropdownToggle.getAttribute('aria-expanded') !== 'true') {
          openDropdown();
        }
        const firstLink = sectionDropdownMenu.querySelector('a');
        if (firstLink instanceof HTMLElement) {
          firstLink.focus();
        }
      } else if (event.key === 'Escape') {
        closeDropdown();
      }
    });

    sectionDropdownMenu.addEventListener('click', (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        closeDropdown();
      }
    });

    sectionDropdownMenu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeDropdown();
        sectionDropdownToggle.focus();
      }
    });

    document.addEventListener('click', (event) => {
      if (sectionDropdownWrapper && !sectionDropdownWrapper.contains(event.target)) {
        closeDropdown();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    });
  }

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      closeDropdown();
      navToggle.setAttribute('aria-expanded', String(!isExpanded));
      navLinks?.setAttribute('data-visible', String(!isExpanded));
      body.classList.toggle('nav-open', !isExpanded);
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks?.setAttribute('data-visible', 'false');
        body.classList.remove('nav-open');
        closeDropdown();
        navToggle.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 720) {
        navToggle.setAttribute('aria-expanded', 'false');
        navLinks?.setAttribute('data-visible', 'false');
        body.classList.remove('nav-open');
        closeDropdown();
      }
    });
  }

  navLinks?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle?.setAttribute('aria-expanded', 'false');
      navLinks.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
      closeDropdown();
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

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setupGame() {
  const progressEl = document.querySelector('[data-game-progress]');
  const scoreEl = document.querySelector('[data-game-score]');
  const questionEl = document.querySelector('[data-game-question]');
  const optionsContainer = document.querySelector('[data-game-options]');
  const feedbackEl = document.querySelector('[data-game-feedback]');
  const factEl = document.querySelector('[data-game-fact]');
  const nextButton = document.querySelector('[data-game-next]');
  const restartButton = document.querySelector('[data-game-restart]');
  const summaryEl = document.querySelector('[data-game-summary]');

  if (
    !progressEl ||
    !scoreEl ||
    !questionEl ||
    !optionsContainer ||
    !feedbackEl ||
    !factEl ||
    !nextButton ||
    !restartButton ||
    !summaryEl
  ) {
    return;
  }

  const challenges = [
    {
      prompt:
        'You have thousands of handwritten digit images and want a strong baseline for recognizing each numeral automatically.',
      options: ['Convolutional neural network', 'Decision tree classifier', 'K-means clustering'],
      answer: 0,
      insight:
        'Convolutional neural networks capture spatial hierarchies in pixel grids, making them a go-to choice for vision tasks like digit recognition.',
      tip: 'Pair convolution and pooling layers to learn rich features before the final classifier layer.'
    },
    {
      prompt:
        'A product team wants to understand the key drivers of housing prices from tabular data with many nonlinear relationships.',
      options: ['Gradient boosting regressor', 'Logistic regression', 'Apriori association mining'],
      answer: 0,
      insight:
        'Gradient boosting ensembles handle nonlinear interactions and deliver strong performance on structured regression problems.',
      tip: 'Tune the learning rate and number of trees to balance accuracy with generalization.'
    },
    {
      prompt:
        'You are curating thousands of unlabeled news articles and need to automatically group them by topic for editors.',
      options: ['Latent Dirichlet Allocation', 'Support vector machine', 'Linear regression'],
      answer: 0,
      insight:
        'Latent Dirichlet Allocation discovers topic mixtures in large text corpora without labeled examples, perfect for organizing articles.',
      tip: 'Experiment with the number of topics to find a balance between specificity and interpretability.'
    },
    {
      prompt:
        'Site reliability engineers want early warnings when telemetry shows unusual behavior across hundreds of microservices.',
      options: ['Autoencoder anomaly detector', 'Naive Bayes classifier', 'Principal component regression'],
      answer: 0,
      insight:
        'Training an autoencoder on healthy data lets you flag anomalies when reconstruction error spikes on new telemetry.',
      tip: 'Track the reconstruction loss distribution to set dynamic alert thresholds.'
    },
    {
      prompt:
        'A streaming platform recommends new movies based on what similar viewers enjoyed and the ratings they left.',
      options: ['Matrix factorization recommender', 'Agglomerative clustering', 'Random forest classifier'],
      answer: 0,
      insight:
        'Matrix factorization decomposes the user–item ratings matrix to uncover shared preferences that drive recommendations.',
      tip: 'Regularize latent factors to avoid overfitting to a handful of prolific users.'
    }
  ];

  let rounds = shuffle(challenges);
  let currentIndex = 0;
  let score = 0;
  let answered = false;

  function updateStatus() {
    progressEl.textContent = `Round ${Math.min(currentIndex + 1, rounds.length)} of ${rounds.length}`;
    scoreEl.textContent = `Score: ${score}`;
  }

  function resetFeedback() {
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('game-feedback--correct', 'game-feedback--incorrect');
    factEl.textContent = '';
    factEl.hidden = true;
    nextButton.disabled = true;
    summaryEl.hidden = true;
  }

  function renderChallenge() {
    const challenge = rounds[currentIndex];
    questionEl.textContent = challenge.prompt;
    optionsContainer.innerHTML = '';
    challenge.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'game-option';
      button.dataset.optionIndex = String(index);
      button.textContent = option;
      button.addEventListener('click', handleOptionSelect, { once: false });
      optionsContainer.appendChild(button);
    });
    answered = false;
    resetFeedback();
    updateStatus();
    nextButton.textContent = currentIndex === rounds.length - 1 ? 'See results' : 'Next challenge';
  }

  function handleOptionSelect(event) {
    if (!(event.currentTarget instanceof HTMLButtonElement) || answered) {
      return;
    }

    const button = event.currentTarget;
    const selectedIndex = Number(button.dataset.optionIndex ?? '-1');
    const challenge = rounds[currentIndex];
    const isCorrect = selectedIndex === challenge.answer;
    const optionButtons = Array.from(optionsContainer.querySelectorAll('button'));

    optionButtons.forEach((optionButton, index) => {
      optionButton.disabled = true;
      if (index === challenge.answer) {
        optionButton.classList.add('game-option--correct');
      }
      if (index === selectedIndex && !isCorrect) {
        optionButton.classList.add('game-option--incorrect');
      }
    });

    if (isCorrect) {
      score += 1;
      feedbackEl.textContent = `Correct! ${challenge.insight}`;
      feedbackEl.classList.add('game-feedback--correct');
    } else {
      feedbackEl.textContent = `Not quite. ${challenge.insight}`;
      feedbackEl.classList.add('game-feedback--incorrect');
    }

    if (challenge.tip) {
      factEl.textContent = challenge.tip;
      factEl.hidden = false;
    }

    answered = true;
    nextButton.disabled = false;
    updateStatus();
    nextButton.focus();
  }

  function showSummary() {
    progressEl.textContent = 'Summary';
    scoreEl.textContent = `Final score: ${score} / ${rounds.length}`;
    questionEl.textContent = 'Nice work!';
    optionsContainer.innerHTML = '';
    resetFeedback();
    feedbackEl.textContent = '';

    const perfect = score === rounds.length;
    const strong = score >= Math.ceil(rounds.length * 0.6);
    let message = `You matched ${score} out of ${rounds.length} scenarios.`;
    if (perfect) {
      message += ' Flawless instincts!';
    } else if (strong) {
      message += ' Solid ML intuition—can you hit a perfect score next time?';
    } else {
      message += ' Keep experimenting and try again to improve your mental model toolbox.';
    }

    summaryEl.hidden = false;
    summaryEl.textContent = message;
    nextButton.hidden = true;
    restartButton.hidden = false;
    restartButton.focus();
  }

  function handleNext() {
    if (!answered) return;
    if (currentIndex === rounds.length - 1) {
      showSummary();
      return;
    }
    currentIndex += 1;
    renderChallenge();
  }

  function startGame() {
    rounds = shuffle(challenges);
    currentIndex = 0;
    score = 0;
    summaryEl.hidden = true;
    nextButton.hidden = false;
    restartButton.hidden = true;
    nextButton.disabled = true;
    nextButton.textContent = 'Next challenge';
    renderChallenge();
  }

  nextButton.addEventListener('click', handleNext);
  restartButton.addEventListener('click', () => {
    startGame();
    const firstOption = optionsContainer.querySelector('button');
    if (firstOption instanceof HTMLElement) {
      firstOption.focus();
    }
  });

  startGame();
}

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

setupNav();
setupTheme();
setupBackToTop();
setupGame();
