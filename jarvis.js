function loadJarvis(targetId, source) {
  const container = document.getElementById(targetId);
  container.innerHTML = `
    <div id="jarvisBox" style="position:fixed; bottom:20px; right:20px; width:320px; background:white; border-radius:10px; box-shadow:0 0 10px rgba(0,0,0,0.2); padding:10px; z-index:9999; display:none;">
      <div id="chatWindow" style="height:250px; overflow-y:auto; font-family:sans-serif;"></div>
      <button id="micButton">🎤 Start</button>
    </div>
    <button id="toggleJarvis" style="position:fixed; bottom:20px; right:20px; background:#0d6efd; color:white; border:none; border-radius:50%; width:50px; height:50px; font-size:20px; z-index:9998;">🎤</button>
  `;

  const chat = container.querySelector("#chatWindow");
  const micBtn = container.querySelector("#micButton");
  const jarvisBox = container.querySelector("#jarvisBox");
  const toggleBtn = container.querySelector("#toggleJarvis");

  const synth = window.speechSynthesis;
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.continuous = false;
  recognition.lang = 'en-US';

  let reminders = [];
  let currentTask = '';
  let newReminder = { title: '', datetime: '', doctor: '', repeat: 'one-time' };
  let isListening = false;
  let waiting = false;

  toggleBtn.onclick = () => {
    jarvisBox.style.display = jarvisBox.style.display === 'none' ? 'block' : 'none';
  };

  function speak(text, restart = true) {
    waiting = true;
    addMessage(text, 'bot');
    const utter = new SpeechSynthesisUtterance(text);
    synth.cancel();
    utter.onend = () => {
      waiting = false;
      if (restart && isListening) recognition.start();
    };
    synth.speak(utter);
  }

  function addMessage(text, who) {
    const div = document.createElement('div');
    div.textContent = text;
    div.className = who;
    div.style.margin = '5px';
    div.style.background = who === 'bot' ? '#e1f5fe' : '#cfe2ff';
    div.style.borderRadius = '10px';
    div.style.padding = '6px 10px';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  function startListening() {
    try { recognition.start(); micBtn.textContent = '🎤 Listening...'; } catch {}
  }

  function parseDateTime(text) {
    const result = chrono.parse(text);
    return result.length ? result[0].start.date() : null;
  }

  function isConflict(dt) {
    return reminders.some(r => new Date(r.datetime).getTime() === new Date(dt).getTime());
  }

  function loadReminders() {
    fetch(`${source}.json`)
      .then(r => r.json())
      .then(data => {
        reminders = data;
        renderRemindersToPage();
      }).catch(() => reminders = []);
  }

  function saveReminder() {
    fetch(`/api/reminders/${source}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReminder)
    }).then(res => {
      if (res.ok) {
        reminders.push(newReminder);
        renderRemindersToPage();
      }
    });
  }

  function renderRemindersToPage() {
    const list = document.getElementById('reminderList');
    if (!list) return;
    list.innerHTML = '';
    if (!reminders.length) return list.innerHTML = '<li>No reminders yet.</li>';
    reminders.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${r.title}</strong><br>${new Date(r.datetime).toLocaleString()}<br>${r.doctor ? 'Doctor: ' + r.doctor + '<br>' : ''}Repeat: ${r.repeat}`;
      list.appendChild(li);
    });
  }

  function levenshtein(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        matrix[i][j] = a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
      }
    }
    return matrix[a.length][b.length];
  }

  function findClosestReminder(title) {
    title = title.toLowerCase();
    let best = null;
    let minScore = Infinity;

    for (const r of reminders) {
      const t = r.title.toLowerCase();
      if (t.startsWith(title)) return r;
      const dist = levenshtein(title, t);
      if (dist < minScore) {
        minScore = dist;
        best = r;
      }
    }

    return minScore <= 5 ? best : null;
  }

  recognition.onresult = (e) => {
    const cmd = e.results[0][0].transcript.toLowerCase();
    addMessage(cmd, 'user');

    if (/exit|close|quit|bye|goodbye|stop|tata/.test(cmd)) {
      isListening = false;
      micBtn.textContent = '🎤 Start';
      speak('Goodbye.', false);
      return;
    }

    if (currentTask === 'awaitingTitle') {
      newReminder.title = cmd;
      if (cmd.includes('doctor')) {
        currentTask = 'awaitingDoctor';
        speak('Please tell me the doctor\'s name.');
      } else {
        currentTask = 'awaitingDateTime';
        speak('When should I remind you?');
      }

    } else if (currentTask === 'awaitingDoctor') {
      newReminder.doctor = cmd;
      currentTask = 'awaitingDateTime';
      speak('When should I remind you?');

    } else if (currentTask === 'awaitingDateTime') {
      const dt = parseDateTime(cmd);
      if (!dt || dt < new Date()) return speak('Please provide a valid future date and time.');
      const hasTime = /\d{1,2}(:\d{2})?\s*(am|pm)?|morning|evening|night/.test(cmd);

      if (!hasTime) {
        newReminder.dateOnly = dt.toDateString();
        currentTask = 'awaitingTimeOnly';
        speak('At what time on that day?');
        return;
      }

      newReminder.datetime = dt;
      if (isConflict(dt)) return speak('Another reminder is already set at that time.');
      currentTask = 'awaitingRepeat';
      speak('Should I repeat this daily, weekly, monthly, yearly, or just once?');

    } else if (currentTask === 'awaitingTimeOnly') {
      const time = parseDateTime(cmd);
      if (!time) return speak('I couldn’t understand the time.');
      const finalDateTime = new Date(newReminder.dateOnly + ' ' + time.toLocaleTimeString());
      if (finalDateTime < new Date()) return speak('That time is in the past.');
      if (isConflict(finalDateTime)) return speak('Another reminder exists at that time.');
      newReminder.datetime = finalDateTime;
      currentTask = 'awaitingRepeat';
      speak('Should I repeat this daily, weekly, monthly, yearly, or just once?');

    } else if (currentTask === 'awaitingRepeat') {
      const rep = /daily|weekly|monthly|yearly/.exec(cmd);
      newReminder.repeat = rep ? rep[0] : 'one-time';
      currentTask = 'awaitingConfirmation';
      speak(`Do you want to save reminder titled "${newReminder.title}" at ${new Date(newReminder.datetime).toLocaleString()} repeating ${newReminder.repeat}? Say confirm to save.`);

    } else if (currentTask === 'awaitingConfirmation') {
      if (/confirm|yes|save/.test(cmd)) {
        saveReminder();
        speak('Reminder saved.');
      } else {
        speak('Reminder discarded.');
      }
      currentTask = '';

    } else if (currentTask === 'awaitingRemoveTitle') {
      const match = findClosestReminder(cmd);
      if (!match) {
        speak(`Couldn't find a reminder similar to "${cmd}".`);
        currentTask = '';
      } else {
        newReminder = match;
        currentTask = 'awaitingRemoveConfirm';
        speak(`Found reminder titled "${newReminder.title}". Say confirm to delete it.`);
      }

    } else if (currentTask === 'awaitingRemoveConfirm') {
      if (/confirm|yes|delete/.test(cmd)) {
        fetch(`/api/reminders/${source}/${encodeURIComponent(newReminder.title)}`, {
          method: 'DELETE'
        }).then(res => {
          if (res.ok) {
            reminders = reminders.filter(r => r.title !== newReminder.title);
            renderRemindersToPage();
            speak('Reminder deleted.');
          } else {
            speak('Failed to delete reminder.');
          }
        });
      } else {
        speak('Deletion canceled.');
      }
      currentTask = '';

    } else {
      if (/add|create|new|make|set|save|remind/.test(cmd)) {
        newReminder = { title: '', datetime: '', doctor: '', repeat: 'one-time' };
        currentTask = 'awaitingTitle';
        speak('What is the title of the reminder?');

      } else if (/view|list|show|display/.test(cmd)) {
        if (!reminders.length) speak('No reminders yet.');
        else speak(reminders.map(r =>
          `${r.title} at ${new Date(r.datetime).toLocaleString()}`
        ).join('. '));

      } else if (/remove|delete|discard/.test(cmd)) {
        currentTask = 'awaitingRemoveTitle';
        speak('Say the title of the reminder you want to delete.');

      } else {
        speak('Sorry, I didn’t catch that. Please say add, view, or remove.');
      }
    }
  };

  recognition.onend = () => {
    if (isListening && !waiting) setTimeout(startListening, 500);
    else micBtn.textContent = '🎤 Start';
  };

  micBtn.onclick = () => {
    if (!isListening) {
      isListening = true;
      speak('Hi! What would you like to do? Add, view, or remove a reminder?');
    }
  };

  loadReminders();
}
