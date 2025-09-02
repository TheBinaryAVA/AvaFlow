// Firebase imports & config (use v9+ modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- Firebase config (placeholder: replace with your config) ---
const firebaseConfig = {
  apiKey: "your-placeholder",
  authDomain: "your-placeholder",
  projectId: "your-placeholder",
  storageBucket: "your-placeholder",
  messagingSenderId: "your-placeholder",
  appId: "your-placeholder"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- DOM Elements ---
const taskForm = document.getElementById('taskForm');
const taskList = document.getElementById('taskList');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const streakCounter = document.getElementById('streakCounter');
const weeklyChart = document.getElementById('weeklyChart').getContext('2d');
const filterCategory = document.getElementById('filterCategory');
const filterStatus = document.getElementById('filterStatus');
const toggleThemeBtn = document.getElementById('toggleThemeBtn');
const clockElement = document.getElementById('clock');
const alarmTimeInput = document.getElementById('alarmTime');
const setAlarmBtn = document.getElementById('setAlarmBtn');
const alarmStatus = document.getElementById('alarmStatus');
const alarmSound = document.getElementById('alarmSound');

// --- State ---
let tasks = [];
let weeklyData = [];
let streak = 0;
let alarmTime = localStorage.getItem('alarmTime') || "";
let theme = localStorage.getItem('theme') || "light";

// --- Theme Handling ---
function setTheme(mode) {
  document.body.classList.toggle('dark', mode === 'dark');
  localStorage.setItem('theme', mode);
  theme = mode;
}
toggleThemeBtn.onclick = () => setTheme(theme === "light" ? "dark" : "light");
setTheme(theme);

// --- Clock & Alarm ---
function showClock() {
  setInterval(() => {
    const now = new Date();
    clockElement.textContent = now.toLocaleTimeString();
    // Alarm check
    if (alarmTime) {
      const [h, m] = alarmTime.split(':');
      if (now.getHours() === Number(h) && now.getMinutes() === Number(m) && now.getSeconds() === 0) {
        alarmSound.play();
        alarmStatus.textContent = "⏰ Time's up!";
      }
    }
  }, 1000);
}
alarmTimeInput.value = alarmTime;
setAlarmBtn.onclick = () => {
  alarmTime = alarmTimeInput.value;
  localStorage.setItem('alarmTime', alarmTime);
  alarmStatus.textContent = "Alarm set for " + alarmTime;
};
showClock();

// --- CRUD Operations ---
const tasksCol = collection(db, 'tasks');

taskForm.onsubmit = async (e) => {
  e.preventDefault();
  const text = document.getElementById('taskText').value;
  const category = document.getElementById('taskCategory').value;
  await addDoc(tasksCol, {
    text, done: false, category,
    createdAt: new Date(),
    completedAt: null
  });
  taskForm.reset();
};

async function deleteTask(id) {
  await deleteDoc(doc(db, 'tasks', id));
}

async function toggleDone(id, isDone) {
  const tdoc = doc(db, 'tasks', id);
  await updateDoc(tdoc, {
    done: !isDone,
    completedAt: !isDone ? new Date() : null
  });
}

async function editTask(id, newText) {
  await updateDoc(doc(db, 'tasks', id), { text: newText });
}

// --- Firestore Real-time Listener ---
function loadTasks() {
  const q = query(tasksCol, orderBy('createdAt', 'desc'));
  onSnapshot(q, snap => {
    tasks = snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    renderTasks();
    renderProgress();
    renderWeeklyChart();
    renderStreak();
  });
}

// --- Render Functions ---
function renderTasks() {
  // Filters
  let filtered = tasks;
  if (filterCategory.value !== 'all') {
    filtered = filtered.filter(t => t.category === filterCategory.value);
  }
  if (filterStatus.value === 'done') {
    filtered = filtered.filter(t => t.done);
  } else if (filterStatus.value === 'pending') {
    filtered = filtered.filter(t => !t.done);
  }

  taskList.innerHTML = "";

  filtered.forEach(task => {
    const li = document.createElement('li');
    li.classList.toggle('task-done', task.done);

    li.innerHTML = `
      <span ondblclick="this.contentEditable=true" onblur="window.editTask('${task.id}', this.textContent)">${task.text}</span>
      <div class="task-actions">
        <button onclick="window.toggleDone('${task.id}', ${task.done})">${task.done ? "✅" : "⬜"}</button>
        <button onclick="window.deleteTask('${task.id}')">🗑️</button>
      </div>
      <small>${task.category} • ${new Date(task.createdAt.seconds*1000).toLocaleDateString()}</small>
    `;
    taskList.appendChild(li);
  });
}
window.deleteTask = deleteTask;
window.toggleDone = toggleDone;
window.editTask = editTask;

// --- Progress Bar Today's Tasks ---
function renderProgress() {
  const today = new Date().toLocaleDateString();
  const todayTasks = tasks.filter(t => new Date(t.createdAt.seconds*1000).toLocaleDateString() === today);
  const doneTasks = todayTasks.filter(t => t.done);
  const percent = todayTasks.length ? Math.round(100 * doneTasks.length / todayTasks.length) : 0;
  progressBar.style.width = percent + '%';
  progressPercent.textContent = percent + "% tasks completed today";
}

// --- Weekly Progress Chart ---
function renderWeeklyChart() {
  // Count tasks completed per day for last 7 days
  let labels = [];
  let data = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const label = day.toLocaleDateString('en-GB', {weekday: 'short'});
    labels.push(label);
    const count = tasks.filter(t => t.done && new Date(t.completedAt?.seconds*1000||0).toLocaleDateString() === day.toLocaleDateString()).length;
    data.push(count);
  }
  // Chart.js
  if (window.weeklyChartObj) window.weeklyChartObj.destroy();
  window.weeklyChartObj = new Chart(weeklyChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Completed Tasks',
        data,
        backgroundColor: ['#48a6ffAA','#38e3b9AA','#f75f86AA','#f9cb40AA','#48a6ffAA','#38e3b9AA','#f75f86AA']
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

// --- Streak Counter ---
function renderStreak() {
  // Days in row with at least 1 task completed
  let streakCount = 0;
  for (let i = 0; i < 100; i++) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const completed = tasks.some(t => t.done && new Date(t.completedAt?.seconds*1000||0).toLocaleDateString() === day.toLocaleDateString());
    if (completed) streakCount++;
    else break;
  }
  streakCounter.textContent = `🔥 Streak: ${streakCount} days`;
}

// --- Filters ---
filterCategory.onchange = filterStatus.onchange = () => renderTasks();

// --- Init ---
loadTasks();

// --- Firestore Rules (development) ---
/*
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{taskId} {
      allow read, write: if true;
    }
  }
}
*/
