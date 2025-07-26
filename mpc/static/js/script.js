const elements = {
  personasContainer: document.getElementById('personasContainer'),
  personaNameInput: document.getElementById('personaNameInput'),
  conversationDiv: document.getElementById('conversation'),
  respondAsSelect: document.getElementById('respondAsSelect'),
  contextInput: document.getElementById('contextInput'),
  userInputField: document.getElementById('userInput'),
  currentContextDisplay: document.getElementById('currentContext'),
  themePicker: document.getElementById('themePicker'),
  analysisPersonaSelect: document.getElementById('analysisPersonaSelect'),
  startRange: document.getElementById('startRange'),
  endRange: document.getElementById('endRange'),
  analysisPrompt: document.getElementById('analysisPrompt'),
  analysisResults: document.getElementById('analysisResults'),
  respondToSelect: document.getElementById('respondToSelect'),
  randomCheckbox: document.getElementById('randomCheckbox'),
  includeLastCheckbox: document.getElementById('includeLastCheckbox'),
  includeLastCount: document.getElementById('includeLastCount'),
  messageCountEl: document.getElementById('messageCountValue'),
  charCountEl: document.getElementById('characterCountValue'),
  includeChatCheckbox: document.getElementById('includeChatCheckbox')
};

const state = {
  personas: [],
  selectedPersonaName: null,
  scrollButtons: null,
  configData: null
};

const samplePersonas = [
  { name: 'Sherlock', prompt: 'You are Sherlock Holmes, the world\'s greatest detective. You are extremely logical, observant, and deductive in your reasoning. You notice details others miss and make brilliant deductions. You are somewhat arrogant about your intellectual abilities.', avatar: null },
  { name: 'Watson', prompt: 'You are Dr. John Watson, a medical doctor and loyal friend to Sherlock Holmes. You are practical, compassionate, and often amazed by Sherlock\'s deductions. You ask clarifying questions and sometimes need things explained to you.', avatar: null },
  { name: 'Moriarty', prompt: 'You are Professor James Moriarty, the "Napoleon of Crime". You are a criminal mastermind of extraordinary intellect who serves as Sherlock Holmes\' arch-enemy. Your speech is calculated, cold, and often laced with veiled threats. You take pleasure in intellectual games and outwitting others. You frequently use chess metaphors and speak in a precise, academic tone that belies your violent nature.', avatar: null }
];

const DOM = {
  query: selector => document.querySelector(selector),
  queryAll: selector => document.querySelectorAll(selector),
  create: (tag, props = {}) => {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(el.dataset, value);
      } else if (key === 'events' && typeof value === 'object') {
        Object.entries(value).forEach(([event, handler]) => {
          el.addEventListener(event, handler);
        });
      } else {
        el[key] = value;
      }
    });
    return el;
  }
};

async function loadConfig() {
  try {
    const response = await fetch('/config');
    state.configData = await response.json();
    return state.configData;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

function changeTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

async function initiateChat() {
  const sender = elements.respondAsSelect.value;
  const receiver = elements.respondToSelect.value;
  const message = elements.userInputField.value.trim();
  
  if (!sender || sender === "SELECT PERSONA") {
    alert("ERROR: PLEASE SELECT A SENDER PERSONA");
    return;
  }
  
  if (receiver === "ALL") {
    alert("ERROR: PLEASE SELECT A SPECIFIC RECEIVER (NOT 'ALL')");
    return;
  }
  
  if (!message) {
    alert("ERROR: MESSAGE CANNOT BE EMPTY");
    return;
  }
  
  addMessageToConversation(sender, message);
  elements.userInputField.value = '';
  toggleRainbowStatus(true);
  
  try {
    const personas = getPersonaData();
    const senderPersona = personas.find(p => p.name === sender);
    const receiverPersona = personas.find(p => p.name === receiver);
    
    if (!senderPersona || !receiverPersona) {
      throw new Error("Persona data not found");
    }
    
    const payload = {
      sender: { name: senderPersona.name, system_prompt: senderPersona.prompt },
      receiver: { name: receiverPersona.name, system_prompt: receiverPersona.prompt },
      message: message,
      context: getCurrentContext(),
      conversation: getCleanConversationText()
    };

    const response = await fetchFromServer('/direct_chat', payload);
    
    if (response.message) {
      addMessageToConversation(receiver, response.message);
    } else {
      alert("ERROR: NO RESPONSE FROM SERVER");
    }
  } catch (error) {
    console.error("Chat error:", error);
    alert("CONNECTION ERROR: SERVER UNAVAILABLE");
  } finally {
    toggleRainbowStatus(false);
  }
}

function sendAsPersona() {
  const persona = elements.respondAsSelect.value;
  const message = elements.userInputField.value.trim();
  
  if (!persona || persona === "SELECT PERSONA") {
    alert("ERROR: PLEASE SELECT A PERSONA");
    return;
  }
  
  if (!message) {
    alert("ERROR: MESSAGE CANNOT BE EMPTY");
    return;
  }
  
  addMessageToConversation(persona, message);
  elements.userInputField.value = '';
  elements.userInputField.focus();
}

function setupEventListeners() {
  const eventMappings = {
    'themePicker': { change: (e) => changeTheme(e.target.value) },
    'startAutoConvoButton': { click: startAutoConversation },
    'setContextButton': { click: setContext },
    'analyzeButton': { click: analyzeConversation },
    'addChatButton': { click: sendAsPersona },
    'chatButton': { click: initiateChat },
    'includeLastCheckbox': { change: function() {
      elements.includeLastCount.disabled = !this.checked;
    }},
    'includeChatCheckbox': { 
      change: function() {
        const isChecked = this.checked;
        elements.analysisPersonaSelect.disabled = !isChecked;
        elements.startRange.disabled = !isChecked;
        elements.endRange.disabled = !isChecked;
      }
    }
  };
  
  Object.entries(eventMappings).forEach(([id, events]) => {
    const element = document.getElementById(id);
    if (element) {
      Object.entries(events).forEach(([event, handler]) => {
        element.addEventListener(event, handler);
      });
    }
  });
  
  elements.userInputField.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAsPersona();
    }
  });
}

function addPersona() {
  const name = elements.personaNameInput.value.trim();
  if (!name) return;
  addPersonaCard(name);
  elements.personaNameInput.value = '';
}

function deletePersona(button) {
  const card = button.closest('.persona');
  const name = card.dataset.name;
  
  card.remove();
  state.personas = state.personas.filter(p => p.name !== name);
  updateAllPersonaDropdowns();
}

function clearConversation() {
  if (confirm("WARNING: CONVERSATION DATA WILL BE ERASED. PROCEED?")) {
    elements.conversationDiv.innerHTML = '';
    updateCounters(); 
  }
}

function saveConversation() {
  const saveData = {
    conversation: elements.conversationDiv.innerHTML,
    context: elements.contextInput.value,
    personas: getPersonaData()
  };
  
  localStorage.setItem('chatData', JSON.stringify(saveData));
  alert("CONVERSATION DATA SAVED TO LOCAL STORAGE");
}

function loadConversation() {
  const savedData = localStorage.getItem('chatData');
  if (!savedData) {
    alert("ERROR: NO SAVED DATA FOUND");
    return;
  }
  
  try {
    const data = JSON.parse(savedData);
    
    elements.personasContainer.innerHTML = '';
    elements.respondAsSelect.length = 1;
    
    state.personas = [];
    data.personas.forEach(p => addPersonaCard(p.name, p.prompt, p.colorIndex, p.avatar));
    
    elements.conversationDiv.innerHTML = data.conversation;
    elements.contextInput.value = data.context;
    updateCounters(); 
    updateAllPersonaDropdowns();
    
    alert("CONVERSATION DATA LOADED SUCCESSFULLY");
  } catch (error) {
    console.error("Error loading saved data:", error);
    alert("ERROR: COULD NOT PARSE SAVED DATA");
  }
}

function getPersonaData() {
  return [...state.personas];
}

function addPersonaCard(name, promptText = '', colorIndex = null, avatarData = null) {
  if (!name || typeof name !== 'string') {
    console.error('Invalid persona name:', name);
    return;
  }

  colorIndex = colorIndex ?? (state.personas.length % 6) + 1;
  state.personas.push({ name, prompt: promptText, colorIndex, avatar: avatarData });

  const template = document.getElementById('persona-card-template');
  const card = template.content.cloneNode(true).firstElementChild;
  
  card.dataset.name = name;
  card.dataset.colorIndex = colorIndex;
  
  card.querySelector('.persona-name').textContent = name;
  card.querySelector('.prompt').value = promptText;
  
  const avatarInput = card.querySelector('.avatar-input');
  const avatarUploadBtn = card.querySelector('.avatar-upload-btn');
  const deleteBtn = card.querySelector('.delete');

  avatarUploadBtn.addEventListener('click', () => {
    avatarInput.click();
  });

  avatarInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('ERROR: FILE TOO LARGE (MAX 5MB)');
        return;
      }

      const reader = new FileReader();
      reader.onload = function(e) {
        const imageDataUrl = e.target.result;
        
        const personaIndex = state.personas.findIndex(p => p.name === name);
        if (personaIndex !== -1) {
          state.personas[personaIndex].avatar = imageDataUrl;
        }
        
        avatarUploadBtn.style.backgroundColor = 'var(--accent-color)';
        avatarUploadBtn.style.color = 'var(--bg-color)';
        setTimeout(() => {
          avatarUploadBtn.style.backgroundColor = '';
          avatarUploadBtn.style.color = '';
        }, 1000);
      };
      reader.readAsDataURL(file);
    }
  });

  deleteBtn.addEventListener('click', function() {
    deletePersona(this);
  });

  card.addEventListener('click', function(event) {
    if (event.target.closest('.delete') || 
        event.target.closest('.prompt') || 
        event.target.closest('.avatar-upload-btn')) return;
    this.classList.toggle('collapsed');
  });

  const promptTextarea = card.querySelector('.prompt');
  promptTextarea.addEventListener('input', function() {
    const personaIndex = state.personas.findIndex(p => p.name === name);
    if (personaIndex !== -1) {
      state.personas[personaIndex].prompt = this.value.trim();
    }
  });

  elements.personasContainer.appendChild(card);
  updateAllPersonaDropdowns();
}

function formatMessageContent(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<span class="dim-text">**$1**</span>')
    .replace(/\*(.*?)\*/g, '<span class="dim-text">*$1*</span>')
    .replace(/\[(.*?)\]/g, '<span class="dim-text">[$1]</span>');
}

function getCleanConversationText() {
  const allMessages = Array.from(elements.conversationDiv.querySelectorAll('.message'));
  
  let messagesToInclude = allMessages;
  if (elements.includeLastCheckbox.checked) {
    const count = parseInt(elements.includeLastCount.value) || 5;
    messagesToInclude = allMessages.slice(-count);
  }
  
  return messagesToInclude.map(msg => {
    const persona = msg.dataset.persona;
    const content = msg.querySelector('.message-content').textContent;
    return `${persona}: ${content}`;
  }).join('\n');
}

function getCurrentContext() {
  return elements.currentContextDisplay.value.trim() === 'No context set' 
    ? elements.contextInput.value.trim() 
    : elements.currentContextDisplay.value.trim();
}

async function fetchFromServer(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function startAutoConversation() {
  const personas = getPersonaData().map(p => ({
    name: p.name,
    system_prompt: p.prompt
  }));
  
  if (personas.length < 2) {
    alert("ERROR: MINIMUM 2 PERSONAS REQUIRED FOR AUTO-SEQUENCE");
    return;
  }
  
  const context = getCurrentContext();
  if (!context) {
    alert("ERROR: CONTEXT PARAMETERS REQUIRED");
    return;
  }
  
  const turns = parseInt(document.getElementById('turnsInput').value);
  if (isNaN(turns) || turns < 1) {
    alert("ERROR: INVALID EXCHANGE VALUE");
    return;
  }
  
  toggleRainbowStatus(true);
  
  try {
    const conversationMessages = getCleanConversationText();
    
    const payload = {
      personas: personas,
      context: context,
      conversation: conversationMessages,
      turns: turns,
      random: elements.randomCheckbox.checked
    };
    
    const res = await fetchFromServer('/auto_chat', payload);
    
    if (res.exchanges) {
      res.exchanges.forEach(exchange => {
        if (exchange.message && exchange.message.trim()) {
          addMessageToConversation(exchange.persona, exchange.message);
        }
      });
    } else {
      alert("ERROR: " + (res.error || "NO RESPONSE FROM SERVER"));
    }
  } catch (error) {
    alert("CONNECTION ERROR: SERVER UNAVAILABLE");
    console.error("Fetch error:", error);
  } finally {
    toggleRainbowStatus(false);
  }
}

function setContext() {
  const contextText = elements.contextInput.value.trim();
  if (contextText) {
    elements.currentContextDisplay.value = contextText;
    alert("CONTEXT PARAMETERS SET");
  } else {
    alert("ERROR: CONTEXT PARAMETERS REQUIRED");
  }
}

function populatePersonaDropdown(selectElement, options = {}) {
  const { startFromIndex = 1, addColorBorder = true } = options;
  
  selectElement.length = startFromIndex;

  state.personas.forEach(persona => {
    const option = DOM.create('option', {
      value: persona.name,
      textContent: persona.name,
      dataset: { colorIndex: persona.colorIndex || '1' }
    });
    
    if (addColorBorder) {
      option.style.borderLeft = `8px solid var(--persona-color-${persona.colorIndex || '1'})`;
    }
    
    selectElement.appendChild(option);
  });
}

function updateAllPersonaDropdowns() {
  populatePersonaDropdown(elements.respondAsSelect);
  populatePersonaDropdown(elements.respondToSelect); 
  populatePersonaDropdown(elements.analysisPersonaSelect);
}

async function analyzeConversation() {
  const selectedPersona = elements.analysisPersonaSelect.value;
  const start = parseInt(elements.startRange.value);
  const end = parseInt(elements.endRange.value);
  const prompt = elements.analysisPrompt.value.trim();
  const includeChat = elements.includeChatCheckbox.checked;
  
  const context = elements.currentContextDisplay.value.trim() === 'No context set' 
    ? '' : elements.currentContextDisplay.value.trim();
  
  if (includeChat) {
    if (isNaN(start) || start < 1 || isNaN(end) || end < 1) {
      alert("ERROR: INVALID RANGE VALUES");
      return;
    }
    
    if (start > end) {
      alert("ERROR: START MUST BE LESS THAN OR EQUAL TO END");
      return;
    }
  }
  
  if (!prompt) {
    alert("ERROR: ANALYSIS PROMPT REQUIRED");
    return;
  }

  toggleRainbowStatus(true);
  elements.analysisResults.value = '';
  
  try {
    let conversationText = '';
    
    if (includeChat) {
      const allMessages = Array.from(elements.conversationDiv.querySelectorAll('.message'));
      if (allMessages.length > 0) {
        const messagesInRange = allMessages.slice(start - 1, end);
        
        const filteredMessages = selectedPersona === "ALL" 
          ? messagesInRange 
          : messagesInRange.filter(msg => msg.dataset.persona === selectedPersona);
        
        if (filteredMessages.length > 0) {
          conversationText = filteredMessages.map(msg => {
            const persona = msg.dataset.persona;
            const content = msg.querySelector('.message-content').textContent;
            return `${persona}: ${content}`;
          }).join('\n');
        }
      }
    }
      
    const payload = {
      analysis_prompt: prompt,
      conversation: conversationText,
      context: includeChat ? context : ''
    };
    
    const res = await fetchFromServer('/analyze', payload);
    
    if (res.analysis) {
      elements.analysisResults.value = res.analysis;
    } else {
      alert("ERROR: " + (res.error || "NO ANALYSIS RESULTS"));
    }
    
  } catch (error) {
    console.error("Analysis error:", error);
    alert("CONNECTION ERROR: SERVER UNAVAILABLE");
  } finally {
    toggleRainbowStatus(false);
  }
}

function removePersonaPrefix(text, personaName) {
  const personaRegex = new RegExp(`${personaName}:\\s*`, 'gi');
  let cleanedText = text.replace(personaRegex, '').trim();

  state.personas.forEach(persona => {
    if (persona.name !== personaName) {
      const otherPersonaRegex = new RegExp(`${persona.name}:\\s*`, 'gi');
      cleanedText = cleanedText.replace(otherPersonaRegex, '').trim();
    }
  });
  return cleanedText;
}

function addMessageToConversation(persona, message, isEditable = true) {
  let colorIndex = '1';
  let avatarData = null;
  
  const personaData = state.personas.find(p => p.name === persona);
  if (personaData) {
    colorIndex = personaData.colorIndex || '1';
    avatarData = personaData.avatar;
  }
  
  const personaColorVar = `--persona-color-${colorIndex}`;
  
  const messageDiv = DOM.create('div', {
    className: 'message highlight',
    dataset: { persona, personaClass: `persona${colorIndex}` }
  });
  
  const personaIndicator = DOM.create('div', {
    className: 'persona-indicator',
    style: { backgroundColor: `var(${personaColorVar})` }
  });
  
  const avatarDiv = DOM.create('div', {
    className: 'message-avatar',
    style: {
      borderColor: `var(${personaColorVar})`,
      backgroundColor: avatarData ? 'transparent' : `var(--input-bg)`,
      backgroundImage: avatarData ? `url(${avatarData})` : 'none',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      color: avatarData ? 'transparent' : `var(${personaColorVar})`
    }
  });
  
  if (!avatarData) {
    avatarDiv.textContent = persona.charAt(0).toUpperCase();
  }
  
  const contentWrapper = DOM.create('div', {
    className: 'message-content-wrapper'
  });
  
  const personaBadge = DOM.create('span', {
    className: 'persona-badge',
    textContent: persona,
    style: { backgroundColor: `var(${personaColorVar})` }
  });
  
  const personaSpan = DOM.create('span', {
    className: 'message-persona',
    style: { color: `var(${personaColorVar})` }
  });
  personaSpan.appendChild(personaBadge);
  
  const cleanedMessage = removePersonaPrefix(message, persona);

  const contentSpan = DOM.create('span', {
    className: 'message-content',
    innerHTML: formatMessageContent(cleanedMessage)
  });
  
  contentWrapper.append(personaSpan, contentSpan);
  messageDiv.append(personaIndicator, avatarDiv, contentWrapper);
  
  if (isEditable) {
    const controlsDiv = DOM.create('div', { className: 'message-controls' });
    
    const editBtn = DOM.create('button', {
      className: 'edit-btn',
      title: 'EDIT',
      textContent: '✎',
      onclick: () => editMessage(editBtn)
    });
    
    const deleteBtn = DOM.create('button', {
      className: 'delete-btn',
      title: 'DELETE',
      textContent: '×',
      onclick: () => deleteMessage(deleteBtn)
    });
    
    controlsDiv.append(editBtn, deleteBtn);
    messageDiv.appendChild(controlsDiv);
  }
  
  elements.conversationDiv.appendChild(messageDiv);
  updateCounters(); 
}

function editMessage(button) {
  const messageDiv = button.closest('.message');
  const contentSpan = messageDiv.querySelector('.message-content');
  const originalText = contentSpan.textContent;
  
  const editClone = document.getElementById('edit-area-template').content.cloneNode(true);
  const editArea = editClone.querySelector('.edit-area');
  editArea.value = originalText;

  editClone.querySelector('.save-btn').onclick = () => {
    const newText = editArea.value.trim();
    contentSpan.innerHTML = formatMessageContent(newText);
    messageDiv.classList.add('highlight');
    !messageDiv.querySelector('.edit-marker') && addEditMarker(messageDiv);
  };
  
  editClone.querySelector('.cancel-btn').onclick = () => 
    contentSpan.innerHTML = formatMessageContent(originalText);

  contentSpan.innerHTML = '';
  contentSpan.appendChild(editClone);
  editArea.focus();
  messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const addEditMarker = messageDiv => {
  const marker = document.getElementById('edit-marker-template').content.cloneNode(true);
  messageDiv.querySelector('.message-persona').appendChild(marker);
};

function deleteMessage(button) {
  const msg = button.closest('.message');
  const confirmEl = document.getElementById('confirm-delete-template').content.cloneNode(true);
  const confirmDiv = confirmEl.querySelector('.confirm-delete');
  
  confirmEl.querySelector('.yes-btn').onclick = () => {
    msg.classList.add('deleting-message');
    setTimeout(() => msg.parentNode === elements.conversationDiv && (msg.remove(), updateCounters()), 300);
  };
  
  confirmEl.querySelector('.no-btn').onclick = () => {
    msg.removeChild(confirmDiv);
    msg.querySelector('.message-controls')?.style.removeProperty('display');
  };
  
  msg.querySelector('.message-controls').style.display = 'none';
  msg.appendChild(confirmEl);
}

function setupTabs() {
  const tabButtons = DOM.queryAll('.tab-button');
  const tabContents = DOM.queryAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      const tabId = button.dataset.tab + '-tab';
      document.getElementById(tabId).classList.add('active');
    });
  });
}

function updateCounters() {
  const {messageCountEl, charCountEl, conversationDiv} = elements;
  if (messageCountEl) { 
    messageCountEl.textContent = conversationDiv.querySelectorAll('.message').length;
    if (charCountEl) charCountEl.textContent = [...conversationDiv.querySelectorAll('.message-content')]
      .reduce((s, c) => s + c.textContent.length, 0);
  }
}

function toggleRainbowStatus(isActive) {
  const statusIndicator = DOM.query('.status-indicator');
  if (statusIndicator) {
    statusIndicator.classList.toggle('rainbow', isActive);
  }
}

async function initializeApp() {
  const config = await loadConfig();
  
  if (config && config.sample_personas) {
    config.sample_personas.forEach((persona, index) => {
      addPersonaCard(
        persona.name, 
        persona.prompt, 
        persona.color_index || (index % 6) + 1, 
        persona.avatar_path && persona.avatar_path !== "null" ? persona.avatar_path : null
      );
    });
    
    if (config.default_context) {
      elements.contextInput.value = config.default_context;
    }
  } else {
    samplePersonas.forEach((persona, index) => {
      addPersonaCard(persona.name, persona.prompt, (index % 6) + 1, persona.avatar);
    });
  }
  
  updateAllPersonaDropdowns();
  updateCounters(); 
  
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'night';
  elements.themePicker.value = currentTheme;
  
  setupTabs();
  setupEventListeners();
}

window.onload = initializeApp;