// Restored main interaction script after asset cleanup.
import { defaultContent } from './content.js';

const STORAGE_KEY = 'kaminglui-site-content-v1';
const EDIT_VISIBILITY_KEY = 'kaminglui-site-edit-visible';

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (error) {
      console.warn('structuredClone failed, using JSON fallback.', error);
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2, 10)}`;

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'per',
  'the',
  'to',
  'via',
  'vs'
]);

function capitalizeWord(word) {
  if (!word) return word;
  const firstLetterIndex = word.search(/[A-Za-z0-9]/);
  if (firstLetterIndex === -1) return word;
  const leading = word.slice(0, firstLetterIndex);
  const firstChar = word.charAt(firstLetterIndex).toUpperCase();
  const remainder = word.slice(firstLetterIndex + 1);
  const normalizedRemainder =
    remainder === remainder.toLowerCase() ? remainder.toLowerCase() : remainder;
  return leading + firstChar + normalizedRemainder;
}

function formatTitleCase(text) {
  if (typeof text !== 'string') return text;
  if (!text.trim()) return text;

  const tokens = text.split(/(\s+)/);
  let processedWords = 0;
  const totalWords = tokens.reduce(
    (count, token) => (token.trim() ? count + 1 : count),
    0
  );

  return tokens
    .map((token) => {
      if (!token.trim()) {
        return token;
      }

      processedWords += 1;

      const prefixMatch = token.match(/^[^A-Za-z0-9']+/);
      const suffixMatch = token.match(/[^A-Za-z0-9']+$/);
      const prefix = prefixMatch ? prefixMatch[0] : '';
      const suffix = suffixMatch ? suffixMatch[0] : '';
      const core = token.slice(prefix.length, token.length - suffix.length);

      if (!core) {
        return token;
      }

      const normalizedCore = core.toLowerCase();
      const shouldCapitalize =
        processedWords === 1 ||
        processedWords === totalWords ||
        !SMALL_WORDS.has(normalizedCore);

      let transformedCore = normalizedCore;

      if (shouldCapitalize) {
        if (core.includes('-')) {
          transformedCore = core
            .split(/(-)/)
            .map((part) => (part === '-' ? part : capitalizeWord(part)))
            .join('');
        } else {
          transformedCore = capitalizeWord(core);
        }
      }

      return prefix + transformedCore + suffix;
    })
    .join('');
}

const body = document.body;
const yearElement = document.querySelector('#year');
let editToggle = null;
const editToolbar = document.querySelector('.edit-toolbar');
const manageDialog = document.getElementById('manage-dialog');

const dialogs = {
  intro: document.getElementById('intro-editor'),
  about: document.getElementById('about-editor'),
  learning: document.getElementById('learning-editor'),
  posts: document.getElementById('posts-editor'),
  projects: document.getElementById('projects-editor'),
  sidebar: document.getElementById('sidebar-editor')
};

const heroElements = {
  eyebrow: document.querySelector('[data-content="hero.eyebrow"]'),
  title: document.querySelector('[data-content="hero.title"]'),
  lead: document.querySelector('[data-content="hero.lead"]'),
  primary: document.querySelector('[data-action="primary"]'),
  secondary: document.querySelector('[data-action="secondary"]'),
  current: document.getElementById('hero-current'),
  focus: document.getElementById('hero-focus')
};

const aboutElements = {
  title: document.querySelector('[data-content="about.title"]'),
  body: document.getElementById('about-body')
};

const learningElements = {
  title: document.querySelector('[data-content="learning.title"]'),
  list: document.getElementById('learning-list'),
  empty: document.getElementById('learning-empty')
};

const postElements = {
  title: document.querySelector('[data-content="posts.title"]'),
  cta: document.querySelector('[data-action="posts"]'),
  list: document.getElementById('post-list'),
  empty: document.getElementById('posts-empty')
};

const projectElements = {
  title: document.querySelector('[data-content="projects.title"]'),
  list: document.getElementById('project-list'),
  empty: document.getElementById('projects-empty')
};

const sidebarElements = {
  container: document.getElementById('sidebar-blocks'),
  empty: document.getElementById('sidebar-empty')
};

const contactElements = {
  title: document.querySelector('[data-content="contact.title"]'),
  body: document.querySelector('[data-content="contact.body"]'),
  actions: document.querySelector('[data-contact-actions]'),
  meta: document.querySelector('[data-content="contact.meta"]')
};

const backToTopLink = document.querySelector('.back-to-top');
const prefersReducedMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

const experienceElements = {
  list: document.getElementById('experience-list'),
  empty: document.getElementById('experience-empty')
};

const educationElements = {
  list: document.getElementById('education-list'),
  empty: document.getElementById('education-empty')
};

let editMode = false;
let editToolsEnabled = false;
let content = hydrateContent();

if (typeof window !== 'undefined') {
  editToolsEnabled = window.sessionStorage.getItem(EDIT_VISIBILITY_KEY) === 'true';
  const params = new URLSearchParams(window.location.search);
  if (params.has('edit')) {
    editToolsEnabled = true;
    try {
      window.sessionStorage.setItem(EDIT_VISIBILITY_KEY, 'true');
    } catch (error) {
      console.warn('Unable to persist edit mode.', error);
    }
  }
}

function hydrateContent() {
  if (typeof window === 'undefined') return clone(defaultContent);
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return clone(defaultContent);
  try {
    const parsed = JSON.parse(stored);
    return mergeContent(clone(defaultContent), parsed);
  } catch (error) {
    console.warn('Unable to parse stored content, using defaults.', error);
    return clone(defaultContent);
  }
}

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function mergeContent(base, incoming) {
  if (!incoming || typeof incoming !== 'object') return base;
  Object.entries(incoming).forEach(([key, value]) => {
    if (UNSAFE_KEYS.has(key)) return;
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) return;
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      base[key] = value;
    } else if (typeof value === 'object') {
      const baseValue = typeof base[key] === 'object' && base[key] !== null ? clone(base[key]) : {};
      base[key] = mergeContent(baseValue, value);
    } else {
      base[key] = value;
    }
  });
  return base;
}

function persistContent() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  } catch (error) {
    console.warn('Unable to persist content to localStorage.', error);
  }
}

function renderList(container, items) {
  if (!container) return;
  container.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderHero() {
  heroElements.eyebrow.textContent = content.hero.eyebrow;
  heroElements.title.textContent = formatTitleCase(content.hero.title);
  heroElements.lead.textContent = content.hero.lead;
  heroElements.primary.textContent = content.hero.primary.label;
  heroElements.primary.href = content.hero.primary.url;
  heroElements.secondary.textContent = content.hero.secondary.label;
  heroElements.secondary.href = content.hero.secondary.url;
  renderList(heroElements.current, content.hero.current);
  renderList(heroElements.focus, content.hero.focus);
}

function renderAbout() {
  aboutElements.title.textContent = formatTitleCase(content.about.title);
  aboutElements.body.innerHTML = '';
  content.about.paragraphs.forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph;
    aboutElements.body.appendChild(p);
  });
}

function renderLearning() {
  if (!learningElements.title || !learningElements.list || !learningElements.empty) return;
  learningElements.title.textContent = formatTitleCase(content.learning.title);
  renderList(learningElements.list, content.learning.topics);
  learningElements.empty.hidden = content.learning.topics.length > 0;
}

function renderPosts() {
  if (!postElements.title || !postElements.list || !postElements.empty) return;
  postElements.title.textContent = formatTitleCase(content.posts.title);
  postElements.cta.textContent = content.posts.ctaLabel;
  postElements.cta.href = content.posts.ctaUrl;
  postElements.list.innerHTML = '';

  content.posts.entries.forEach((entry) => {
    const article = document.createElement('article');
    article.className = 'post-card';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'post-card__eyebrow';
    eyebrow.textContent = entry.eyebrow;

    const title = document.createElement('h3');
    title.className = 'post-card__title';
    title.textContent = formatTitleCase(entry.title);

    const summary = document.createElement('p');
    summary.textContent = entry.summary;

    const time = document.createElement('time');
    time.dateTime = entry.date;
    time.textContent = formatDate(entry.date);

    article.append(eyebrow, title, summary, time);
    postElements.list.appendChild(article);
  });

  postElements.empty.hidden = content.posts.entries.length > 0;
}

function renderProjects() {
  if (!projectElements.title || !projectElements.list || !projectElements.empty) return;
  projectElements.title.textContent = formatTitleCase(content.projects.title);
  projectElements.list.innerHTML = '';

  content.projects.items.forEach((project) => {
    const card = document.createElement('article');
    card.className = 'project-card';

    const title = document.createElement('h3');
    title.className = 'project-card__title';
    title.textContent = formatTitleCase(project.title);

    const summary = document.createElement('p');
    summary.textContent = project.summary;

    card.append(title, summary);

    if (project.highlights?.length) {
      const list = document.createElement('ul');
      project.highlights.forEach((highlight) => {
        const li = document.createElement('li');
        li.textContent = highlight;
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    projectElements.list.appendChild(card);
  });

  projectElements.empty.hidden = content.projects.items.length > 0;
}

function renderSidebar() {
  sidebarElements.container.innerHTML = '';
  content.sidebar.blocks.forEach((block) => {
    const section = document.createElement('article');
    section.className = 'sidebar-block';

    const title = document.createElement('h3');
    title.textContent = formatTitleCase(block.title);
    section.appendChild(title);

    if (block.type === 'list' && block.items?.length) {
      const list = document.createElement('ul');
      block.items.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      section.appendChild(list);
    } else if (block.type === 'text' && block.body) {
      const paragraph = document.createElement('p');
      paragraph.textContent = block.body;
      section.appendChild(paragraph);
    }

    sidebarElements.container.appendChild(section);
  });

  sidebarElements.empty.hidden = content.sidebar.blocks.length > 0;
}

function renderContact() {
  contactElements.title.textContent = formatTitleCase(content.contact.title);
  contactElements.body.textContent = content.contact.body;
  if (contactElements.actions) {
    contactElements.actions.innerHTML = '';
    const actions = [];
    if (content.contact.primary?.label && content.contact.primary?.url) {
      actions.push({
        ...content.contact.primary,
        variant: 'button--primary'
      });
    }
    if (content.contact.secondary?.label && content.contact.secondary?.url) {
      actions.push({
        ...content.contact.secondary,
        variant: 'button--ghost'
      });
    }
    actions.forEach((action, index) => {
      const link = document.createElement('a');
      const variant = action.variant || (index === 0 ? 'button--primary' : 'button--ghost');
      link.className = `button ${variant}`;
      link.href = action.url;
      link.textContent = action.label;
      contactElements.actions.appendChild(link);
    });
    contactElements.actions.hidden = actions.length === 0;
  }
  contactElements.meta.textContent = content.contact.meta;
}

function renderExperience() {
  if (!experienceElements.list) return;
  experienceElements.list.innerHTML = '';
  content.experience.positions.forEach((item) => {
    experienceElements.list.appendChild(createTimelineItem(item));
  });
  if (experienceElements.empty) {
    experienceElements.empty.hidden = content.experience.positions.length > 0;
  }
}

function renderEducation() {
  if (!educationElements.list) return;
  educationElements.list.innerHTML = '';
  content.experience.education.forEach((item) => {
    educationElements.list.appendChild(createTimelineItem(item));
  });
  if (educationElements.empty) {
    educationElements.empty.hidden = content.experience.education.length > 0;
  }
}

function createTimelineItem(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'timeline__item';
  wrapper.setAttribute('role', 'listitem');

  const marker = document.createElement('div');
  marker.className = 'timeline__marker';
  marker.setAttribute('aria-hidden', 'true');

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'timeline__content';

  const title = document.createElement('h3');
  title.className = 'timeline__title';
  title.textContent = formatTitleCase(item.title);

  const subtitle = document.createElement('p');
  subtitle.className = 'timeline__role';
  subtitle.textContent = item.subtitle;

  contentWrapper.append(title, subtitle);

  if (item.description) {
    const description = document.createElement('p');
    description.textContent = item.description;
    contentWrapper.appendChild(description);
  }

  wrapper.append(marker, contentWrapper);
  return wrapper;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

function renderAll() {
  renderHero();
  renderAbout();
  renderLearning();
  renderPosts();
  renderProjects();
  renderSidebar();
  renderContact();
  renderExperience();
  renderEducation();
}

function setupBackToTop() {
  if (!backToTopLink) return;

  backToTopLink.addEventListener('click', (event) => {
    event.preventDefault();

    const behavior = prefersReducedMotion?.matches ? 'auto' : 'smooth';
    const scrollTarget =
      typeof document !== 'undefined'
        ? document.scrollingElement || document.documentElement || document.body
        : null;
    const scrollOptions = { top: 0, left: 0, behavior };

    try {
      if (scrollTarget && typeof scrollTarget.scrollTo === 'function') {
        scrollTarget.scrollTo(scrollOptions);
      } else if (typeof window.scrollTo === 'function') {
        window.scrollTo(scrollOptions);
      } else if (scrollTarget) {
        scrollTarget.scrollTop = 0;
        if ('scrollLeft' in scrollTarget) {
          scrollTarget.scrollLeft = 0;
        }
      }
    } catch (error) {
      console.warn('Smooth scroll failed, using instant fallback.', error);
      if (scrollTarget) {
        scrollTarget.scrollTop = 0;
        if ('scrollLeft' in scrollTarget) {
          scrollTarget.scrollLeft = 0;
        }
      } else if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
      }
    }

    if (typeof window !== 'undefined') {
      if (typeof window.history?.replaceState === 'function') {
        window.history.replaceState(null, '', '#top');
      } else {
        window.location.hash = 'top';
      }
    }
  });
}

function applyEditToggleVisibility() {
  if (editToggle) {
    editToggle.hidden = !editToolsEnabled;
    if (!editToolsEnabled) {
      editMode = false;
      editToggle.setAttribute('aria-pressed', 'false');
    }
  }
  if (editToolbar) {
    editToolbar.hidden = !editToolsEnabled || !editMode;
  }
}

function setupManagementDialog() {
  if (!manageDialog) {
    applyEditToggleVisibility();
    return;
  }

  const openManageDialog = () => {
    if (typeof manageDialog.showModal === 'function') {
      manageDialog.showModal();
    }
  };

  window.addEventListener('keydown', (event) => {
    const key = event.key?.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'm') {
      event.preventDefault();
      openManageDialog();
    }
  });

  manageDialog.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    if (target.dataset.action === 'enable-edit') {
      editToolsEnabled = true;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(EDIT_VISIBILITY_KEY, 'true');
      }
      applyEditToggleVisibility();
      manageDialog.close('enabled');
      editToggle?.focus();
      return;
    }

    if (target.dataset.action === 'disable-edit') {
      editToolsEnabled = false;
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(EDIT_VISIBILITY_KEY);
      }
      applyEditToggleVisibility();
    }
  });

  applyEditToggleVisibility();
}

function setupEditors() {
  if (!editToggle || !editToolbar) return;

  editToggle.addEventListener('click', () => {
    if (!editToolsEnabled) return;
    editMode = !editMode;
    editToggle.setAttribute('aria-pressed', String(editMode));
    editToolbar.hidden = !editMode;
    if (editMode) {
      editToolbar.querySelector('button')?.focus();
    }
  });

  editToolbar.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const editor = target.dataset.editor;
    if (editor && dialogs[editor]) {
      openEditor(editor);
      return;
    }

    if (target.dataset.action === 'reset') {
      if (window.confirm('Reset to default content? This will clear your stored edits.')) {
        window.localStorage.removeItem(STORAGE_KEY);
        content = structuredClone(defaultContent);
        renderAll();
      }
    }
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const dialog = event.target.closest('dialog');
      if (dialog instanceof HTMLDialogElement) {
        dialog.close();
      }
    });
  });

  setupSimpleEditors();
  setupCollectionEditors();

  applyEditToggleVisibility();
}

function openEditor(type) {
  const dialog = dialogs[type];
  if (!dialog) return;
  populateForm(type);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function populateForm(type) {
  editors[type]?.populate();
}

const editors = Object.create(null);

function bindSimpleEditor({ key, formSelector, load, save, render }) {
  const dialog = dialogs[key];
  if (!dialog) return null;
  const form = dialog.querySelector(formSelector);
  if (!form) return null;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save(form);
    persistContent();
    render();
    dialog.close();
  });
  return { populate: () => load(form) };
}

function setupSimpleEditors() {
  editors.intro = bindSimpleEditor({
    key: 'intro',
    formSelector: '[data-form="intro"]',
    load(form) {
      setFieldValue(form, 'eyebrow', content.hero.eyebrow);
      setFieldValue(form, 'title', content.hero.title);
      setFieldValue(form, 'lead', content.hero.lead);
      setFieldValue(form, 'primaryLabel', content.hero.primary.label);
      setFieldValue(form, 'primaryUrl', content.hero.primary.url);
      setFieldValue(form, 'secondaryLabel', content.hero.secondary.label);
      setFieldValue(form, 'secondaryUrl', content.hero.secondary.url);
      setFieldValue(form, 'current', joinLines(content.hero.current));
      setFieldValue(form, 'focus', joinLines(content.hero.focus));
    },
    save(form) {
      content.hero.eyebrow = getFieldValue(form, 'eyebrow');
      content.hero.title = getFieldValue(form, 'title');
      content.hero.lead = getFieldValue(form, 'lead');
      content.hero.primary = {
        label: getFieldValue(form, 'primaryLabel'),
        url: getFieldValue(form, 'primaryUrl')
      };
      content.hero.secondary = {
        label: getFieldValue(form, 'secondaryLabel'),
        url: getFieldValue(form, 'secondaryUrl')
      };
      content.hero.current = splitLines(getFieldValue(form, 'current'));
      content.hero.focus = splitLines(getFieldValue(form, 'focus'));
    },
    render: renderHero
  });

  editors.about = bindSimpleEditor({
    key: 'about',
    formSelector: '[data-form="about"]',
    load(form) {
      setFieldValue(form, 'title', content.about.title);
      setFieldValue(form, 'paragraphs', joinLines(content.about.paragraphs));
    },
    save(form) {
      content.about.title = getFieldValue(form, 'title');
      content.about.paragraphs = splitLines(getFieldValue(form, 'paragraphs'));
    },
    render: renderAbout
  });

  editors.learning = bindSimpleEditor({
    key: 'learning',
    formSelector: '[data-form="learning"]',
    load(form) {
      setFieldValue(form, 'title', content.learning.title);
      setFieldValue(form, 'topics', joinLines(content.learning.topics));
    },
    save(form) {
      content.learning.title = getFieldValue(form, 'title');
      content.learning.topics = splitLines(getFieldValue(form, 'topics'));
    },
    render: renderLearning
  });
}

function bindCollectionEditor({
  key,
  formSelector,
  listSelector,
  getItems,
  getMeta,
  setMeta,
  loadItem,
  readItem,
  loadMeta,
  readMeta,
  newItem = () => ({}),
  listLabel,
  render
}) {
  const wrapper = dialogs[key];
  if (!wrapper) return null;
  const form = wrapper.querySelector(formSelector);
  const list = wrapper.querySelector(listSelector);
  if (!form || !list) return null;

  let selectedIndex = -1;

  const applyDetail = (item) => loadItem(form, item || {});
  const applyMeta = () => {
    if (loadMeta && getMeta) loadMeta(form, getMeta());
  };

  const populate = () => {
    const items = getItems();
    applyMeta();

    list.innerHTML = '';
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = listLabel(item, index);
      button.dataset.index = String(index);
      list.appendChild(button);
    });

    if (items.length && selectedIndex === -1) selectedIndex = 0;
    if (selectedIndex >= items.length) selectedIndex = items.length - 1;

    applyDetail(selectedIndex >= 0 ? items[selectedIndex] : null);
    updateSelectionState(list, selectedIndex);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const items = getItems();
    const current = selectedIndex >= 0 ? items[selectedIndex] : null;
    const next = readItem(form, current);
    if (selectedIndex >= 0) {
      items[selectedIndex] = next;
    } else {
      items.push(next);
      selectedIndex = items.length - 1;
    }
    if (readMeta && setMeta) setMeta(readMeta(form));
    persistContent();
    render();
    populate();
  });

  form.querySelector('[data-command="new"]')?.addEventListener('click', () => {
    selectedIndex = -1;
    applyMeta();
    applyDetail(newItem());
    updateSelectionState(list, -1);
  });

  form.querySelector('[data-command="delete"]')?.addEventListener('click', () => {
    if (selectedIndex < 0) return;
    getItems().splice(selectedIndex, 1);
    selectedIndex = -1;
    persistContent();
    render();
    populate();
  });

  form.querySelector('[data-command="cancel"]')?.addEventListener('click', () => {
    wrapper.close();
  });

  list.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    selectedIndex = Number(event.target.dataset.index);
    applyMeta();
    applyDetail(getItems()[selectedIndex]);
    updateSelectionState(list, selectedIndex);
  });

  return { populate };
}

function updateSidebarMode(details, mode) {
  if (!details) return;
  details.dataset.mode = mode;
}

function setupCollectionEditors() {
  editors.posts = bindCollectionEditor({
    key: 'posts',
    formSelector: '.posts-editor__form',
    listSelector: '.posts-editor__list',
    getItems: () => content.posts.entries,
    getMeta: () => ({
      title: content.posts.title,
      ctaLabel: content.posts.ctaLabel,
      ctaUrl: content.posts.ctaUrl
    }),
    setMeta: (meta) => {
      content.posts.title = meta.title;
      content.posts.ctaLabel = meta.ctaLabel;
      content.posts.ctaUrl = meta.ctaUrl;
    },
    loadMeta: (form, meta) => {
      setFieldValue(form, 'title', meta.title);
      setFieldValue(form, 'ctaLabel', meta.ctaLabel);
      setFieldValue(form, 'ctaUrl', meta.ctaUrl);
    },
    readMeta: (form) => ({
      title: getFieldValue(form, 'title'),
      ctaLabel: getFieldValue(form, 'ctaLabel'),
      ctaUrl: getFieldValue(form, 'ctaUrl')
    }),
    loadItem: (form, entry) => {
      setFieldValue(form, 'eyebrow', entry.eyebrow || '');
      setFieldValue(form, 'postTitle', entry.title || '');
      setFieldValue(form, 'summary', entry.summary || '');
      setFieldValue(form, 'date', entry.date || '');
    },
    readItem: (form) => ({
      eyebrow: getFieldValue(form, 'eyebrow'),
      title: getFieldValue(form, 'postTitle'),
      summary: getFieldValue(form, 'summary'),
      date: getFieldValue(form, 'date')
    }),
    listLabel: (entry, index) => entry.title || `Post ${index + 1}`,
    render: renderPosts
  });

  editors.projects = bindCollectionEditor({
    key: 'projects',
    formSelector: '.projects-editor__form',
    listSelector: '.projects-editor__list',
    getItems: () => content.projects.items,
    getMeta: () => ({ title: content.projects.title }),
    setMeta: (meta) => { content.projects.title = meta.title; },
    loadMeta: (form, meta) => setFieldValue(form, 'title', meta.title),
    readMeta: (form) => ({ title: getFieldValue(form, 'title') }),
    loadItem: (form, project) => {
      setFieldValue(form, 'projectTitle', project.title || '');
      setFieldValue(form, 'summary', project.summary || '');
      setFieldValue(form, 'highlights', joinLines(project.highlights || []));
    },
    readItem: (form) => ({
      title: getFieldValue(form, 'projectTitle'),
      summary: getFieldValue(form, 'summary'),
      highlights: splitLines(getFieldValue(form, 'highlights'))
    }),
    listLabel: (project, index) => project.title || `Project ${index + 1}`,
    render: renderProjects
  });

  const sidebarDetails = dialogs.sidebar?.querySelector('.sidebar-editor__details');

  editors.sidebar = bindCollectionEditor({
    key: 'sidebar',
    formSelector: '.sidebar-editor__form',
    listSelector: '.sidebar-editor__list',
    getItems: () => content.sidebar.blocks,
    loadItem: (form, block) => {
      setFieldValue(form, 'blockTitle', block.title || '');
      setFieldValue(form, 'blockType', block.type || 'text');
      setFieldValue(form, 'blockBody', block.body || '');
      setFieldValue(form, 'blockItems', joinLines(block.items || []));
      updateSidebarMode(sidebarDetails, block.type || 'text');
    },
    readItem: (form, current) => {
      const type = getFieldValue(form, 'blockType');
      return {
        id: current?.id || createId(),
        title: getFieldValue(form, 'blockTitle'),
        type,
        body: type === 'text' ? (getFieldValue(form, 'blockBody') || '') : '',
        items: type === 'list' ? splitLines(getFieldValue(form, 'blockItems')) : []
      };
    },
    newItem: () => ({ id: createId() }),
    listLabel: (block, index) => block.title || `Block ${index + 1}`,
    render: renderSidebar
  });

  const sidebarForm = dialogs.sidebar?.querySelector('.sidebar-editor__form');
  sidebarForm?.elements?.namedItem('blockType')?.addEventListener('change', (event) => {
    updateSidebarMode(sidebarDetails, event.target.value);
  });
}

function updateSelectionState(list, index) {
  list.querySelectorAll('button').forEach((button) => {
    button.removeAttribute('aria-selected');
  });
  if (index >= 0) {
    const selected = list.querySelector(`button[data-index="${index}"]`);
    selected?.setAttribute('aria-selected', 'true');
  }
}

function splitLines(value) {
  if (!value) return [];
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(list) {
  return Array.isArray(list) ? list.join('\n') : '';
}

function setFieldValue(form, name, value) {
  const field = form?.elements?.namedItem?.(name);
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    field.value = value ?? '';
  }
}

function getFieldValue(form, name) {
  const field = form?.elements?.namedItem?.(name);
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ) {
    return field.value;
  }
  return '';
}

// Placeholder sections (learning / posts / projects) were removed from the
// home page; their renderers are skipped when their DOM scaffold isn't
// present, so the scaffold check now only requires elements that are
// actually rendered.
const hasContentScaffold = Boolean(
  heroElements.eyebrow &&
  heroElements.title &&
  heroElements.lead &&
  heroElements.primary &&
  heroElements.secondary &&
  heroElements.current &&
  heroElements.focus &&
  aboutElements.title &&
  aboutElements.body &&
  sidebarElements.container &&
  sidebarElements.empty &&
  contactElements.title &&
  contactElements.body &&
  contactElements.actions &&
  contactElements.meta
);

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

editToggle = document.querySelector('.edit-toggle');
setupBackToTop();

if (hasContentScaffold) {
  renderAll();
  setupManagementDialog();
  setupEditors();
}
