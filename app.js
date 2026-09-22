const SUPABASE_URL = "https://ibygzwcxmtthxwgaxsib.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_heeXi4X2kSJdzk2yERH5Fw_c05PnLfS";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function toggleModal(id, show) {
  const modal = document.getElementById(id);
  if (show) modal.classList.remove('hidden');
  else modal.classList.add('hidden');
}

// 1. Sign Up & Age Gatekeeper (Strictly 1946 - 1996)
async function handleRegister() {
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('reg-username').value;
  const year = parseInt(document.getElementById('reg-year').value, 10);

  if (!email || !password || !username || !year) {
    alert("Please fill out all fields!");
    return;
  }

  if (year < 1946 || year > 1996) {
    alert("ACCESS DENIED: Bogus is strictly for Boomers, Gen X, and Millennials (1946–1996). Go play on TikTok!");
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
    alert("Welcome to Bogus! You passed the gatekeeper.");
    toggleModal('auth-modal', false);
    checkUser();
  }
}

// 2. Sign In
async function handleSignIn() {
  const email = document.getElementById('auth-email').value;
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

// 5. Video Upload to bogus-clips1
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

  const btn = document.getElementById('upload-submit-btn');
  btn.innerText = "Uploading...";
  btn.disabled = true;

  const fileName = `${session.user.id}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await client.storage
    .from('bogus-clips1')
    .upload(fileName, file);

  if (uploadError) {
    alert("Upload failed: " + uploadError.message);
    btn.innerText = "Post to Feed";
    btn.disabled = false;
    return;
  }

  const { data: { publicUrl } } = client.storage
    .from('bogus-clips1')
    .getPublicUrl(fileName);

  await client.from('videos').insert({
    user_id: session.user.id,
    video_url: publicUrl,
    caption: caption
  });

  btn.innerText = "Post to Feed";
  btn.disabled = false;
  toggleModal('upload-modal', false);
  loadVideos();
}

// 6. Fetch & Render Vertical Snap Feed
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
        <h3>@${v.profiles?.username || 'vintage_user'}</h3>
        <p>${v.caption || ''}</p>
      </div>
    `;
    feed.appendChild(card);
  });
}

checkUser();
