const paletteButtons = Array.from(document.querySelectorAll('.forge-toolbar button'));
const canvas = document.getElementById('forge-canvas');
const partList = document.getElementById('part-list');
const activePartLabel = document.getElementById('active-part');
const partCountLabel = document.getElementById('part-count');
const noteCountLabel = document.getElementById('note-count');
const notePad = document.getElementById('note-pad');

let activePart = 'Vsource';
let selectedId = null;
const parts = new Map();

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `part-${Math.random().toString(36).slice(2, 10)}`;

function setActivePart(partName) {
  activePart = partName;
  activePartLabel.textContent = partName;
  paletteButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.part === partName);
  });
}

function formatPosition(x, y) {
  return `${Math.round(x)}px, ${Math.round(y)}px`;
}

function selectPart(id) {
  selectedId = id;
  document.querySelectorAll('.forge-chip').forEach((chip) => {
    chip.classList.toggle('selected', chip.dataset.id === id);
  });
  document.querySelectorAll('.forge-list li').forEach((item) => {
    item.classList.toggle('active', item.dataset.id === id);
  });
}

function renderPartList() {
  partList.innerHTML = '';

  if (parts.size === 0) {
    const placeholder = document.createElement('li');
    placeholder.id = 'empty-state';
    placeholder.className = 'forge-empty';
    placeholder.textContent = 'No parts yet. Choose a component and click on the canvas.';
    partList.appendChild(placeholder);
    partCountLabel.textContent = '0';
    return;
  }

  parts.forEach((part) => {
    const item = document.createElement('li');
    item.dataset.id = part.id;
    const typeLabel = document.createElement('span');
    typeLabel.textContent = part.type;
    const coordLabel = document.createElement('span');
    coordLabel.textContent = formatPosition(part.x, part.y);
    item.append(typeLabel, coordLabel);
    item.addEventListener('click', () => selectPart(part.id));
    partList.appendChild(item);
  });

  partCountLabel.textContent = `${parts.size}`;
}

function addChip(part) {
  const chip = document.createElement('div');
  chip.className = 'forge-chip';
  chip.dataset.id = part.id;
  chip.style.left = `${part.x - 70}px`;
  chip.style.top = `${part.y - 32}px`;

  const title = document.createElement('h4');
  title.textContent = `${part.type}`;
  const subtitle = document.createElement('p');
  subtitle.textContent = part.note || 'Drag nets and mark pin labels';

  const leftPin = document.createElement('span');
  leftPin.className = 'pin';
  leftPin.dataset.pos = 'left';
  const rightPin = document.createElement('span');
  rightPin.className = 'pin';
  rightPin.dataset.pos = 'right';

  chip.append(title, subtitle, leftPin, rightPin);
  chip.addEventListener('click', (event) => {
    event.stopPropagation();
    selectPart(part.id);
  });

  canvas.appendChild(chip);
  part.element = chip;
}

function placePart(x, y) {
  const id = createId();
  const part = {
    id,
    type: activePart,
    x,
    y,
    note: activePart === 'Note' ? 'Inline note' : `${activePart} ready`,
  };

  parts.set(id, part);
  addChip(part);
  renderPartList();
  selectPart(id);
}

function sanitizeCoordinate(value, max) {
  const clamped = Math.max(18, Math.min(value, max - 18));
  return clamped;
}

function handleCanvasClick(event) {
  if (event.target.closest('.forge-chip')) return;

  const rect = canvas.getBoundingClientRect();
  const x = sanitizeCoordinate(event.clientX - rect.left, rect.width);
  const y = sanitizeCoordinate(event.clientY - rect.top, rect.height);
  placePart(x, y);
}

function updateNoteCount() {
  const noteText = notePad.value.trim();
  if (!noteText) {
    noteCountLabel.textContent = '0 saved';
    return;
  }

  const lines = noteText.split(/\n+/).filter(Boolean).length;
  noteCountLabel.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}`;
}

paletteButtons.forEach((button) => {
  button.addEventListener('click', () => setActivePart(button.dataset.part));
});

canvas.addEventListener('click', handleCanvasClick);
notePad.addEventListener('input', updateNoteCount);

renderPartList();
updateNoteCount();
