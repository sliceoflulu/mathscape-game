// Konfigurasi Inti Game Engine
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State Management
let gameState = {
    level: 1,
    lives: 3,
    score: 0,
    timer: 0,
    timerInterval: null,
    isPlaying: false,
    isMuted: false,
    savedProgress: null
};

// Data Posisi Entitas (Pemain, Musuh, Pintu Keluar)
let player = { x: 50, y: 200, size: 25, speed: 4, color: '#6366f1' };
let door = { x: 720, y: 190, width: 30, height: 50, isLocked: true, color: '#f59e0b' };
let enemies = [];
let currentPuzzle = { question: '', answer: 0 };
let levelTransitionAlpha = 0;

// Web Audio API Synthesizer (Pengganti file MP3 eksternal agar bebas hak cipta)
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playTone(freq, type, duration, vol = 0.1) {
    if (gameState.isMuted || !audioCtx) return;
    try {
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) { console.log("Audio error contextual context:", e); }
}

// Chiptune Procedural Music Loop
function playBackgroundMusic() {
    if (!gameState.isPlaying || gameState.isMuted) return;
    // Menggunakan melodi arpeggio retro sederhana berulang setiap 1.5 detik
    let notes = [261.63, 329.63, 392.00, 523.25]; // Akor C Major
    notes.forEach((note, index) => {
        setTimeout(() => {
            if(gameState.isPlaying) playTone(note, 'triangle', 0.4, 0.05);
        }, index * 350);
    });
}
let musicInterval = setInterval(playBackgroundMusic, 1500);

// Input Handling (Keyboard & Touch)
let keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// Simulasi Loading Screen Realistis
let progress = 0;
const progressFill = document.querySelector('.progress-fill');
const startBtn = document.getElementById('start-btn');
const loadingInterval = setInterval(() => {
    progress += Math.floor(Math.random() * 15) + 5;
    if (progress >= 100) {
        progress = 100;
        clearInterval(loadingInterval);
        startBtn.classList.remove('disabled');
        startBtn.removeAttribute('disabled');
    }
    progressFill.style.width = progress + '%';
}, 150);

// Memulai Game dari Menu Loading
startBtn.addEventListener('click', () => {
    document.getElementById('loading-screen').style.display = 'none';
    initAudio();
    loadGameProgress();
    gameState.isPlaying = true;
    startTimer();
    generateLevelData();
    gameLoop();
});

// Generator Teka-Teki Matematika Sesuai Skala Level
function generateMathPuzzle(level) {
    let num1 = Math.floor(Math.random() * (level * 10)) + 2;
    let num2 = Math.floor(Math.random() * (level * 10)) + 2;
    let operators = ['+', '-', '*'];
    let op = operators[Math.floor(Math.random() * Math.min(level, operators.length))];
    
    if (op === '-') { if (num1 < num2) { let t = num1; num1 = num2; num2 = t; } } // Hindari nilai minus untuk kemudahan awal

    let questionText = `Berapakah hasil matematika dari: ${num1} ${op} ${num2}?`;
    let answerValue = 0;

    switch(op) {
        case '+': answerValue = num1 + num2; break;
        case '-': answerValue = num1 - num2; break;
        case '*': answerValue = num1 * num2; break;
    }
    return { question: questionText, answer: answerValue };
}

// Inisialisasi Desain Map Tingkat Kesulitan Level Berdasarkan Skala Dungeon
function generateLevelData() {
    door.isLocked = true;
    currentPuzzle = generateMathPuzzle(gameState.level);
    
    // Taruh posisi player kembali ke sisi kiri gerbang
    player.x = 50; player.y = 200;
    
    // Distribusi Patroli Musuh AI Pintar Berdasarkan Level
    enemies = [];
    let enemyCount = Math.min(gameState.level + 1, 5);
    for(let i=0; i < enemyCount; i++) {
        enemies.push({
            x: 200 + (i * 100),
            y: Math.random() * 350 + 50,
            size: 20,
            speedY: (Math.random() * 2 + 1) * (Math.random() > 0.5 ? 1 : -1),
            color: '#ef4444'
        });
    }
    updateUI();
    saveGameProgress();
}

// Deteksi Logika Pergerakan Objek Fisika & Tabrakan Objek (Collisions)
function updateGamePhysics() {
    if (!gameState.isPlaying) return;

    // Gerak Vertikal / Horizontal Keyboard
    if (keys['arrowup'] || keys['w']) player.y -= player.speed;
    if (keys['arrowdown'] || keys['s']) player.y += player.speed;
    if (keys['arrowleft'] || keys['a']) player.x -= player.speed;
    if (keys['arrowright'] || keys['d']) player.x += player.speed;

    // Batasan Dinding Pembatas Canvas (Wall Boundary Check)
    if (player.x < 0) player.x = 0;
    if (player.x + player.size > canvas.width) player.x = canvas.width - player.size;
    if (player.y < 0) player.y = 0;
    if (player.y + player.size > canvas.height) player.y = canvas.height - player.size;

    // Pembaruan Logika Pergerakan Patroli Musuh
    enemies.forEach(enemy => {
        enemy.y += enemy.speedY;
        if (enemy.y <= 0 || enemy.y + enemy.size >= canvas.height) {
            enemy.speedY *= -1; // Memantul jika terkena batas atas bawah map dungeoun
        }

        // Cek Deteksi Tabrakan Fisika Pemain dengan Musuh (AABB Collision Box)
        if (player.x < enemy.x + enemy.size && player.x + player.size > enemy.x &&
            player.y < enemy.y + enemy.size && player.y + player.size > enemy.y) {
                // Konsekuensi jika terkena musuh
                gameState.lives--;
                playTone(150, 'sawtooth', 0.3, 0.2); // Efek suara damage guncangan
                player.x = 50; player.y = 200; // Reset ke posisi aman awal
                updateUI();
                
                if (gameState.lives <= 0) {
                    gameOver();
                }
        }
    });

    // Deteksi Kontak Pemain dengan Pintu Keluar
    if (player.x + player.size >= door.x && player.y + player.size >= door.y && player.y <= door.y + door.height) {
        if (door.isLocked) {
            triggerMathModal();
        } else {
            nextLevelClear();
        }
    }
}

// Aktivasi Pintu Modal Teka-teki Matematika
function triggerMathModal() {
    keys = {}; // Bersihkan input keyboard sementara berjalan
    document.getElementById('puzzle-question').innerText = currentPuzzle.question;
    const modal = document.getElementById('puzzle-modal');
    modal.classList.remove('hidden-element');
    document.getElementById('puzzle-answer').focus();
}

// Validasi Jawaban Input Pemain
document.getElementById('submit-answer-btn').addEventListener('click', checkUserAnswer);
document.getElementById('puzzle-answer').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkUserAnswer();
});

function checkUserAnswer() {
    const userAnswer = parseInt(document.getElementById('puzzle-answer').value);
    const modal = document.getElementById('puzzle-modal');
    
    if (userAnswer === currentPuzzle.answer) {
        playTone(600, 'sine', 0.2, 0.1); // Nada benar
        setTimeout(() => playTone(800, 'sine', 0.3, 0.1), 100);
        door.isLocked = false;
        modal.classList.add('hidden-element');
        document.getElementById('puzzle-answer').value = '';
    } else {
        playTone(100, 'square', 0.5, 0.2); // Nada salah melengking
        gameState.lives--;
        updateUI();
        alert("Jawaban salah! Pintu tetap terkunci, energi nyawa berkurang.");
        modal.classList.add('hidden-element');
        document.getElementById('puzzle-answer').value = '';
        if (gameState.lives <= 0) gameOver();
    }
}

// Fungsi Efek Transisi Masuk Level Baru
function nextLevelClear() {
    gameState.level++;
    gameState.score += 100 * gameState.level;
    playTone(523.25, 'sine', 0.1); 
    playTone(659.25, 'sine', 0.1);
    playTone(783.99, 'sine', 0.3); // Arpeggio Victory Fanfare
    
    // Jalankan efek visual transisi layar meredup pudar
    levelTransitionAlpha = 1;
    generateLevelData();
}

// Siklus Penggambaran Objek Grafis Canvas (Render Loop)
function drawVisuals() {
    // Bersihkan frame canvas sebelumnya
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Gambar Latar Belakang Kamar Dungeon Kotak-kotak Retro Grid
    ctx.fillStyle = document.body.classList.contains('light-theme') ? '#e5e7eb' : '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Menggambar Pintu Level Keluar Berwarna Emas
    ctx.fillStyle = door.isLocked ? door.color : '#10b981';
    ctx.fillRect(door.x, door.y, door.width, door.height);
    // Detail Gagang Pintu
    ctx.fillStyle = '#000';
    ctx.fillRect(door.x + 5, door.y + 22, 6, 6);

    // Menggambar Karakter Utama (Hero Vector Kotak Bergaya Minimalis)
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.size, player.size);
    // Detail Mata Karakter Menghadap Arah Gerak Kanan
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(player.x + 15, player.y + 5, 6, 6);
    ctx.fillStyle = '#000000';
    ctx.fillRect(player.x + 19, player.y + 5, 3, 3);

    // Menggambar Seluruh Musuh (Enemy Spikes)
    enemies.forEach(enemy => {
        ctx.fillStyle = enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.size, enemy.size);
        // Desain duri siluet visual musuh sederhana
        ctx.fillStyle = '#fff';
        ctx.fillRect(enemy.x + 6, enemy.y + 6, 8, 8);
    });

    // Menggambar Efek Transisi Layar Antar Level Fade In/Out Effect
    if (levelTransitionAlpha > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${levelTransitionAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        levelTransitionAlpha -= 0.05; // Mengurangi ketebalan pudar kegelapan layar perlahan
    }
}

// Game Loop Inti Utama Engine
function gameLoop() {
    if (!gameState.isPlaying) return;
    updateGamePhysics();
    drawVisuals();
    requestAnimationFrame(gameLoop);
}

// Pengelolaan Sistem Manajemen Waktu / Timer Run
function startTimer() {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = setInterval(() => {
        if(gameState.isPlaying) {
            gameState.timer++;
            let mins = Math.floor(gameState.timer / 60).toString().padStart(2, '0');
            let secs = (gameState.timer % 60).toString().padStart(2, '0');
            document.getElementById('ui-timer').innerText = `${mins}:${secs}`;
        }
    }, 1000);
}

// Pembaruan Informasi Panel UI Teks Samping
function updateUI() {
    document.getElementById('ui-level').innerText = gameState.level;
    document.getElementById('ui-lives').innerText = '❤️'.repeat(Math.max(0, gameState.lives));
}

// Manajemen Penyimpanan Otomatis (Auto Save LocalStorage)
function saveGameProgress() {
    let progressData = {
        level: gameState.level,
        score: gameState.score,
        timer: gameState.timer
    };
    localStorage.setItem('mathemaquest_save', JSON.stringify(progressData));
}

function loadGameProgress() {
    let saved = localStorage.getItem('mathemaquest_save');
    if (saved) {
        let parsed = JSON.parse(saved);
        gameState.level = parsed.level;
        gameState.score = parsed.score;
        gameState.timer = parsed.timer;
        updateUI();
    }
    updateLeaderboardView();
}

// Pengelolaan Sistem Skor Akhir & Papan Peringkat (Local Storage Leaderboard)
function gameOver() {
    gameState.isPlaying = false;
    clearInterval(gameState.timerInterval);
    playTone(80, 'sawtooth', 0.8, 0.3); // Nada Game Over Kalah bergetar tebal
    
    let name = prompt(`GAME OVER! Kamu bertahan hingga Level ${gameState.level}.\nMasukkan nama kamu untuk Papan Peringkat:`) || "Anonim Player";
    
    let leaderboard = JSON.parse(localStorage.getItem('mathemaquest_leaderboard')) || [];
    leaderboard.push({ name: name, score: gameState.score, level: gameState.level, time: gameState.timer });
    // Urutkan berdasarkan level tertinggi, lalu skor tertinggi
    leaderboard.sort((a, b) => b.level - a.level || b.score - a.score);
    localStorage.setItem('mathemaquest_leaderboard', JSON.stringify(leaderboard.slice(0, 5))); // Simpan peringkat Top 5 saja

    // Reset total data simpanan otomatis karena siklus kalah habis nyawa
    localStorage.removeItem('mathemaquest_save');
    
    // Pertahankan kemudahan restart segar kembali
    location.reload();
}

function updateLeaderboardView() {
    let leaderboard = JSON.parse(localStorage.getItem('mathemaquest_leaderboard')) || [];
    let listContainer = document.getElementById('leaderboard-list');
    if(leaderboard.length > 0) {
        listContainer.innerHTML = leaderboard.map(player => 
            `<li><strong>${player.name}</strong> - Lvl ${player.level} (${player.score} Pts)</li>`
        ).join('');
    }
}

// Fitur Interaksi Aksesibilitas UI Kontrol Tombol Samping (Dark Mode & Mute)
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    document.body.classList.toggle('dark-theme');
});

document.getElementById('mute-toggle').addEventListener('click', () => {
    gameState.isMuted = !gameState.isMuted;
    document.getElementById('mute-toggle').innerText = gameState.isMuted ? '🔇 Unmute' : '🔊 Mute';
});

// Mobile Virtual D-Pad Click Bindings Triggering Game Simulation Movement Variables
const bindMobileBtn = (id, keyName) => {
    const btn = document.getElementById(id);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[keyName] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[keyName] = false; });
    // Tambahan fallback klik mouse normal untuk pengujian di browser desktop responsive simulator mode
    btn.addEventListener('mousedown', () => { keys[keyName] = true; });
    btn.addEventListener('mouseup', () => { keys[keyName] = false; });
};
bindMobileBtn('ctrl-up', 'arrowup');
bindMobileBtn('ctrl-down', 'arrowdown');
bindMobileBtn('ctrl-left', 'arrowleft');
bindMobileBtn('ctrl-right', 'arrowright');
document.getElementById('ctrl-action').addEventListener('click', () => {
    if (!document.getElementById('puzzle-modal').classList.contains('hidden-element')) {
        checkUserAnswer();
    }
});

// Tombol Unduh Instan File Game Berbentuk Bundle ZIP Otomatis Melalui File Gabung Blob Data URI
document.getElementById('download-btn').addEventListener('click', () => {
    let htmlContent = document.documentElement.outerHTML;
    let blob = new Blob([htmlContent], { type: 'text/html' });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mathema_quest_game.html';
    a.click();
});
