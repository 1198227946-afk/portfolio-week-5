// ===== Mobile nav toggle =====
(function () {
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    toggle.classList.toggle('open');
    links.classList.toggle('open');
  });

  links.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      toggle.classList.remove('open');
      links.classList.remove('open');
    });
  });
})();

// ===== Contact form (demo) =====
(function () {
  var form = document.getElementById('contactForm');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var success = document.getElementById('formSuccess');
    if (success) {
      success.classList.add('show');
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    form.reset();
    setTimeout(function () {
      if (success) success.classList.remove('show');
    }, 5000);
  });
})();

// ===== Todo App (Supabase connected) =====
(function () {
  // Supabase config — publishable key, works with sb_publishable_* format
  var SUPABASE_URL = 'https://gktpkwmmtoaaobfpfeow.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xxWHiJ7Mr8S3k1Xm_9133g_2Qf5TvYW';
  var TABLE = 'todos';
  var STORAGE_KEY = 'yijia-todo-app-v1'; // localStorage offline fallback

  // Build Supabase client (only if SDK loaded)
  var sb = null;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn('[Todo] Supabase init failed:', e);
    }
  }

  var dateInput = document.getElementById('todoDate');
  var textInput = document.getElementById('todoText');
  var addBtn = document.getElementById('todoAdd');
  var listOpenEl = document.getElementById('todoListOpen');
  var listDoneEl = document.getElementById('todoListDone');
  var emptyMainEl = document.getElementById('todoEmptyMain');
  var emptyOpenEl = document.getElementById('todoEmptyOpen');
  var emptyDoneEl = document.getElementById('todoEmptyDone');
  var sectionOpenEl = document.getElementById('todoSectionOpen');
  var sectionDoneEl = document.getElementById('todoSectionDone');
  var openCountEl = document.getElementById('todoOpenCount');
  var doneCountEl = document.getElementById('todoDoneCount');
  var countEl = document.getElementById('todoCount');
  var clearBtn = document.getElementById('todoClearCompleted');
  var emojiBtn = document.getElementById('todoEmojiBtn');
  var emojiPanel = document.getElementById('todoEmojiPanel');
  var prioritySelect = document.getElementById('todoPriority');
  var searchInput = document.getElementById('todoSearch');
  var searchClearBtn = document.getElementById('todoSearchClear');
  var searchKeyword = '';

  if (!listOpenEl || !listDoneEl) return;

  function todayStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  if (dateInput && !dateInput.value) {
    dateInput.value = todayStr();
  }

  // === In-memory state ===
  var tasks = [];

  // === LocalStorage (offline fallback) ===
  function saveToLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { }
  }
  function loadFromLocal() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      arr.forEach(function (t) {
        if (t.emoji == null) t.emoji = '';
        if (!t.priority) t.priority = 'medium';
      });
      return arr;
    } catch (e) { return []; }
  }

  // === Supabase I/O ===
  function loadFromSupabase() {
    if (!sb) return Promise.reject(new Error('no sb client'));
    return sb.from(TABLE).select('*').order('created_at', { ascending: true }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(normalizeFromRow);
    });
  }

  function insertToSupabase(task) {
    if (!sb) return Promise.reject(new Error('no sb client'));
    var row = {
      text: task.text,
      date: task.date || null,
      emoji: task.emoji || '',
      priority: task.priority || 'medium',
      completed: !!task.completed
    };
    return sb.from(TABLE).insert([row]).select().then(function (res) {
      if (res.error) throw res.error;
      return (res.data && res.data[0]) ? res.data[0] : null;
    });
  }

  function updateSupabase(task) {
    if (!sb) return Promise.reject(new Error('no sb client'));
    return sb.from(TABLE).update({
      text: task.text,
      date: task.date || null,
      emoji: task.emoji || '',
      priority: task.priority || 'medium',
      completed: !!task.completed
    }).eq('id', task.id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function deleteFromSupabase(id) {
    if (!sb) return Promise.reject(new Error('no sb client'));
    return sb.from(TABLE).delete().eq('id', id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function deleteCompletedFromSupabase(ids) {
    if (!sb || !ids.length) return Promise.resolve();
    return sb.from(TABLE).delete().in('id', ids).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function normalizeFromRow(row) {
    // Map supabase row -> our task shape
    return {
      id: row.id,
      text: row.text || '',
      date: row.date || '',
      emoji: row.emoji || '',
      priority: row.priority || 'medium',
      completed: !!row.completed,
      created_at: row.created_at
    };
  }

  // === Initial load: Supabase first, localStorage fallback ===
  function init() {
    // First paint with local cache so page isn't blank
    tasks = loadFromLocal();
    render();

    if (sb) {
      // Race Supabase fetch with a 1.8s timeout
      var timeout = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, 1800);
      });
      Promise.race([loadFromSupabase(), timeout])
        .then(function (remote) {
          if (remote.length > 0 || tasks.length === 0) {
            // Prefer remote if it has data, or if local was empty anyway
            tasks = remote;
          }
          saveToLocal();
          render();
        })
        .catch(function (err) {
          console.warn('[Todo] Supabase load failed, using local cache:', err.message || err);
          // Keep local tasks as-is
        });
    }
  }

  // === Helpers ===
  function formatDate(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return parts[1] + '/' + parts[2] + '/' + parts[0];
  }

  function priorityLabel(p) {
    if (p === 'high') return 'High';
    if (p === 'low') return 'Low';
    return 'Med';
  }

  function searchFilter(arr) {
    if (!searchKeyword) return arr;
    var kw = searchKeyword.toLowerCase();
    return arr.filter(function (t) {
      return (
        t.text.toLowerCase().indexOf(kw) !== -1 ||
        (t.emoji && t.emoji.toLowerCase().indexOf(kw) !== -1) ||
        (t.date && t.date.indexOf(kw) !== -1) ||
        t.priority.toLowerCase().indexOf(kw) !== -1
      );
    });
  }

  // === Build task <li> ===
  function createTaskLi(task, onComplete, onEdit, onDelete) {
    var li = document.createElement('li');
    li.className = 'todo-item' +
      (task.completed ? ' completed' : '') +
      (' pri-' + task.priority);

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = !!task.completed;
    checkbox.setAttribute('aria-label', 'Mark "' + task.text + '" as complete');

    var wrap = document.createElement('div');
    wrap.className = 'todo-text-wrap';

    var topRow = document.createElement('div');
    topRow.className = 'todo-top-row';

    if (task.emoji) {
      var emojiEl = document.createElement('span');
      emojiEl.className = 'todo-emoji-display';
      emojiEl.textContent = task.emoji;
      topRow.appendChild(emojiEl);
    }

    var span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = task.text;
    span.setAttribute('title', 'Click to edit');
    topRow.appendChild(span);

    var priBadge = document.createElement('span');
    priBadge.className = 'todo-priority-badge pri-' + task.priority;
    priBadge.textContent = priorityLabel(task.priority);
    topRow.appendChild(priBadge);

    wrap.appendChild(topRow);

    if (task.date) {
      var dateBadge = document.createElement('span');
      dateBadge.className = 'todo-date-badge';
      dateBadge.textContent = '📅 ' + formatDate(task.date);
      wrap.appendChild(dateBadge);
    }

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'todo-delete';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', 'Delete "' + task.text + '"');

    li.appendChild(checkbox);
    li.appendChild(wrap);
    li.appendChild(delBtn);

    checkbox.addEventListener('change', onComplete);
    span.addEventListener('click', function () { onEdit(span, task, li); });
    delBtn.addEventListener('click', onDelete);

    return li;
  }

  // === Render ===
  function render() {
    listOpenEl.innerHTML = '';
    listDoneEl.innerHTML = '';

    var filtered = searchFilter(tasks);
    var openTasks = filtered.filter(function (t) { return !t.completed; });
    var doneTasks = filtered.filter(function (t) { return t.completed; });

    var totalDone = tasks.filter(function (t) { return t.completed; }).length;
    var hasAnyTask = tasks.length > 0;
    var hasVisibleTask = filtered.length > 0;

    if (!hasVisibleTask && searchKeyword && hasAnyTask) {
      emptyMainEl.hidden = false;
      emptyMainEl.querySelector('p').textContent = 'No tasks match "' + searchKeyword + '".';
      sectionOpenEl.hidden = true;
      sectionDoneEl.hidden = true;
    } else if (!hasAnyTask) {
      emptyMainEl.hidden = false;
      emptyMainEl.querySelector('p').textContent = 'No tasks yet — add one above to get started.';
      sectionOpenEl.hidden = true;
      sectionDoneEl.hidden = true;
    } else {
      emptyMainEl.hidden = true;
      sectionOpenEl.hidden = false;
      sectionDoneEl.hidden = false;

      openCountEl.textContent = openTasks.length;
      if (openTasks.length === 0) {
        emptyOpenEl.hidden = false;
      } else {
        emptyOpenEl.hidden = true;
        openTasks.forEach(function (task) {
          listOpenEl.appendChild(createTaskLi(
            task,
            function () { toggleComplete(task, true); },
            startEdit,
            function () { removeTask(task); }
          ));
        });
      }

      doneCountEl.textContent = doneTasks.length;
      if (doneTasks.length === 0) {
        emptyDoneEl.hidden = false;
      } else {
        emptyDoneEl.hidden = true;
        doneTasks.forEach(function (task) {
          listDoneEl.appendChild(createTaskLi(
            task,
            function () { toggleComplete(task, false); },
            startEdit,
            function () { removeTask(task); }
          ));
        });
      }
    }

    var total = tasks.length;
    countEl.textContent = 'Completed ' + totalDone + ' / ' + total;
    clearBtn.hidden = totalDone === 0;
  }

  // === Data mutations (optimistic UI → async write) ===
  function addTask() {
    var text = textInput.value.trim();
    if (!text) { textInput.focus(); return; }
    var dateVal = dateInput ? dateInput.value : '';
    var emojiVal = emojiBtn ? emojiBtn.textContent.trim() : '';
    if (emojiVal === '✨') emojiVal = '';
    var priVal = prioritySelect ? prioritySelect.value : 'medium';

    var tempTask = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      text: text,
      date: dateVal,
      emoji: emojiVal,
      priority: priVal,
      completed: false
    };

    // Optimistic add
    tasks.push(tempTask);
    saveToLocal();
    render();

    // Async write to Supabase
    insertToSupabase(tempTask).then(function (row) {
      if (row) {
        // Replace temp id with real uuid from supabase
        tempTask.id = row.id;
      }
      saveToLocal();
    }).catch(function (err) {
      console.warn('[Todo] Insert failed:', err.message || err);
    });

    // Reset form
    textInput.value = '';
    if (dateInput) dateInput.value = todayStr();
    if (emojiBtn) emojiBtn.textContent = '✨';
    if (prioritySelect) prioritySelect.value = 'medium';
    textInput.focus();
  }

  function toggleComplete(task, completed) {
    task.completed = completed;
    saveToLocal();
    render();
    updateSupabase(task).catch(function (err) {
      console.warn('[Todo] Update (complete) failed:', err.message || err);
    });
  }

  function removeTask(task) {
    var i = tasks.indexOf(task);
    if (i === -1) return;
    tasks.splice(i, 1);
    saveToLocal();
    render();
    deleteFromSupabase(task.id).catch(function (err) {
      console.warn('[Todo] Delete failed:', err.message || err);
    });
  }

  function clearCompleted() {
    var doneIds = tasks.filter(function (t) { return t.completed; }).map(function (t) { return t.id; });
    tasks = tasks.filter(function (t) { return !t.completed; });
    saveToLocal();
    render();
    deleteCompletedFromSupabase(doneIds).catch(function (err) {
      console.warn('[Todo] Clear completed failed:', err.message || err);
    });
  }

  // === Inline edit ===
  function startEdit(span, task, li) {
    li.classList.add('editing');
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-text-input-inline';
    input.value = task.text;
    input.setAttribute('autocomplete', 'off');

    span.replaceWith(input);
    input.focus();
    input.select();

    function finishSave() {
      var newText = input.value.trim();
      li.classList.remove('editing');
      if (newText && newText !== task.text) {
        task.text = newText;
        saveToLocal();
        updateSupabase(task).catch(function (err) {
          console.warn('[Todo] Update (edit) failed:', err.message || err);
        });
      }
      render();
    }
    function finishCancel() {
      li.classList.remove('editing');
      render();
    }

    input.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); finishSave(); }
      else if (e.key === 'Escape') { e.preventDefault(); finishCancel(); }
    });
    input.addEventListener('blur', finishSave);
  }

  // === Wire up events ===
  if (emojiBtn && emojiPanel) {
    emojiBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      emojiPanel.hidden = !emojiPanel.hidden;
    });
    emojiPanel.addEventListener('click', function (e) {
      var opt = e.target.closest('.todo-emoji-opt');
      if (!opt) return;
      emojiBtn.textContent = opt.getAttribute('data-emoji') || '✨';
      emojiPanel.hidden = true;
    });
    document.addEventListener('click', function (e) {
      if (!emojiPanel.hidden && !emojiPanel.contains(e.target) && e.target !== emojiBtn) {
        emojiPanel.hidden = true;
      }
    });
  }

  if (addBtn) addBtn.addEventListener('click', addTask);

  if (textInput) {
    textInput.addEventListener('keydown', function (e) {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); addTask(); }
    });
  }

  if (clearBtn) clearBtn.addEventListener('click', clearCompleted);

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchKeyword = searchInput.value.trim();
      if (searchClearBtn) searchClearBtn.hidden = searchKeyword.length === 0;
      render();
    });
  }
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', function () {
      if (searchInput) searchInput.value = '';
      searchKeyword = '';
      searchClearBtn.hidden = true;
      render();
      if (searchInput) searchInput.focus();
    });
  }

  init();
})();

// ===== Weather App (UAPI Weather) =====
(function () {
  var API_URL = 'https://uapis.cn/api/v1/misc/weather';
  var form = document.getElementById('weatherForm');
  var input = document.getElementById('weatherCity');
  var btn = document.getElementById('weatherSearch');
  var statusEl = document.getElementById('weatherStatus');
  var suggestEl = document.getElementById('weatherSuggestions');
  var resultEl = document.getElementById('weatherResult');
  var iconEl = document.getElementById('weatherIcon');
  var cityEl = document.getElementById('weatherCityName');
  var tempEl = document.getElementById('weatherTemp');
  var unitEl = document.getElementById('weatherUnit');
  var unitToggle = document.getElementById('weatherUnitToggle');
  var unitButtons = unitToggle ? unitToggle.querySelectorAll('.weather-unit-btn') : [];
  var conditionEl = document.getElementById('weatherCondition');
  var forecastEl = document.getElementById('weatherForecast');
  var forecastGridEl = document.getElementById('weatherForecastGrid');
  var currentUnit = 'c';
  var lastTempC = null;
  var lastForecast = null;

  if (!form || !input || !btn || !statusEl || !suggestEl || !resultEl || !unitEl || !unitToggle || !forecastEl || !forecastGridEl) return;

  // Weather icon codes follow the standard QWeather icon set.
  var WEATHER_ICONS = {
    '100': { icon: '☀️', label: 'Sunny' },
    '101': { icon: '🌤️', label: 'Cloudy' },
    '102': { icon: '🌤️', label: 'Partly cloudy' },
    '103': { icon: '🌤️', label: 'Partly cloudy' },
    '104': { icon: '☁️', label: 'Overcast' },
    '150': { icon: '🌙', label: 'Clear' },
    '151': { icon: '☁️', label: 'Cloudy' },
    '152': { icon: '☁️', label: 'Partly cloudy' },
    '153': { icon: '☁️', label: 'Partly cloudy' },
    '300': { icon: '🌦️', label: 'Light shower' },
    '301': { icon: '🌧️', label: 'Heavy shower' },
    '302': { icon: '⛈️', label: 'Thundershower' },
    '303': { icon: '⛈️', label: 'Heavy thunderstorm' },
    '304': { icon: '⛈️', label: 'Thunderstorm with hail' },
    '305': { icon: '🌧️', label: 'Light rain' },
    '306': { icon: '🌧️', label: 'Moderate rain' },
    '307': { icon: '🌧️', label: 'Heavy rain' },
    '308': { icon: '🌧️', label: 'Extreme rain' },
    '309': { icon: '🌦️', label: 'Drizzle' },
    '310': { icon: '🌧️', label: 'Rainstorm' },
    '311': { icon: '🌧️', label: 'Heavy rainstorm' },
    '312': { icon: '🌧️', label: 'Severe rainstorm' },
    '313': { icon: '🌧️', label: 'Freezing rain' },
    '314': { icon: '🌧️', label: 'Light to moderate rain' },
    '315': { icon: '🌧️', label: 'Moderate to heavy rain' },
    '316': { icon: '🌧️', label: 'Heavy rain to rainstorm' },
    '317': { icon: '🌧️', label: 'Rainstorm to heavy rainstorm' },
    '318': { icon: '🌧️', label: 'Heavy to severe rainstorm' },
    '399': { icon: '🌧️', label: 'Rain' },
    '400': { icon: '🌨️', label: 'Light snow' },
    '401': { icon: '🌨️', label: 'Moderate snow' },
    '402': { icon: '❄️', label: 'Heavy snow' },
    '403': { icon: '❄️', label: 'Snowstorm' },
    '404': { icon: '🌨️', label: 'Sleet' },
    '405': { icon: '🌨️', label: 'Rain and snow' },
    '406': { icon: '🌨️', label: 'Rain and snow showers' },
    '407': { icon: '🌨️', label: 'Snow showers' },
    '408': { icon: '🌨️', label: 'Light to moderate snow' },
    '409': { icon: '❄️', label: 'Moderate to heavy snow' },
    '410': { icon: '❄️', label: 'Heavy snow to snowstorm' },
    '499': { icon: '❄️', label: 'Snow' },
    '500': { icon: '🌫️', label: 'Mist' },
    '501': { icon: '🌫️', label: 'Fog' },
    '502': { icon: '🌫️', label: 'Haze' },
    '503': { icon: '🌪️', label: 'Sand' },
    '504': { icon: '🌫️', label: 'Dust' },
    '507': { icon: '🌪️', label: 'Sandstorm' },
    '508': { icon: '🌪️', label: 'Severe sandstorm' },
    '509': { icon: '🌫️', label: 'Dense fog' },
    '510': { icon: '🌫️', label: 'Strong dense fog' },
    '511': { icon: '🌫️', label: 'Moderate haze' },
    '512': { icon: '🌫️', label: 'Heavy haze' },
    '513': { icon: '🌫️', label: 'Severe haze' },
    '514': { icon: '🌫️', label: 'Thick fog' },
    '515': { icon: '🌫️', label: 'Extra-thick fog' },
    '900': { icon: '🥵', label: 'Hot' },
    '901': { icon: '🥶', label: 'Cold' }
  };

  function describeWeather(code, rawText) {
    var key = String(code || '');
    if (WEATHER_ICONS[key]) return WEATHER_ICONS[key];
    var n = parseInt(key, 10);
    if (n >= 100 && n < 200) return { icon: '☀️', label: 'Sunny' };
    if (n >= 300 && n < 400) return { icon: '🌧️', label: 'Rain' };
    if (n >= 400 && n < 500) return { icon: '❄️', label: 'Snow' };
    if (n >= 500 && n < 600) return { icon: '🌫️', label: 'Fog' };
    return { icon: '🌡️', label: rawText || 'Current weather' };
  }

  // Forecast entries only provide condition text, so map keywords to icons.
  function iconFromText(text) {
    var t = String(text || '').toLowerCase();
    if (t.indexOf('thunder') !== -1) return '⛈️';
    if (t.indexOf('snow') !== -1 || t.indexOf('sleet') !== -1) return '❄️';
    if (t.indexOf('rain') !== -1 || t.indexOf('drizzle') !== -1 || t.indexOf('shower') !== -1) return '🌧️';
    if (t.indexOf('fog') !== -1 || t.indexOf('mist') !== -1 || t.indexOf('haze') !== -1) return '🌫️';
    if (t.indexOf('overcast') !== -1) return '☁️';
    if (t.indexOf('cloud') !== -1) return '🌤️';
    if (t.indexOf('sunny') !== -1 || t.indexOf('clear') !== -1) return '☀️';
    if (t.indexOf('wind') !== -1 || t.indexOf('sand') !== -1 || t.indexOf('dust') !== -1) return '🌪️';
    return '🌡️';
  }

  // Common cities used to suggest alternatives when a search fails.
  var CITIES = [
    { en: 'Beijing', zh: '北京' },
    { en: 'Shanghai', zh: '上海' },
    { en: 'Guangzhou', zh: '广州' },
    { en: 'Shenzhen', zh: '深圳' },
    { en: 'Chengdu', zh: '成都' },
    { en: 'Chongqing', zh: '重庆' },
    { en: 'Hangzhou', zh: '杭州' },
    { en: 'Wuhan', zh: '武汉' },
    { en: "Xi'an", zh: '西安' },
    { en: 'Nanjing', zh: '南京' },
    { en: 'Suzhou', zh: '苏州' },
    { en: 'Tianjin', zh: '天津' },
    { en: 'Changsha', zh: '长沙' },
    { en: 'Zhengzhou', zh: '郑州' },
    { en: 'Qingdao', zh: '青岛' },
    { en: 'Shenyang', zh: '沈阳' },
    { en: 'Dalian', zh: '大连' },
    { en: 'Xiamen', zh: '厦门' },
    { en: 'Fuzhou', zh: '福州' },
    { en: 'Kunming', zh: '昆明' },
    { en: 'Harbin', zh: '哈尔滨' },
    { en: 'Jinan', zh: '济南' },
    { en: 'Hefei', zh: '合肥' },
    { en: 'Nanning', zh: '南宁' },
    { en: 'Guiyang', zh: '贵阳' },
    { en: 'Taiyuan', zh: '太原' },
    { en: 'Shijiazhuang', zh: '石家庄' },
    { en: 'Urumqi', zh: '乌鲁木齐' },
    { en: 'Lhasa', zh: '拉萨' },
    { en: 'Haikou', zh: '海口' },
    { en: 'Sanya', zh: '三亚' },
    { en: 'Hong Kong', zh: '香港' },
    { en: 'Macau', zh: '澳门' },
    { en: 'Taipei', zh: '台北' },
    { en: 'Tokyo', zh: '东京' },
    { en: 'Osaka', zh: '大阪' },
    { en: 'Kyoto', zh: '京都' },
    { en: 'Seoul', zh: '首尔' },
    { en: 'Busan', zh: '釜山' },
    { en: 'Singapore', zh: '新加坡' },
    { en: 'Bangkok', zh: '曼谷' },
    { en: 'Kuala Lumpur', zh: '吉隆坡' },
    { en: 'Jakarta', zh: '雅加达' },
    { en: 'Manila', zh: '马尼拉' },
    { en: 'Hanoi', zh: '河内' },
    { en: 'Ho Chi Minh City', zh: '胡志明市' },
    { en: 'New Delhi', zh: '新德里' },
    { en: 'Mumbai', zh: '孟买' },
    { en: 'Dubai', zh: '迪拜' },
    { en: 'London', zh: '伦敦' },
    { en: 'Paris', zh: '巴黎' },
    { en: 'Berlin', zh: '柏林' },
    { en: 'Munich', zh: '慕尼黑' },
    { en: 'Frankfurt', zh: '法兰克福' },
    { en: 'Madrid', zh: '马德里' },
    { en: 'Barcelona', zh: '巴塞罗那' },
    { en: 'Rome', zh: '罗马' },
    { en: 'Milan', zh: '米兰' },
    { en: 'Amsterdam', zh: '阿姆斯特丹' },
    { en: 'Brussels', zh: '布鲁塞尔' },
    { en: 'Zurich', zh: '苏黎世' },
    { en: 'Vienna', zh: '维也纳' },
    { en: 'Prague', zh: '布拉格' },
    { en: 'Moscow', zh: '莫斯科' },
    { en: 'Stockholm', zh: '斯德哥尔摩' },
    { en: 'Oslo', zh: '奥斯陆' },
    { en: 'Copenhagen', zh: '哥本哈根' },
    { en: 'Helsinki', zh: '赫尔辛基' },
    { en: 'Istanbul', zh: '伊斯坦布尔' },
    { en: 'New York', zh: '纽约' },
    { en: 'Los Angeles', zh: '洛杉矶' },
    { en: 'San Francisco', zh: '旧金山' },
    { en: 'Chicago', zh: '芝加哥' },
    { en: 'Boston', zh: '波士顿' },
    { en: 'Seattle', zh: '西雅图' },
    { en: 'Toronto', zh: '多伦多' },
    { en: 'Vancouver', zh: '温哥华' },
    { en: 'Montreal', zh: '蒙特利尔' },
    { en: 'Sydney', zh: '悉尼' },
    { en: 'Melbourne', zh: '墨尔本' },
    { en: 'Auckland', zh: '奥克兰' },
    { en: 'São Paulo', zh: '圣保罗' },
    { en: 'Rio de Janeiro', zh: '里约热内卢' },
    { en: 'Mexico City', zh: '墨西哥城' },
    { en: 'Cairo', zh: '开罗' },
    { en: 'Cape Town', zh: '开普敦' }
  ];

  function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/[\s\-_.,']/g, '');
  }

  function levenshtein(a, b) {
    var prev = [];
    var i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var curr = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = curr;
    }
    return prev[b.length];
  }

  function similarity(query, candidate) {
    var a = normalizeName(query);
    var b = normalizeName(candidate);
    if (!a || !b) return Infinity;
    if (b === a) return 0;
    if (b.indexOf(a) === 0) return 0.1;
    if (b.indexOf(a) !== -1) return 0.5;
    return levenshtein(a, b);
  }

  function findSimilarCities(query) {
    var q = normalizeName(query);
    var limit = q.length <= 3 ? 1 : Math.min(4, Math.max(2, Math.floor(q.length / 3)));
    var scored = [];

    CITIES.forEach(function (city) {
      var best = Math.min(
        similarity(query, city.en),
        city.zh ? similarity(query, city.zh) : Infinity
      );
      if (best <= limit) scored.push({ city: city, score: best });
    });

    scored.sort(function (a, b) { return a.score - b.score; });
    return scored.slice(0, 3).map(function (item) { return item.city; });
  }

  function clearSuggestions() {
    suggestEl.hidden = true;
    suggestEl.innerHTML = '';
  }

  function showSuggestions(query) {
    var matches = findSimilarCities(query);
    if (!matches.length) {
      clearSuggestions();
      return;
    }

    var useChinese = /[\u4e00-\u9fff]/.test(query);

    suggestEl.innerHTML = '';

    var labelEl = document.createElement('span');
    labelEl.className = 'weather-suggest-label';
    labelEl.textContent = 'Did you mean:';
    suggestEl.appendChild(labelEl);

    var chips = document.createElement('div');
    chips.className = 'weather-suggest-chips';

    matches.forEach(function (city) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'weather-suggest-btn';
      chip.textContent = useChinese ? city.zh : city.en;
      chip.addEventListener('click', function () {
        input.value = chip.textContent;
        search();
      });
      chips.appendChild(chip);
    });

    suggestEl.appendChild(chips);
    suggestEl.hidden = false;
  }


  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'weather-status' + (type ? ' is-' + type : '');
    statusEl.hidden = false;
  }

  function clearStatus() {
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.className = 'weather-status';
  }

  function setLoading(loading) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Searching…' : 'Search';
  }

  function showResult(data, fallbackCity) {
    var weather = describeWeather(data.weather_icon, data.weather);
    iconEl.textContent = weather.icon;
    cityEl.textContent = data.city || fallbackCity;
    lastTempC = data.temperature;
    lastForecast = (data.forecast || []).slice(1, 4);
    renderTemp();
    renderForecast();
    conditionEl.textContent = weather.label;
    resultEl.hidden = false;
  }

  function convertTemp(celsius) {
    return currentUnit === 'f' ? celsius * 9 / 5 + 32 : celsius;
  }

  function renderTemp() {
    var label = currentUnit === 'f' ? '°F' : '°C';
    unitEl.textContent = label;
    if (lastTempC == null) return;
    tempEl.textContent = Math.round(convertTemp(lastTempC));
  }

  function formatForecastDate(dateStr) {
    var parts = String(dateStr || '').split('-');
    if (parts.length !== 3) return dateStr || '';
    return parts[1] + '/' + parts[2];
  }

  function renderForecast() {
    forecastGridEl.innerHTML = '';
    if (!lastForecast || !lastForecast.length) {
      forecastEl.hidden = true;
      return;
    }

    lastForecast.forEach(function (day) {
      var card = document.createElement('div');
      card.className = 'weather-forecast-day';

      var weekday = document.createElement('div');
      weekday.className = 'weather-forecast-weekday';
      weekday.textContent = String(day.week || '').slice(0, 3);

      var date = document.createElement('div');
      date.className = 'weather-forecast-date';
      date.textContent = formatForecastDate(day.date);

      var icon = document.createElement('div');
      icon.className = 'weather-forecast-icon';
      icon.textContent = iconFromText(day.weather_day);

      var condition = document.createElement('div');
      condition.className = 'weather-forecast-condition';
      condition.textContent = day.weather_day || '';

      var temps = document.createElement('div');
      temps.className = 'weather-forecast-temps';

      var high = document.createElement('span');
      high.className = 'weather-forecast-high';
      high.textContent = Math.round(convertTemp(day.temp_max)) + '°';

      var low = document.createElement('span');
      low.className = 'weather-forecast-low';
      low.textContent = ' / ' + Math.round(convertTemp(day.temp_min)) + '°';

      temps.appendChild(high);
      temps.appendChild(low);

      card.appendChild(weekday);
      card.appendChild(date);
      card.appendChild(icon);
      card.appendChild(condition);
      card.appendChild(temps);
      forecastGridEl.appendChild(card);
    });

    forecastEl.hidden = false;
  }

  function setUnit(unit) {
    currentUnit = unit;
    unitButtons.forEach(function (b) {
      var active = b.getAttribute('data-unit') === unit;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderTemp();
    renderForecast();
  }

  unitToggle.addEventListener('click', function (e) {
    var target = e.target.closest('.weather-unit-btn');
    if (target) setUnit(target.getAttribute('data-unit'));
  });

  function search() {
    var city = input.value.trim();

    if (!city) {
      resultEl.hidden = true;
      forecastEl.hidden = true;
      clearSuggestions();
      clearStatus();
      showStatus('Please enter a city first.', 'error');
      input.focus();
      return;
    }

    resultEl.hidden = true;
    forecastEl.hidden = true;
    clearSuggestions();
    setLoading(true);
    showStatus('Loading…', 'loading');

    fetch(API_URL + '?city=' + encodeURIComponent(city) + '&forecast=true&lang=en', {
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        var data = result.data || {};
        var cityName = String(data.city || '').trim();
        var isUnknownCity = !cityName || /^unknown$/i.test(cityName);
        if (!result.ok || data.error === 'LOCATION_NOT_FOUND' || typeof data.temperature !== 'number' || isUnknownCity) {
          clearStatus();
          showStatus('City not found — please check the spelling.', 'error');
          showSuggestions(city);
          return;
        }
        clearSuggestions();
        clearStatus();
        showResult(data, city);
      })
      .catch(function () {
        clearSuggestions();
        clearStatus();
        showStatus('Something went wrong. Please try again.', 'error');
      })
      .then(function () {
        setLoading(false);
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    search();
  });
})();

// ===== Resume PDF (print to PDF) =====
(function () {
  var btn = document.getElementById('resumeDownload');
  if (!btn) return;

  var originalTitle = document.title;

  btn.addEventListener('click', function () {
    document.title = 'Yijia Wu - Resume';
    window.print();
  });

  window.addEventListener('afterprint', function () {
    document.title = originalTitle;
  });
})();
