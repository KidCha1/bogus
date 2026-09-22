// Supabase Configuration
const SUPABASE_URL = "https://ibygzwcxmtthxwgaxsib.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_heeXi4X2kSJdzk2yERH5Fw_c05PnLfS";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cloudinary Configuration
const CLOUDINARY_CLOUD_NAME = "mjavcozx";
const CLOUDINARY_PRESET = "bogus_uploads";

// Verification Questions
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
  if (qLabel) {
    qLabel.innerText = RETRO_QUESTIONS[activeQuestionIndex].q;
  }
}

function toggleModal(id, show) {
  const modal = document.getElementById(id);
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

// 1. Sign Up, Age Gatekeeper & Trivia Verification
async function handleRegister() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('reg-username').value.trim();
  const year = parseInt(document.getElementById('reg-year').value, 10);
  const userAnswer = document.getElementById('trivia-answer').value.trim().toLowerCase();

  if (!email || !password || !username || !year || !userAnswer) {
    alert("Please fill out all fields, including the verification question!");
    return;
  }

  // Birth Year Check (1946 - 1996)
  if (year < 1946 || year > 1996) {
    alert("Birth year must be between 1946 and 1996.");
    return;
  }

  // Verification Check
  const validAnswers = RETRO_QUESTIONS[activeQuestionIndex].answers;
  const passedTrivia = validAnswers.some(ans => userAnswer.includes(ans));

  if (!passedTrivia) {
    alert("Incorrect answer for verification question. Try again.");
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

// 2. Sign In
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

// 3. Sign Out
async function handleSignOut() {
  await client.auth.signOut();
  checkUser();
}

// 4. Session State Check
async function checkUser() {
  const { data: { session } } = await client.auth.getSession();
  const openBtn = document.getElementById('open-auth-btn');
  const outBtn = document.getElementById('signout-btn');

  if (session) {
    openBtn.style.display = 'none';
    outBtn.style.display = 'block';
  } else {
    openBtn.style.display = 'block';
    outBtn.style.display = 'none';
  }
  loadVideos();
}

// 5. Video Upload via Cloudinary
async function handleUpload() {
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    alert("You must sign in to post a video!");
    toggleModal('upload-modal', false);
    toggleModal('auth-modal', true);
    return;
  }

  const fileInput = document.getElementById('video-file');
  const caption = document.getElementById('video-caption').value;
  const file = fileInput.files[0];

  if (!file) return alert("Select a video file first!");

  if (file.size > 100 * 1024 * 1024) {
    return alert("File too big! Please keep videos under 100MB.");
  }

  const btn = document.getElementById('upload-submit-btn');
  btn.innerText = "Uploading to Cloud...";
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`, {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Upload failed");

    const publicVideoUrl = data.secure_url;

    const { error: dbError } = await client.from('videos').insert({
      user_id: session.user.id,
      video_url: publicVideoUrl,
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

// 6. Fetch & Render Feed
async function loadVideos() {
  const feed = document.getElementById('video-feed');

  const { data: videos, error } = await client
    .from('videos')
    .select('*, profiles(username)')
    .order('created_at', { ascending: false });

  if (error || !videos || videos.length === 0) return;

  feed.innerHTML = '';
  videos.forEach(v => {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <video src="${v.video_url}" loop playsinline controls></video>
      <div class="overlay-info">
        <h3>@${v.profiles?.username || 'user'}</h3>
        <p>${v.caption || ''}</p>
      </div>
    `;
    feed.appendChild(card);
  });
}

// Initial session check
checkUser();
