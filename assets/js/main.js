// Restored main interaction script after asset cleanup.
import { defaultContent } from './content.js';

const STORAGE_KEY = 'kaminglui-site-content-v1';
const EDIT_VISIBILITY_KEY = 'kaminglui-site-edit-visible';
const LINKEDIN_VANITY = 'ka-ming-lui';
const LINKEDIN_PROXY = `https://r.jina.ai/https://www.linkedin.com/in/${LINKEDIN_VANITY}/`;

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

const body = document.body;
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
const themeToggle = document.querySelector('.theme-toggle');
const yearElement = document.querySelector('#year');
const editToggle = document.querySelector('.edit-toggle');
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

function mergeContent(base, incoming) {
  Object.entries(incoming).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      base[key] = value;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
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

function setTheme(isDark) {
  body.classList.toggle('theme-dark', isDark);
  body.classList.toggle('theme-light', !isDark);
  if (themeToggle) {
    themeToggle.innerHTML = isDark ? '<span aria-hidden="true">☀️</span>' : '<span aria-hidden="true">🌙</span>';
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
  heroElements.title.textContent = content.hero.title;
  heroElements.lead.textContent = content.hero.lead;
  heroElements.primary.textContent = content.hero.primary.label;
  heroElements.primary.href = content.hero.primary.url;
  heroElements.secondary.textContent = content.hero.secondary.label;
  heroElements.secondary.href = content.hero.secondary.url;
  renderList(heroElements.current, content.hero.current);
  renderList(heroElements.focus, content.hero.focus);
}

function renderAbout() {
  aboutElements.title.textContent = content.about.title;
  aboutElements.body.innerHTML = '';
  content.about.paragraphs.forEach((paragraph) => {
    const p = document.createElement('p');
    p.textContent = paragraph;
    aboutElements.body.appendChild(p);
  });
}

function renderLearning() {
  learningElements.title.textContent = content.learning.title;
  renderList(learningElements.list, content.learning.topics);
  learningElements.empty.hidden = content.learning.topics.length > 0;
}

function renderPosts() {
  postElements.title.textContent = content.posts.title;
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
    title.textContent = entry.title;

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
  projectElements.title.textContent = content.projects.title;
  projectElements.list.innerHTML = '';

  content.projects.items.forEach((project) => {
    const card = document.createElement('article');
    card.className = 'project-card';

    const title = document.createElement('h3');
    title.className = 'project-card__title';
    title.textContent = project.title;

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
    title.textContent = block.title;
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
  contactElements.title.textContent = content.contact.title;
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

function renderExperienceFallback() {
  if (!experienceElements.list) return;
  experienceElements.list.innerHTML = '';
  content.experienceFallback.positions.forEach((item) => {
    experienceElements.list.appendChild(createTimelineItem(item));
  });
  if (experienceElements.empty) {
    experienceElements.empty.hidden = content.experienceFallback.positions.length > 0;
  }
}

function renderEducationFallback() {
  if (!educationElements.list) return;
  educationElements.list.innerHTML = '';
  content.experienceFallback.education.forEach((item) => {
    educationElements.list.appendChild(createTimelineItem(item));
  });
  if (educationElements.empty) {
    educationElements.empty.hidden = content.experienceFallback.education.length > 0;
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
  title.textContent = item.title;

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

async function populateExperienceFromLinkedIn() {
  if (!experienceElements.list || !educationElements.list) return;
  renderExperienceFallback();
  renderEducationFallback();
  try {
    const response = await fetch(LINKEDIN_PROXY, {
      headers: {
        'Accept-Language': 'en-US'
      }
    });
    if (!response.ok) {
      throw new Error(`LinkedIn request failed with status ${response.status}`);
    }
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const data = extractLinkedInData(doc);
    if (!data.positions.length && !data.education.length) {
      throw new Error('No experience or education data detected.');
    }

    if (data.positions.length) {
      experienceElements.list.innerHTML = '';
      data.positions.forEach((position) => {
        experienceElements.list.appendChild(
          createTimelineItem({
            title: position.companyName || position.title || 'Experience',
            subtitle: buildPositionSubtitle(position),
            description: position.description || ''
          })
        );
      });
      if (experienceElements.empty) {
        experienceElements.empty.hidden = true;
      }
    } else {
      renderExperienceFallback();
    }

    if (data.education.length) {
      educationElements.list.innerHTML = '';
      data.education.forEach((education) => {
        educationElements.list.appendChild(
          createTimelineItem({
            title: education.schoolName || 'Education',
            subtitle: buildEducationSubtitle(education),
            description: education.description || education.degreeName || ''
          })
        );
      });
      if (educationElements.empty) {
        educationElements.empty.hidden = true;
      }
    } else {
      renderEducationFallback();
    }
  } catch (error) {
    console.warn('Falling back to local experience data.', error);
    renderExperienceFallback();
    renderEducationFallback();
  }
}

function extractLinkedInData(doc) {
  const positions = [];
  const education = [];

  const jsonNodes = [...doc.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__')];
  jsonNodes.forEach((node) => {
    try {
      const json = JSON.parse(node.textContent || '{}');
      traverse(json, (value) => {
        if (value && typeof value === 'object') {
          if (value.companyName && value.title) {
            positions.push(value);
          }
          if (value.schoolName && (value.degreeName || value.timePeriod)) {
            education.push(value);
          }
        }
      });
    } catch (error) {
      // ignore individual parse errors
    }
  });

  if (!positions.length || !education.length) {
    const experienceSection = doc.querySelector('[data-section="experience"], section[id*="experience"]');
    if (experienceSection) {
      positions.push(
        ...[...experienceSection.querySelectorAll('li')].map((item) => ({
          companyName: item.querySelector('h3, h4')?.textContent?.trim(),
          title: item.querySelector('span')?.textContent?.trim(),
          description: item.querySelector('p')?.textContent?.trim() || ''
        }))
      );
    }

    const educationSection = doc.querySelector('[data-section="education"], section[id*="education"]');
    if (educationSection) {
      education.push(
        ...[...educationSection.querySelectorAll('li')].map((item) => ({
          schoolName: item.querySelector('h3, h4')?.textContent?.trim(),
          degreeName: item.querySelector('span')?.textContent?.trim(),
          description: item.querySelector('p')?.textContent?.trim() || ''
        }))
      );
    }
  }

  return {
    positions: dedupeLinkedInEntries(positions, (entry) => `${entry.companyName}|${entry.title}`),
    education: dedupeLinkedInEntries(education, (entry) => `${entry.schoolName}|${entry.degreeName}`)
  };
}

function traverse(value, callback) {
  if (Array.isArray(value)) {
    value.forEach((item) => traverse(item, callback));
    return;
  }
  if (value && typeof value === 'object') {
    callback(value);
    Object.values(value).forEach((item) => traverse(item, callback));
  }
}

function dedupeLinkedInEntries(entries, keyFn) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = keyFn(entry || {});
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPositionSubtitle(position) {
  const role = position.title || '';
  const time = formatLinkedInTime(position.timePeriod);
  const location = position.geoLocationName ? ` · ${position.geoLocationName}` : '';
  return [role, time].filter(Boolean).join(' · ') + location;
}

function buildEducationSubtitle(education) {
  const degree = education.degreeName || education.fieldOfStudy || '';
  const time = formatLinkedInTime(education.timePeriod);
  return [degree, time].filter(Boolean).join(' · ');
}

function formatLinkedInTime(period) {
  if (!period) return '';
  const start = formatLinkedInDate(period.startDate);
  const end = formatLinkedInDate(period.endDate) || (period.endDate === null ? 'Present' : 'Present');
  if (start && end) return `${start} — ${end}`;
  return start || end;
}

function formatLinkedInDate(date) {
  if (!date) return '';
  const { year, month } = date;
  if (!year) return '';
  if (!month) return String(year);
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1));
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
}

function setupNav() {
  if (!navToggle) return;
  navToggle.addEventListener('click', () => {
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isExpanded));
    navLinks?.setAttribute('data-visible', String(!isExpanded));
    body.classList.toggle('nav-open', !isExpanded);
  });

  navLinks?.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks?.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
      navToggle.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 720) {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks?.setAttribute('data-visible', 'false');
      body.classList.remove('nav-open');
    }
  });
}

function setupTheme() {
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

  themeToggle?.addEventListener('click', () => {
    const isDark = !body.classList.contains('theme-dark');
    setTheme(isDark);
    window.localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

function setupBackToTop() {
  if (!backToTopLink) return;
  backToTopLink.addEventListener('click', (event) => {
    event.preventDefault();
    const header = document.getElementById('top');
    const topTarget = header ? header.offsetTop : 0;
    try {
      window.scrollTo({ top: topTarget, behavior: 'smooth' });
    } catch (error) {
      console.warn('Smooth scroll failed, using instant fallback.', error);
      window.scrollTo(0, topTarget);
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
        content = clone(defaultContent);
        renderAll();
        populateExperienceFromLinkedIn();
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

  setupIntroForm();
  setupAboutForm();
  setupLearningForm();
  setupPostsForm();
  setupProjectsForm();
  setupSidebarForm();

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
  switch (type) {
    case 'intro':
      populateIntroForm();
      break;
    case 'about':
      populateAboutForm();
      break;
    case 'learning':
      populateLearningForm();
      break;
    case 'posts':
      populatePostsForm();
      break;
    case 'projects':
      populateProjectsForm();
      break;
    case 'sidebar':
      populateSidebarForm();
      break;
    default:
      break;
  }
}

function setupIntroForm() {
  const form = dialogs.intro?.querySelector('[data-form="intro"]');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
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
    persistContent();
    renderHero();
    dialogs.intro.close();
  });
}

function populateIntroForm() {
  const form = dialogs.intro?.querySelector('[data-form="intro"]');
  if (!form) return;
  setFieldValue(form, 'eyebrow', content.hero.eyebrow);
  setFieldValue(form, 'title', content.hero.title);
  setFieldValue(form, 'lead', content.hero.lead);
  setFieldValue(form, 'primaryLabel', content.hero.primary.label);
  setFieldValue(form, 'primaryUrl', content.hero.primary.url);
  setFieldValue(form, 'secondaryLabel', content.hero.secondary.label);
  setFieldValue(form, 'secondaryUrl', content.hero.secondary.url);
  setFieldValue(form, 'current', joinLines(content.hero.current));
  setFieldValue(form, 'focus', joinLines(content.hero.focus));
}

function setupAboutForm() {
  const form = dialogs.about?.querySelector('[data-form="about"]');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    content.about.title = getFieldValue(form, 'title');
    content.about.paragraphs = splitLines(getFieldValue(form, 'paragraphs'));
    persistContent();
    renderAbout();
    dialogs.about.close();
  });
}

function populateAboutForm() {
  const form = dialogs.about?.querySelector('[data-form="about"]');
  if (!form) return;
  setFieldValue(form, 'title', content.about.title);
  setFieldValue(form, 'paragraphs', joinLines(content.about.paragraphs));
}

function setupLearningForm() {
  const form = dialogs.learning?.querySelector('[data-form="learning"]');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    content.learning.title = getFieldValue(form, 'title');
    content.learning.topics = splitLines(getFieldValue(form, 'topics'));
    persistContent();
    renderLearning();
    dialogs.learning.close();
  });
}

function populateLearningForm() {
  const form = dialogs.learning?.querySelector('[data-form="learning"]');
  if (!form) return;
  setFieldValue(form, 'title', content.learning.title);
  setFieldValue(form, 'topics', joinLines(content.learning.topics));
}

let selectedPostIndex = -1;

function setupPostsForm() {
  const wrapper = dialogs.posts;
  if (!wrapper) return;
  const form = wrapper.querySelector('.posts-editor__form');
  const list = wrapper.querySelector('.posts-editor__list');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    savePostFromForm(form);
  });

  form.querySelector('[data-command="new"]').addEventListener('click', () => {
    selectedPostIndex = -1;
    populatePostsMeta(form);
    populatePostDetail(form, {});
  });

  form.querySelector('[data-command="delete"]').addEventListener('click', () => {
    if (selectedPostIndex < 0) return;
    content.posts.entries.splice(selectedPostIndex, 1);
    selectedPostIndex = -1;
    persistContent();
    renderPosts();
    populatePostsForm();
  });

  form.querySelector('[data-command="cancel"]').addEventListener('click', () => {
    wrapper.close();
  });

  list.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    selectedPostIndex = Number(event.target.dataset.index);
    populatePostsMeta(form);
    populatePostDetail(form, content.posts.entries[selectedPostIndex]);
    updateSelectionState(list, selectedPostIndex);
  });
}

function populatePostsForm() {
  const wrapper = dialogs.posts;
  if (!wrapper) return;
  const form = wrapper.querySelector('.posts-editor__form');
  const list = wrapper.querySelector('.posts-editor__list');
  list.innerHTML = '';
  content.posts.title ??= 'Working notes on machine learning concepts';
  content.posts.ctaLabel ??= 'Get updates';
  content.posts.ctaUrl ??= 'mailto:hello@kaminglui.com?subject=Learning%20journal%20updates';
  populatePostsMeta(form);

  content.posts.entries.forEach((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.title || `Post ${index + 1}`;
    button.dataset.index = String(index);
    if (index === 0 && selectedPostIndex === -1) {
      selectedPostIndex = 0;
      populatePostDetail(form, entry);
    }
    if (index === selectedPostIndex) {
      button.setAttribute('aria-selected', 'true');
    }
    list.appendChild(button);
  });

  if (selectedPostIndex >= content.posts.entries.length) {
    selectedPostIndex = content.posts.entries.length - 1;
  }

  if (selectedPostIndex >= 0) {
    populatePostDetail(form, content.posts.entries[selectedPostIndex]);
  } else {
    populatePostDetail(form, {});
  }

  updateSelectionState(list, selectedPostIndex);
}

function populatePostsMeta(form) {
  setFieldValue(form, 'title', content.posts.title);
  setFieldValue(form, 'ctaLabel', content.posts.ctaLabel);
  setFieldValue(form, 'ctaUrl', content.posts.ctaUrl);
}

function populatePostDetail(form, entry = {}) {
  setFieldValue(form, 'eyebrow', entry.eyebrow || '');
  setFieldValue(form, 'postTitle', entry.title || '');
  setFieldValue(form, 'summary', entry.summary || '');
  setFieldValue(form, 'date', entry.date || '');
}

function savePostFromForm(form) {
  const entry = {
    eyebrow: getFieldValue(form, 'eyebrow'),
    title: getFieldValue(form, 'postTitle'),
    summary: getFieldValue(form, 'summary'),
    date: getFieldValue(form, 'date')
  };

  content.posts.title = getFieldValue(form, 'title');
  content.posts.ctaLabel = getFieldValue(form, 'ctaLabel');
  content.posts.ctaUrl = getFieldValue(form, 'ctaUrl');

  if (selectedPostIndex >= 0) {
    content.posts.entries[selectedPostIndex] = entry;
  } else {
    content.posts.entries.push(entry);
    selectedPostIndex = content.posts.entries.length - 1;
  }

  persistContent();
  renderPosts();
  populatePostsForm();
}

let selectedProjectIndex = -1;

function setupProjectsForm() {
  const wrapper = dialogs.projects;
  if (!wrapper) return;
  const form = wrapper.querySelector('.projects-editor__form');
  const list = wrapper.querySelector('.projects-editor__list');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveProjectFromForm(form);
  });

  form.querySelector('[data-command="new"]').addEventListener('click', () => {
    selectedProjectIndex = -1;
    setFieldValue(form, 'title', content.projects.title);
    populateProjectDetail(form, {});
  });

  form.querySelector('[data-command="delete"]').addEventListener('click', () => {
    if (selectedProjectIndex < 0) return;
    content.projects.items.splice(selectedProjectIndex, 1);
    selectedProjectIndex = -1;
    persistContent();
    renderProjects();
    populateProjectsForm();
  });

  form.querySelector('[data-command="cancel"]').addEventListener('click', () => {
    wrapper.close();
  });

  list.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    selectedProjectIndex = Number(event.target.dataset.index);
    populateProjectDetail(form, content.projects.items[selectedProjectIndex]);
    updateSelectionState(list, selectedProjectIndex);
  });
}

function populateProjectsForm() {
  const wrapper = dialogs.projects;
  if (!wrapper) return;
  const form = wrapper.querySelector('.projects-editor__form');
  const list = wrapper.querySelector('.projects-editor__list');
  list.innerHTML = '';
  setFieldValue(form, 'title', content.projects.title);

  if (content.projects.items.length && selectedProjectIndex === -1) {
    selectedProjectIndex = 0;
  }

  content.projects.items.forEach((project, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = project.title || `Project ${index + 1}`;
    button.dataset.index = String(index);
    if (index === selectedProjectIndex) {
      button.setAttribute('aria-selected', 'true');
    }
    list.appendChild(button);
  });

  if (selectedProjectIndex >= content.projects.items.length) {
    selectedProjectIndex = content.projects.items.length - 1;
  }

  if (selectedProjectIndex >= 0) {
    populateProjectDetail(form, content.projects.items[selectedProjectIndex]);
  } else {
    populateProjectDetail(form, {});
  }

  updateSelectionState(list, selectedProjectIndex);
}

function populateProjectDetail(form, project = {}) {
  setFieldValue(form, 'projectTitle', project.title || '');
  setFieldValue(form, 'summary', project.summary || '');
  setFieldValue(form, 'highlights', joinLines(project.highlights || []));
}

function saveProjectFromForm(form) {
  const project = {
    title: getFieldValue(form, 'projectTitle'),
    summary: getFieldValue(form, 'summary'),
    highlights: splitLines(getFieldValue(form, 'highlights'))
  };

  content.projects.title = getFieldValue(form, 'title');

  if (selectedProjectIndex >= 0) {
    content.projects.items[selectedProjectIndex] = project;
  } else {
    content.projects.items.push(project);
    selectedProjectIndex = content.projects.items.length - 1;
  }

  persistContent();
  renderProjects();
  populateProjectsForm();
}

let selectedSidebarIndex = -1;

function setupSidebarForm() {
  const wrapper = dialogs.sidebar;
  if (!wrapper) return;
  const form = wrapper.querySelector('.sidebar-editor__form');
  const list = wrapper.querySelector('.sidebar-editor__list');
  const details = wrapper.querySelector('.sidebar-editor__details');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveSidebarFromForm(form);
  });

  form.querySelector('[data-command="new"]').addEventListener('click', () => {
    selectedSidebarIndex = -1;
    setFieldValue(form, 'blockTitle', '');
    setFieldValue(form, 'blockType', 'text');
    setFieldValue(form, 'blockBody', '');
    setFieldValue(form, 'blockItems', '');
    updateSidebarMode(details, 'text');
  });

  form.querySelector('[data-command="delete"]').addEventListener('click', () => {
    if (selectedSidebarIndex < 0) return;
    content.sidebar.blocks.splice(selectedSidebarIndex, 1);
    selectedSidebarIndex = -1;
    persistContent();
    renderSidebar();
    populateSidebarForm();
  });

  form.querySelector('[data-command="cancel"]').addEventListener('click', () => {
    wrapper.close();
  });

  form.elements.namedItem('blockType').addEventListener('change', (event) => {
    updateSidebarMode(details, event.target.value);
  });

  list.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    selectedSidebarIndex = Number(event.target.dataset.index);
    populateSidebarDetail(form, content.sidebar.blocks[selectedSidebarIndex]);
    updateSelectionState(list, selectedSidebarIndex);
  });
}

function populateSidebarForm() {
  const wrapper = dialogs.sidebar;
  if (!wrapper) return;
  const form = wrapper.querySelector('.sidebar-editor__form');
  const list = wrapper.querySelector('.sidebar-editor__list');
  const details = wrapper.querySelector('.sidebar-editor__details');

  list.innerHTML = '';
  content.sidebar.blocks.forEach((block, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = block.title || `Block ${index + 1}`;
    button.dataset.index = String(index);
    if (index === selectedSidebarIndex) {
      button.setAttribute('aria-selected', 'true');
    }
    list.appendChild(button);
  });

  if (content.sidebar.blocks.length && selectedSidebarIndex === -1) {
    selectedSidebarIndex = 0;
  }

  if (selectedSidebarIndex >= content.sidebar.blocks.length) {
    selectedSidebarIndex = content.sidebar.blocks.length - 1;
  }

  if (selectedSidebarIndex >= 0) {
    populateSidebarDetail(form, content.sidebar.blocks[selectedSidebarIndex]);
  } else {
    setFieldValue(form, 'blockTitle', '');
    setFieldValue(form, 'blockType', 'text');
    setFieldValue(form, 'blockBody', '');
    setFieldValue(form, 'blockItems', '');
    updateSidebarMode(details, 'text');
  }

  updateSelectionState(list, selectedSidebarIndex);
}

function populateSidebarDetail(form, block = {}) {
  const details = dialogs.sidebar.querySelector('.sidebar-editor__details');
  setFieldValue(form, 'blockTitle', block.title || '');
  setFieldValue(form, 'blockType', block.type || 'text');
  setFieldValue(form, 'blockBody', block.body || '');
  setFieldValue(form, 'blockItems', joinLines(block.items || []));
  updateSidebarMode(details, block.type || 'text');
}

function updateSidebarMode(details, mode) {
  if (!details) return;
  details.dataset.mode = mode;
}

function saveSidebarFromForm(form) {
  const block = {
    id: selectedSidebarIndex >= 0 ? content.sidebar.blocks[selectedSidebarIndex].id : createId(),
    title: getFieldValue(form, 'blockTitle'),
    type: getFieldValue(form, 'blockType'),
    body: getFieldValue(form, 'blockBody') || '',
    items: splitLines(getFieldValue(form, 'blockItems'))
  };

  if (block.type === 'list' && !block.items.length) {
    block.items = [];
  }

  if (block.type === 'text') {
    block.items = [];
  }

  if (selectedSidebarIndex >= 0) {
    content.sidebar.blocks[selectedSidebarIndex] = block;
  } else {
    content.sidebar.blocks.push(block);
    selectedSidebarIndex = content.sidebar.blocks.length - 1;
  }

  persistContent();
  renderSidebar();
  populateSidebarForm();
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

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

renderAll();
setupNav();
setupTheme();
setupBackToTop();
setupManagementDialog();
setupEditors();
populateExperienceFromLinkedIn();

