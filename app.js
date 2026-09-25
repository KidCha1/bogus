const SUPABASE_URL = "https://ibygzwcxmtthxwgaxsib.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_heeXi4X2kSJdzk2yERH5Fw_c05PnLfS";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CLOUDINARY_CLOUD_NAME = "mjavcozx";
const CLOUDINARY_PRESET = "bogus_uploads";
const CLOUDINARY_API_KEY = "866355471417226";

let currentUser = null;
let activeRecipientId = null;
let activeRecipientUsername = '';
let realtimeChannel = null;
let pendingReportTarget = null;

// Native Hardware Back Button & Lifecycle Listeners
if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
  window.Capacitor.Plugins.App.addListener('backButton', () => {
    const modals = ['dm-modal', 'upload-modal', 'report-modal', 'auth-modal'];
    let handled = false;
    for (const mid of modals) {
      const m = document.getElementById(mid);
      if (m && !m.classList.contains('hidden')) {
        toggleModal(mid, false);
        handled = true;
        break;
      }
    }
    if (!handled) {
      window.Capacitor.Plugins.App.exitApp();
    }
  });

  window.Capacitor.Plugins.App.addListener('appStateChange', state => {
    if (!state.isActive) {
      document.querySelectorAll('video').forEach(v => v.pause());
    }
  });
}

const RETRO_QUESTIONS = [
  {
    q: "Verification: What did you do to a Nintendo cartridge when it wouldn't work?",
    answers: ["blow", "blew", "blow on it", "blow in it", "blow into it"]
  },
  {
    q: "Verification: Finish the phrase: 'Talk to the _____'",
    answers: ["hand", "the hand"]
  },
  {
    q: "Verification: What writing tool did you use to manually rewind a cassette tape?",
    answers: ["pencil", "pen", "a pencil", "a pen", "bic pen"]
  },
  {
    q: "Verification: Complete the phrase: 'Be kind, please ______'",
    answers: ["rewind"]
  },
  {
    q: "Verification: What did AOL announce out loud when an email arrived?",
    answers: ["you've got mail", "you got mail", "youve got mail"]
  }
];

let activeQuestionIndex = 0;

function setRandomTrivia() {
  activeQuestionIndex = Math.floor(Math.random() * RETRO_QUESTIONS.length);
  const qLabel = document.getElementById('trivia-question');
  if (qLabel) qLabel.innerText = RETRO_QUESTIONS[activeQuestionIndex].q;
}

function toggleModal(id, show) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (show) {
    modal.classList.remove('hidden');
    if (id === 'auth-modal') {
      setRandomTrivia();
      const ansInput = document.getElementById('trivia-answer');
      if (ansInput) ansInput.value = '';
    }
  } else {
    modal.classList.add('hidden');
  }
}

async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('reg-username').value.trim();
  const year = parseInt(document.getElementById('reg-year').value, 10);
  const userAnswer = document.getElementById('trivia-answer').value.trim().toLowerCase();

  if (!email || !password || !username || !year || !userAnswer) return alert("Please fill out all fields!");
  if (year < 1946 || year > 1996) return alert("Birth year must be between 1946 and 1996.");

  const validAnswers = RETRO_QUESTIONS[activeQuestionIndex].answers;
  if (!validAnswers.some(ans => userAnswer.includes(ans))) {
    alert("Incorrect verification answer. Try again.");
    setRandomTrivia();
    document.getElementById('trivia-answer').value = '';
    return;
  }

  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return alert(error.message);

  const { error: pError } = await client.from('profiles').insert({
    id: data.user.id,
    username: username,
    birth_year: year
  });

  if (pError) alert(pError.message);
  else {
    alert("Welcome to Bogus!");
    toggleModal('auth-modal', false);
    checkUser();
  }
}

async function handleSignIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
  else {
    toggleModal('auth-modal', false);
    checkUser();
  }
}

async function handleSignOut() {
  await client.auth.signOut();
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  checkUser();
}

async function checkUser() {
  const { data: { session } } = await client.auth.getSession();
  const openBtn = document.getElementById('open-auth-btn');
  const outBtn = document.getElementById('signout-btn');
  const dmBtn = document.getElementById('open-dm-btn');

  if (session) {
    currentUser = session.user;
    if (openBtn) openBtn.style.display = 'none';
    if (outBtn) outBtn.style.display = 'block';
    if (dmBtn) dmBtn.style.display = 'block';
    setupRealtimeSubscription();
  } else {
    currentUser = null;
    if (openBtn) openBtn.style.display = 'block';
    if (outBtn) outBtn.style.display = 'none';
    if (dmBtn) dmBtn.style.display = 'none';
  }
  loadVideos();
}

async function handleUpload() {
  if (!currentUser) {
    alert("You must sign in to post a video!");
    toggleModal('upload-modal', false);
    toggleModal('auth-modal', true);
    return;
  }

  const fileInput = document.getElementById('video-file');
  const caption = document.getElementById('video-caption').value;
  const file = fileInput.files[0];

  if (!file) return alert("Select a video file first!");
  if (file.size > 100 * 1024 * 1024) return alert("Keep videos under 100MB.");

  const btn = document.getElementById('upload-submit-btn');
  btn.innerText = "Uploading to Cloud...";
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);
    formData.append("api_key", CLOUDINARY_API_KEY);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Upload failed");

    const { error: dbError } = await client.from('videos').insert({
      user_id: currentUser.id,
      video_url: data.secure_url,
      caption: caption
    });

    if (dbError) throw dbError;

    btn.innerText = "Post to Feed";
    btn.disabled = false;
    toggleModal('upload-modal', false);
    loadVideos();
  } catch (err) {
    alert("Upload error: " + err.message);
    btn.innerText = "Post to Feed";
    btn.disabled = false;
  }
}

async function loadVideos() {
  const feed = document.getElementById('video-feed');
  if (!feed) return;

  const { data: videos, error } = await client
    .from('videos')
    .select('*, profiles(username)')
    .order('created_at', { ascending: false });

  if (error || !videos || videos.length === 0) return;

  feed.innerHTML = '';
  videos.forEach(v => {
    const card = document.createElement('div');
    card.className = 'video-card';
    const authorName = v.profiles?.username || 'user';
    const dmButtonHtml = (currentUser && currentUser.id !== v.user_id)
      ? `<button class="action-btn" onclick="openChatWith('${v.user_id}', '${authorName}')">💬 Message</button>`
      : '';

    card.innerHTML = `
      <video src="${v.video_url}" loop playsinline controls></video>
      <div class="overlay-info">
        <h3>@${authorName}</h3>
        <p>${v.caption || ''}</p>
        <div class="card-action-bar">
          ${dmButtonHtml}
          <button class="action-btn report-btn" onclick="openReportModal('${v.id}', '${v.user_id}')">🚩 Report</button>
        </div>
      </div>
    `;
    feed.appendChild(card);
  });
}

function openReportModal(videoId, reportedUserId) {
  if (!currentUser) {
    alert("Please sign in to report content.");
    toggleModal('auth-modal', true);
    return;
  }
  pendingReportTarget = { videoId, reportedUserId };
  toggleModal('report-modal', true);
}

async function submitReport() {
  if (!pendingReportTarget || !currentUser) return;
  const reason = document.getElementById('report-reason').value;
  const btn = document.getElementById('report-submit-btn');
  btn.innerText = "Submitting...";
  btn.disabled = true;

  const { error } = await client.from('reports').insert({
    reporter_id: currentUser.id,
    reported_user_id: pendingReportTarget.reportedUserId || null,
    video_id: pendingReportTarget.videoId || null,
    reason: reason
  });

  btn.innerText = "Submit Report";
  btn.disabled = false;
  toggleModal('report-modal', false);

  if (error) alert("Failed to submit report: " + error.message);
  else alert("Report logged. Thank you.");
}

function openInbox() {
  if (!currentUser) return toggleModal('auth-modal', true);
  showUserList();
  loadAllUsers();
  toggleModal('dm-modal', true);
}

function showUserList() {
  activeRecipientId = null;
  document.getElementById('dm-user-list-view').classList.remove('hidden');
  document.getElementById('dm-thread-view').classList.add('hidden');
  document.getElementById('dm-chat-title').innerText = "Direct Messages";
}

async function loadAllUsers() {
  const container = document.getElementById('dm-users-container');
  container.innerHTML = '<div style="color:#c5c6c7; font-size:0.85rem;">Finding members...</div>';

  const { data: profiles, error } = await client
    .from('profiles')
    .select('id, username')
    .neq('id', currentUser.id);

  if (error || !profiles || profiles.length === 0) {
    container.innerHTML = '<div style="color:#c5c6c7; font-size:0.85rem;">No other users found yet.</div>';
    return;
  }

  container.innerHTML = '';
  profiles.forEach(p => {
    const row = document.createElement('div');
    row.className = 'dm-user-row';
    row.innerHTML = `<span>@${p.username}</span><button class="action-btn">💬 Chat</button>`;
    row.onclick = () => openChatWith(p.id, p.username);
    container.appendChild(row);
  });
}

async function openChatWith(recipientId, recipientUsername) {
  if (!currentUser) return toggleModal('auth-modal', true);
  activeRecipientId = recipientId;
  activeRecipientUsername = recipientUsername;

  document.getElementById('dm-user-list-view').classList.add('hidden');
  document.getElementById('dm-thread-view').classList.remove('hidden');
  document.getElementById('dm-chat-title').innerText = `@${recipientUsername}`;

  toggleModal('dm-modal', true);
  loadMessagesForActiveThread();
}

async function loadMessagesForActiveThread() {
  const container = document.getElementById('chat-messages-container');
  container.innerHTML = '';

  const { data: messages, error } = await client
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeRecipientId}),and(sender_id.eq.${activeRecipientId},receiver_id.eq.${currentUser.id})`)
    .order('created_at', { ascending: true });

  if (error) return console.error(error);
  messages.forEach(msg => appendMessageBubble(msg));
  container.scrollTop = container.scrollHeight;
}

function appendMessageBubble(msg) {
  const container = document.getElementById('chat-messages-container');
  const bubble = document.createElement('div');
  const isMine = msg.sender_id === currentUser.id;
  bubble.className = `chat-bubble ${isMine ? 'sent' : 'received'}`;
  bubble.innerText = msg.content;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

async function handleSendMessage(event) {
  event.preventDefault();
  const input = document.getElementById('dm-message-input');
  const text = input.value.trim();
  if (!text || !activeRecipientId || !currentUser) return;
  input.value = '';

  const { error } = await client.from('messages').insert({
    sender_id: currentUser.id,
    receiver_id: activeRecipientId,
    content: text
  });

  if (error) alert("Failed to send: " + error.message);
}

function setupRealtimeSubscription() {
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  realtimeChannel = client
    .channel('public:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const newMsg = payload.new;
      if (
        activeRecipientId &&
        ((newMsg.sender_id === activeRecipientId && newMsg.receiver_id === currentUser.id) ||
         (newMsg.sender_id === currentUser.id && newMsg.receiver_id === activeRecipientId))
      ) {
        appendMessageBubble(newMsg);
      }
    })
    .subscribe();
}

checkUser();
