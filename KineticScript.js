/* ============================================================
   KINETIC — dynamic music player
   Local library + live "Discover" search (Audius open catalog)
   + Playlists, Liked Songs, History, Most Played, Queue,
   Equalizer, Sleep Timer, Crossfade, Visualizer, Themes.
   Everything except Discover results is stored only in this
   browser's localStorage.
   ============================================================ */

const AUDIUS_APP_NAME = "KineticPlayer";
const LS = {
    theme: "kinetic_theme",
    volume: "kinetic_volume",
    muted: "kinetic_muted",
    shuffle: "kinetic_shuffle",
    repeat: "kinetic_repeat",
    liked: "kinetic_liked",
    playlists: "kinetic_playlists",
    recent: "kinetic_recent",
    counts: "kinetic_playcounts",
    crossfade: "kinetic_crossfade",
    eq: "kinetic_eq",
    speed: "kinetic_speed"
};

function lsGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
}

/* ---------- Local library (your original MP3s) ---------- */
const librarySongs = [
    { songName: "The Way I Loved You", artists: ["Taylor Swift"], filePath: "songs/TheWayILovedYou.mp3", coverPath: "songcover.png", source: "local" },
    { songName: "Fate of Ophelia", artists: ["Taylor Swift"], filePath: "songs/FateofOphelia.mp3", coverPath: "songcover.png", source: "local" },
    { songName: "Me!", artists: ["Taylor Swift", "Brendon Urie"], filePath: "songs/Me!.mp3", coverPath: "songcover.png", source: "local" },
    { songName: "Enchanted", artists: ["Taylor Swift"], filePath: "songs/Enchanted.mp3", coverPath: "songcover.png", source: "local" },
    { songName: "You Belong With Me", artists: ["Taylor Swift"], filePath: "songs/YouBelongWithMe.mp3", coverPath: "songcover.png", source: "local" },
    { songName: "Love Story", artists: ["Taylor Swift"], filePath: "songs/LoveStory.mp3", coverPath: "songcover.png", source: "local" },
    { songName: "Back to December", artists: ["Taylor Swift"], filePath: "songs/BackToDecember.mp3", coverPath: "songcover.png", source: "local" }
];

/* Master lookup so Liked / Playlists / History / Top can render songs
   that came from Discover, even after the discover list changes. */
const songCache = {};
librarySongs.forEach(s => songCache[s.filePath] = s);
function cacheSong(song) { songCache[song.filePath] = song; return song; }
function getCachedSong(filePath) { return songCache[filePath] || null; }

let discoverSongs = [];
let discoverIsFallback = false;
let activeTab = "library";
let playQueue = librarySongs.slice();   // the actual playback queue (freely reorderable)
let songIndex = 0;
let isShuffle = lsGet(LS.shuffle, false);
let repeatMode = lsGet(LS.repeat, "off"); // "off" | "all" | "one"
let searchDebounce = null;
let sleepTimeoutId = null;
let sleepEndOfSong = false;

let liked = new Set(lsGet(LS.liked, []));
let playlists = lsGet(LS.playlists, {});
let recent = lsGet(LS.recent, []);
let playCounts = lsGet(LS.counts, {});
let crossfadeEnabled = lsGet(LS.crossfade, false);
let currentPlaylistView = null;

/* ---------- DOM refs ---------- */
const audioElement = new Audio();
audioElement.crossOrigin = "anonymous"; // lets the equalizer process cross-origin streams that send CORS headers, without affecting normal (non-EQ) playback of any source
const masterPlay = document.getElementById("masterPlay");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const myProgressBar = document.getElementById("myProgressBar");
const gif = document.getElementById("gif");
const masterSongName = document.getElementById("masterSongName");
const masterArtistName = document.getElementById("masterArtistName");
const currentTimeEl = document.getElementById("currentTime");
const durationTimeEl = document.getElementById("durationTime");
const volumeBar = document.getElementById("volumeBar");
const volumePct = document.getElementById("volumePct");
const muteBtn = document.getElementById("muteBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const repeatBtn = document.getElementById("repeatBtn");
const miniCover = document.getElementById("miniCover");

const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const libraryList = document.getElementById("libraryList");
const discoverList = document.getElementById("discoverList");
const librarySection = document.getElementById("librarySection");
const discoverSection = document.getElementById("discoverSection");
const playlistsSection = document.getElementById("playlistsSection");
const likedSection = document.getElementById("likedSection");
const recentSection = document.getElementById("recentSection");
const topSection = document.getElementById("topSection");
const libraryEmpty = document.getElementById("libraryEmpty");
const libraryEmptyQuery = document.getElementById("libraryEmptyQuery");
const discoverEmpty = document.getElementById("discoverEmpty");
const discoverLoader = document.getElementById("discoverLoader");
const libraryCount = document.getElementById("libraryCount");
const discoverCount = document.getElementById("discoverCount");
const likedCount = document.getElementById("likedCount");
const recentCount = document.getElementById("recentCount");
const topCount = document.getElementById("topCount");
const navLinks = Array.from(document.getElementsByClassName("navLink"));
const pageHeading = document.getElementById("pageHeading");

const bannerCover = document.getElementById("bannerCover");
const bannerSongName = document.getElementById("bannerSongName");
const bannerArtists = document.getElementById("bannerArtists");
const artistInfo = document.getElementById("artistInfo");
const bannerLike = document.getElementById("bannerLike");
const bannerAdd = document.getElementById("bannerAdd");
const bannerQueueAdd = document.getElementById("bannerQueueAdd");

const settingsBtn = document.getElementById("settingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const closeSettings = document.getElementById("closeSettings");
const infoStats = document.getElementById("infoStats");
const toast = document.getElementById("toast");

const themeBtn = document.getElementById("themeBtn");
const queueBtn = document.getElementById("queueBtn");
const queuePanel = document.getElementById("queuePanel");
const closeQueue = document.getElementById("closeQueue");
const queueListEl = document.getElementById("queueList");

const rowMenu = document.getElementById("rowMenu");
const menuLike = document.getElementById("menuLike");
const menuLikeLabel = document.getElementById("menuLikeLabel");
const menuQueue = document.getElementById("menuQueue");
const menuAddPlaylist = document.getElementById("menuAddPlaylist");
const menuPlaylistSub = document.getElementById("menuPlaylistSub");
const menuRemovePlaylist = document.getElementById("menuRemovePlaylist");

const newPlaylistBtn = document.getElementById("newPlaylistBtn");
const playlistModalOverlay = document.getElementById("playlistModalOverlay");
const playlistModalTitle = document.getElementById("playlistModalTitle");
const playlistNameInput = document.getElementById("playlistNameInput");
const playlistModalConfirm = document.getElementById("playlistModalConfirm");
const closePlaylistModal = document.getElementById("closePlaylistModal");
const playlistGrid = document.getElementById("playlistGrid");
const playlistDetail = document.getElementById("playlistDetail");
const playlistDetailList = document.getElementById("playlistDetailList");
const playlistDetailEmpty = document.getElementById("playlistDetailEmpty");
const playlistsTitle = document.getElementById("playlistsTitle");
const backToPlaylists = document.getElementById("backToPlaylists");

const eqPresets = document.getElementById("eqPresets");
const sleepSelect = document.getElementById("sleepSelect");
const sleepStatus = document.getElementById("sleepStatus");
const crossfadeToggle = document.getElementById("crossfadeToggle");

const visualizerCanvas = document.getElementById("visualizer");
const vizCtx = visualizerCanvas ? visualizerCanvas.getContext("2d") : null;
const bgFX = document.getElementById("bgFX");
const loadingScreen = document.getElementById("loadingScreen");

/* ---------- Helpers ---------- */
function formatTime(sec) {
    if (isNaN(sec) || sec === Infinity) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}
function showToast(msg, duration = 2600) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), duration);
}
function artistsToString(artists) { return artists.join(", "); }
function songKey(song) { return song.filePath; }
function isLiked(song) { return liked.has(songKey(song)); }

/* ---------- Fuzzy matching helper ---------- */
function fuzzyScore(text, queryWords) {
    const t = text.toLowerCase();
    let score = 0;
    queryWords.forEach(w => {
        if (!w) return;
        if (t.includes(w)) score += w.length;
        else if (w.length > 2) {
            const hit = t.split(/\s+/).some(tw => tw.startsWith(w.slice(0, 3)));
            if (hit) score += 1;
        }
    });
    return score;
}

/* ============================================================
   ROW BUILDER — shared by every list (library/discover/liked/
   playlist detail/recent/top). Keeps one consistent look & the
   like/menu affordances everywhere.
   ============================================================ */
function buildSongRow(song, opts = {}) {
    cacheSong(song);
    const row = document.createElement("div");
    row.className = "songItem";
    const current = playQueue[songIndex];
    const playing = current && songKey(current) === songKey(song);
    if (playing) row.classList.add("playingRow");

    const extraBadge = opts.badge ? `<span class="playCountBadge">${opts.badge}</span>` : "";
    const regionBadge = (!opts.badge && song.region) ? `<span class="regionBadge" title="${song.region === "india" ? "Indian" : "Global trending"}">${song.region === "india" ? "🇮🇳" : "🌐"}</span>` : "";

    row.innerHTML = `
        <img src="${song.coverPath}" alt="">
        <span class="songMeta">
            <span class="songName">${song.songName}</span>
            <span class="songArtists">${artistsToString(song.artists)}</span>
        </span>
        <span class="songlistplay">
            ${extraBadge}
            ${regionBadge}
            <i class="rowLike fa-${isLiked(song) ? "solid liked" : "regular"} fa-heart" title="Like"></i>
            <i class="rowMore fa-solid fa-ellipsis-vertical" title="More"></i>
            <span class="timestamp">
                <i class="songItemPlay fa-solid ${playing && !audioElement.paused ? "fa-circle-pause" : "fa-circle-play"}"></i>
            </span>
        </span>`;

    row.querySelector(".songItemPlay").addEventListener("click", (e) => {
        e.stopPropagation();
        handleRowPlayClick(song, opts.listRef);
    });
    row.addEventListener("click", () => handleRowPlayClick(song, opts.listRef));

    row.querySelector(".rowLike").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLike(song);
    });
    row.querySelector(".rowMore").addEventListener("click", (e) => {
        e.stopPropagation();
        openRowMenu(e.currentTarget, song, opts.playlistContext || null);
    });

    return row;
}
function handleRowPlayClick(song, listRef) {
    const current = playQueue[songIndex];
    if (current && songKey(current) === songKey(song) && !audioElement.paused) {
        pauseCurrentSong();
        return;
    }
    if (listRef && listRef.length) {
        playQueue = listRef.slice();
        const idx = playQueue.findIndex(s => songKey(s) === songKey(song));
        updateSong(idx >= 0 ? idx : 0);
    } else {
        // Single song not part of a rendered list (rare) — just splice it in next
        addToQueue(song, true);
        updateSong(playQueue.findIndex(s => songKey(s) === songKey(song)));
    }
    playCurrentSong();
}

/* ---------- Rendering: Library ---------- */
function renderLibrary(filterText = "") {
    const q = filterText.trim().toLowerCase();
    let isSuggestion = false;
    let filtered = librarySongs.filter(s =>
        s.songName.toLowerCase().includes(q) || artistsToString(s.artists).toLowerCase().includes(q)
    );

    if (q && filtered.length === 0) {
        const words = q.split(/\s+/);
        const scored = librarySongs
            .map(s => ({ song: s, score: fuzzyScore(s.songName + " " + artistsToString(s.artists), words) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);
        filtered = scored.length ? scored.map(x => x.song) : librarySongs.slice();
        isSuggestion = true;
    }

    libraryCount.textContent = `${filtered.length} song${filtered.length !== 1 ? "s" : ""}`;
    libraryList.innerHTML = "";
    libraryEmpty.style.display = "none";
    libraryEmptyQuery.textContent = filterText;

    if (isSuggestion) {
        const label = document.createElement("span");
        label.className = "suggestionLabel";
        label.textContent = `No exact match for "${filterText}" — related songs you might like`;
        libraryList.appendChild(label);
    }

    filtered.forEach(song => libraryList.appendChild(buildSongRow(song, { listRef: filtered })));
}

/* ---------- Rendering: Discover ---------- */
function renderDiscover() {
    discoverCount.textContent = discoverSongs.length ? `${discoverSongs.length} result${discoverSongs.length !== 1 ? "s" : ""}` : "";
    discoverList.innerHTML = "";
    discoverEmpty.style.display = discoverSongs.length ? "none" : "block";

    if (discoverSongs.length && discoverIsFallback) {
        const label = document.createElement("span");
        label.className = "suggestionLabel";
        label.textContent = discoverIsFallback === "trending"
            ? "No close match found — here's what's trending on Audius"
            : "No exact match — related suggestions";
        discoverList.appendChild(label);
    }
    discoverSongs.forEach(song => discoverList.appendChild(buildSongRow(song, { listRef: discoverSongs })));
}

/* ---------- Rendering: Liked ---------- */
function renderLiked() {
    const songs = Array.from(liked).map(getCachedSong).filter(Boolean);
    likedCount.textContent = songs.length ? `${songs.length} song${songs.length !== 1 ? "s" : ""}` : "";
    const likedList = document.getElementById("likedList");
    likedList.innerHTML = "";
    document.getElementById("likedEmpty").style.display = songs.length ? "none" : "block";
    songs.forEach(song => likedList.appendChild(buildSongRow(song, { listRef: songs })));
}

/* ---------- Rendering: Recently Played ---------- */
function renderRecent() {
    const songs = recent.map(getCachedSong).filter(Boolean);
    recentCount.textContent = songs.length ? `${songs.length} song${songs.length !== 1 ? "s" : ""}` : "";
    const recentList = document.getElementById("recentList");
    recentList.innerHTML = "";
    document.getElementById("recentEmpty").style.display = songs.length ? "none" : "block";
    songs.forEach(song => recentList.appendChild(buildSongRow(song, { listRef: songs })));
}

/* ---------- Rendering: Most Played + recommendations ---------- */
function renderTop() {
    const entries = Object.entries(playCounts)
        .filter(([fp, c]) => c > 0 && getCachedSong(fp))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25);
    topCount.textContent = entries.length ? `${entries.length} song${entries.length !== 1 ? "s" : ""}` : "";
    const topList = document.getElementById("topList");
    topList.innerHTML = "";
    document.getElementById("topEmpty").style.display = entries.length ? "none" : "block";
    const songs = entries.map(([fp]) => getCachedSong(fp));
    entries.forEach(([fp, count], i) => {
        const song = getCachedSong(fp);
        topList.appendChild(buildSongRow(song, { listRef: songs, badge: `${count} play${count !== 1 ? "s" : ""}` }));
    });
    renderRecommendations();
}
function renderRecommendations() {
    const recsList = document.getElementById("recsList");
    if (!recsList) return;
    // Heuristic: weight artists by likes (x3) and play count, then
    // surface library/cached songs by those artists that aren't already
    // over-played, so the "For You" list shifts with real listening habits.
    const artistScore = {};
    liked.forEach(fp => {
        const s = getCachedSong(fp);
        if (s) s.artists.forEach(a => artistScore[a] = (artistScore[a] || 0) + 3);
    });
    Object.entries(playCounts).forEach(([fp, c]) => {
        const s = getCachedSong(fp);
        if (s) s.artists.forEach(a => artistScore[a] = (artistScore[a] || 0) + c);
    });
    const pool = Object.values(songCache);
    const scored = pool
        .map(s => ({ song: s, score: s.artists.reduce((sum, a) => sum + (artistScore[a] || 0), 0) - (playCounts[songKey(s)] || 0) * 0.5 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(x => x.song);
    const list = scored.length ? scored : librarySongs.slice(0, 5);
    recsList.innerHTML = "";
    list.forEach(song => recsList.appendChild(buildSongRow(song, { listRef: list })));
}

/* ---------- Rendering: Playlists ---------- */
function renderPlaylists() {
    const names = Object.keys(playlists);
    playlistGrid.innerHTML = "";
    playlistGrid.style.display = currentPlaylistView ? "none" : "grid";
    playlistDetail.style.display = currentPlaylistView ? "block" : "none";
    playlistsTitle.textContent = currentPlaylistView ? currentPlaylistView : "Playlists";

    if (!currentPlaylistView) {
        if (!names.length) {
            const p = document.createElement("p");
            p.className = "emptyState";
            p.textContent = "No playlists yet — create one, or add a song to a new playlist from its menu.";
            playlistGrid.appendChild(p);
            return;
        }
        names.forEach(name => {
            const fps = playlists[name];
            const covers = fps.slice(0, 4).map(fp => (getCachedSong(fp) || {}).coverPath || "songcover.png");
            while (covers.length < 4) covers.push(covers[0] || "songcover.png");
            const card = document.createElement("div");
            card.className = "playlistCard";
            card.innerHTML = `
                <div class="playlistCardTop">
                    <span></span>
                    <i class="fa-solid fa-trash" title="Delete playlist"></i>
                </div>
                <div class="playlistCoverGrid">${covers.map(c => `<img src="${c}" alt="">`).join("")}</div>
                <h4>${name}</h4>
                <span>${fps.length} song${fps.length !== 1 ? "s" : ""}</span>`;
            card.querySelector(".fa-trash").addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`Delete playlist "${name}"?`)) {
                    delete playlists[name];
                    lsSet(LS.playlists, playlists);
                    renderPlaylists();
                    showToast("Playlist deleted");
                }
            });
            card.addEventListener("click", () => { currentPlaylistView = name; renderPlaylists(); });
            playlistGrid.appendChild(card);
        });
    } else {
        const fps = playlists[currentPlaylistView] || [];
        const songs = fps.map(getCachedSong).filter(Boolean);
        playlistDetailList.innerHTML = "";
        playlistDetailEmpty.style.display = songs.length ? "none" : "block";
        songs.forEach(song => playlistDetailList.appendChild(
            buildSongRow(song, { listRef: songs, playlistContext: currentPlaylistView })
        ));
    }
}
backToPlaylists.addEventListener("click", () => { currentPlaylistView = null; renderPlaylists(); });
newPlaylistBtn.addEventListener("click", () => openPlaylistModal());

function openPlaylistModal() {
    playlistModalTitle.textContent = "New Playlist";
    playlistNameInput.value = "";
    playlistModalOverlay.classList.add("show");
    playlistModalConfirm.onclick = () => {
        const name = playlistNameInput.value.trim();
        if (!name) { showToast("Give your playlist a name"); return; }
        if (playlists[name]) { showToast("A playlist with that name already exists"); return; }
        playlists[name] = [];
        lsSet(LS.playlists, playlists);
        playlistModalOverlay.classList.remove("show");
        currentPlaylistView = name;
        renderPlaylists();
        showToast(`Created "${name}"`);
    };
    setTimeout(() => playlistNameInput.focus(), 50);
}
closePlaylistModal.addEventListener("click", () => playlistModalOverlay.classList.remove("show"));
playlistModalOverlay.addEventListener("click", (e) => { if (e.target === playlistModalOverlay) playlistModalOverlay.classList.remove("show"); });

/* ---------- Like / Playlist logic ---------- */
function toggleLike(song) {
    cacheSong(song);
    const key = songKey(song);
    if (liked.has(key)) { liked.delete(key); showToast("Removed from Liked Songs"); }
    else { liked.add(key); showToast("Added to Liked Songs"); }
    lsSet(LS.liked, Array.from(liked));
    refreshAllViews();
}
function addSongToPlaylist(song, name) {
    cacheSong(song);
    if (!playlists[name]) playlists[name] = [];
    if (playlists[name].includes(songKey(song))) { showToast(`Already in "${name}"`); return; }
    playlists[name].push(songKey(song));
    lsSet(LS.playlists, playlists);
    showToast(`Added to "${name}"`);
    if (activeTab === "playlists") renderPlaylists();
}
function removeSongFromPlaylist(song, name) {
    if (!playlists[name]) return;
    playlists[name] = playlists[name].filter(fp => fp !== songKey(song));
    lsSet(LS.playlists, playlists);
    renderPlaylists();
    showToast(`Removed from "${name}"`);
}

/* ---------- Row action menu ---------- */
let rowMenuSong = null;
function openRowMenu(anchor, song, playlistContext) {
    rowMenuSong = song;
    const rect = anchor.getBoundingClientRect();
    rowMenu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 260) + "px";
    rowMenu.style.left = Math.max(8, rect.left - 160) + "px";
    menuLikeLabel.textContent = isLiked(song) ? "Unlike" : "Like";
    menuLike.querySelector("i").className = isLiked(song) ? "fa-solid fa-heart" : "fa-regular fa-heart";

    menuPlaylistSub.innerHTML = "";
    Object.keys(playlists).forEach(name => {
        const item = document.createElement("div");
        item.className = "subItem";
        item.textContent = name;
        item.addEventListener("click", () => { addSongToPlaylist(song, name); closeRowMenu(); });
        menuPlaylistSub.appendChild(item);
    });
    menuRemovePlaylist.style.display = playlistContext ? "flex" : "none";
    menuRemovePlaylist.onclick = () => { removeSongFromPlaylist(song, playlistContext); closeRowMenu(); };

    rowMenu.classList.add("show");
    setTimeout(() => document.addEventListener("click", closeRowMenuOnOutside), 0);
}
function closeRowMenu() { rowMenu.classList.remove("show"); document.removeEventListener("click", closeRowMenuOnOutside); }
function closeRowMenuOnOutside(e) { if (!rowMenu.contains(e.target)) closeRowMenu(); }
menuLike.addEventListener("click", () => { if (rowMenuSong) toggleLike(rowMenuSong); closeRowMenu(); });
menuQueue.addEventListener("click", () => { if (rowMenuSong) addToQueue(rowMenuSong); closeRowMenu(); });
menuAddPlaylist.addEventListener("click", () => {
    if (!Object.keys(playlists).length) { closeRowMenu(); openPlaylistModal(); return; }
    menuPlaylistSub.style.display = menuPlaylistSub.style.display === "block" ? "none" : "block";
});

function refreshAllViews() {
    renderLibrary(searchInput.value);
    renderDiscover();
    if (activeTab === "liked") renderLiked();
    if (activeTab === "recent") renderRecent();
    if (activeTab === "top") renderTop();
    if (activeTab === "playlists") renderPlaylists();
    renderQueuePanel();
}

/* ---------- Audius dynamic search ---------- */
function parseArtistsFromAudius(track) {
    const artists = [track.user && track.user.name ? track.user.name : "Unknown Artist"];
    const match = track.title && track.title.match(/\(?(?:feat\.?|ft\.?|with)\s+([^)]+)\)?/i);
    if (match) {
        match[1].split(/,|&/).forEach(name => {
            const clean = name.trim();
            if (clean && !artists.includes(clean)) artists.push(clean);
        });
    }
    return artists;
}
function mapAudiusTrack(track) {
    return {
        songName: track.title,
        artists: parseArtistsFromAudius(track),
        filePath: `https://api.audius.co/v1/tracks/${track.id}/stream?app_name=${AUDIUS_APP_NAME}`,
        coverPath: (track.artwork && (track.artwork["150x150"] || track.artwork["480x480"])) || "songcover.png",
        genre: track.genre || "",
        mood: track.mood || "",
        tags: track.tags ? track.tags.split(",").filter(Boolean).slice(0, 5) : [],
        source: "audius"
    };
}
async function fetchAudiusJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Audius request failed");
    const data = await res.json();
    return data.data || [];
}
async function searchAudius(query) {
    discoverLoader.style.display = "block";
    discoverEmpty.style.display = "none";
    discoverIsFallback = false;
    try {
        let results = await fetchAudiusJSON(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${AUDIUS_APP_NAME}`);
        if (results.length === 0) {
            const words = query.trim().split(/\s+/).sort((a, b) => b.length - a.length);
            const broadQuery = words[0] || query;
            if (broadQuery.toLowerCase() !== query.trim().toLowerCase()) {
                results = await fetchAudiusJSON(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(broadQuery)}&app_name=${AUDIUS_APP_NAME}`);
            }
            if (results.length) discoverIsFallback = "related";
        }
        if (results.length === 0) {
            results = await fetchAudiusJSON(`https://api.audius.co/v1/tracks/trending?app_name=${AUDIUS_APP_NAME}`);
            discoverIsFallback = "trending";
        }
        discoverSongs = results.slice(0, 15).map(mapAudiusTrack);
        discoverSongs.forEach(cacheSong);
        renderDiscover();
    } catch (err) {
        discoverEmpty.textContent = "Couldn't reach Audius right now. Try again in a moment.";
        discoverEmpty.style.display = "block";
        discoverSongs = [];
        renderDiscover();
    } finally {
        discoverLoader.style.display = "none";
    }
}

/* ============================================================
   COUNTRY EXPLORE — curated Audius search terms per country.
   Audius has no direct "country" filter, so each region maps to
   a small set of representative genre/style search terms; results
   are pulled and de-duplicated across those terms.
   ============================================================ */
const COUNTRY_QUERIES = {
    india: ["bollywood", "hindi pop", "indian classical"],
    usa: ["american pop", "usa hip hop", "pop"],
    france: ["french pop", "chanson francaise", "electro france"],
    japan: ["j-pop", "japanese pop", "city pop"],
    korea: ["k-pop", "korean pop", "korean r&b"]
};
const COUNTRY_LABELS = { india: "Indian", usa: "USA", france: "French", japan: "Japanese", korea: "South Korean" };
let selectedCountry = "all";
const countryChipsEl = document.getElementById("countryChips");
if (countryChipsEl) {
    countryChipsEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".countryChip");
        if (!btn) return;
        countryChipsEl.querySelectorAll(".countryChip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedCountry = btn.dataset.country;
        if (selectedCountry === "all") {
            if (searchInput.value.trim().length >= 2) searchAudius(searchInput.value.trim());
            else {
                discoverSongs = [];
                discoverIsFallback = false;
                discoverEmpty.textContent = "Type a song or artist above to discover new music, or pick a country above.";
                renderDiscover();
            }
        } else {
            searchInput.value = "";
            clearSearch.style.display = "none";
            searchAudiusByCountry(selectedCountry);
        }
    });
}
async function searchAudiusByCountry(country) {
    discoverLoader.style.display = "block";
    discoverEmpty.style.display = "none";
    discoverIsFallback = false;
    const terms = COUNTRY_QUERIES[country] || [country];
    try {
        let results = [];
        for (const term of terms) {
            const chunk = await fetchAudiusJSON(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(term)}&app_name=${AUDIUS_APP_NAME}`);
            chunk.forEach(t => { if (!results.some(r => r.id === t.id)) results.push(t); });
            if (results.length >= 24) break;
        }
        if (!results.length) {
            results = await fetchAudiusJSON(`https://api.audius.co/v1/tracks/trending?app_name=${AUDIUS_APP_NAME}`);
            discoverIsFallback = "trending";
        }
        discoverSongs = results.slice(0, 20).map(mapAudiusTrack);
        discoverSongs.forEach(cacheSong);
        renderDiscover();
        if (!discoverIsFallback) showToast(`Showing ${COUNTRY_LABELS[country] || country} tracks`);
    } catch (err) {
        discoverEmpty.textContent = "Couldn't reach Audius right now. Try again in a moment.";
        discoverEmpty.style.display = "block";
        discoverSongs = [];
        renderDiscover();
    } finally {
        discoverLoader.style.display = "none";
    }
}

/* ---------- Track info panel ---------- */
function showTrackInfo(song) {
    const bits = [];
    if (song.genre) bits.push(`<span>${song.genre}</span>`);
    if (song.mood) bits.push(`<span>${song.mood}</span>`);
    if (song.tags && song.tags.length) song.tags.forEach(t => bits.push(`<span>${t}</span>`));
    if (!bits.length) { artistInfo.style.display = "none"; artistInfo.innerHTML = ""; return; }
    artistInfo.innerHTML = `<div class="tagsRow trackTags">${bits.join("")}</div>`;
    artistInfo.style.display = "block";
}

/* ============================================================
   QUEUE — the list actually driving Next/Previous. Freely
   reorderable and independent of whichever tab you're viewing.
   ============================================================ */
function addToQueue(song, playNext = false) {
    cacheSong(song);
    if (playNext) playQueue.splice(songIndex + 1, 0, song);
    else playQueue.push(song);
    renderQueuePanel();
    showToast(`Added "${song.songName}" to queue`);
}
function removeFromQueue(index) {
    if (index === songIndex) { showToast("Can't remove the song that's currently playing"); return; }
    playQueue.splice(index, 1);
    if (index < songIndex) songIndex--;
    renderQueuePanel();
}
let dragFromIndex = null;
function renderQueuePanel() {
    queueListEl.innerHTML = "";
    const upcoming = playQueue.map((s, i) => ({ s, i })).slice(); // full list, current highlighted
    upcoming.forEach(({ s, i }) => {
        const item = document.createElement("div");
        item.className = "queueItem" + (i === songIndex ? " playingRow" : "");
        item.draggable = true;
        item.dataset.index = i;
        item.innerHTML = `
            <i class="fa-solid fa-grip-lines grip"></i>
            <img src="${s.coverPath}" alt="">
            <span class="qMeta">
                <span class="qName">${i === songIndex ? "▶ " : ""}${s.songName}</span>
                <span class="qArtist">${artistsToString(s.artists)}</span>
            </span>
            <i class="fa-solid fa-xmark qRemove"></i>`;
        item.querySelector(".qRemove").addEventListener("click", () => removeFromQueue(i));
        item.addEventListener("click", (e) => {
            if (e.target.closest(".qRemove")) return;
            updateSong(i);
            playCurrentSong();
        });
        item.addEventListener("dragstart", () => { dragFromIndex = i; item.classList.add("dragging"); });
        item.addEventListener("dragend", () => { item.classList.remove("dragging"); dragFromIndex = null; });
        item.addEventListener("dragover", (e) => e.preventDefault());
        item.addEventListener("drop", () => {
            if (dragFromIndex === null || dragFromIndex === i) return;
            const moved = playQueue.splice(dragFromIndex, 1)[0];
            playQueue.splice(i, 0, moved);
            if (dragFromIndex === songIndex) songIndex = i;
            else if (dragFromIndex < songIndex && i >= songIndex) songIndex--;
            else if (dragFromIndex > songIndex && i <= songIndex) songIndex++;
            renderQueuePanel();
        });
        queueListEl.appendChild(item);
    });
}
queueBtn.addEventListener("click", () => queuePanel.classList.add("show"));
closeQueue.addEventListener("click", () => queuePanel.classList.remove("show"));
bannerQueueAdd.addEventListener("click", () => addToQueue(playQueue[songIndex]));

/* ============================================================
   EQUALIZER — Web Audio filter chain. Built lazily on first use
   so autoplay/CORS policies never block normal playback.
   ============================================================ */
let audioCtx = null, eqFilters = [], eqSource = null, eqReady = false;
const EQ_BANDS = [60, 250, 1000, 4000, 12000];
const EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0],
    pop: [-1, 2, 3, 2, -1],
    rock: [4, 2, -2, 2, 4],
    jazz: [2, 0, 1, 2, 3],
    classical: [3, 2, 0, 2, 3],
    bass: [7, 5, 0, -1, -1]
};
function ensureAudioGraph() {
    if (eqReady) return true;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
        eqSource = audioCtx.createMediaElementSource(audioElement);
        let prev = eqSource;
        eqFilters = EQ_BANDS.map(freq => {
            const f = audioCtx.createBiquadFilter();
            f.type = "peaking";
            f.frequency.value = freq;
            f.Q.value = 1;
            f.gain.value = 0;
            prev.connect(f);
            prev = f;
            return f;
        });
        prev.connect(audioCtx.destination);
        eqReady = true;
        return true;
    } catch (err) {
        eqReady = false;
        return false;
    }
}
function applyEqPreset(name) {
    const wasBuilt = eqReady;
    if (!ensureAudioGraph()) { showToast("Equalizer isn't supported in this browser"); return; }
    if (audioCtx.state === "suspended") audioCtx.resume();
    const gains = EQ_PRESETS[name] || EQ_PRESETS.flat;
    eqFilters.forEach((f, i) => { f.gain.value = gains[i]; });
    lsSet(LS.eq, name);
    eqPresets.querySelectorAll(".eqBtn").forEach(b => b.classList.toggle("active", b.dataset.preset === name));
    const current = playQueue[songIndex];
    if (!wasBuilt && name !== "flat" && current && current.source !== "local") {
        showToast("Heads up: the equalizer can silence streamed (Discover/library-extension) tracks if the host doesn't allow audio processing. Refresh the page to undo it.", 5200);
    }
}
eqPresets.addEventListener("click", (e) => {
    const btn = e.target.closest(".eqBtn");
    if (!btn) return;
    applyEqPreset(btn.dataset.preset);
});

/* ============================================================
   VISUALIZER — animated equalizer-style bars. Runs while
   playing, freezes on pause. Kept CSS/canvas-driven (not tied
   to real frequency data) so it works identically for local
   files and cross-origin Discover streams.
   ============================================================ */
let vizRAF = null, vizBars = new Array(28).fill(0.08);
function drawVisualizer() {
    if (!vizCtx) return;
    const w = visualizerCanvas.width, h = visualizerCanvas.height;
    vizCtx.clearRect(0, 0, w, h);
    const barW = w / vizBars.length;
    const styles = getComputedStyle(document.body);
    const c1 = styles.getPropertyValue("--accent").trim() || "#5b8cff";
    const c2 = styles.getPropertyValue("--accent2").trim() || "#ff5da2";
    const grad = vizCtx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    vizCtx.fillStyle = grad;
    vizBars.forEach((v, i) => {
        const barH = Math.max(2, v * h);
        vizCtx.fillRect(i * barW + 1, h - barH, barW - 2, barH);
    });
}
function stepVisualizer() {
    vizBars = vizBars.map(v => {
        const target = 0.15 + Math.random() * 0.85;
        return v + (target - v) * 0.35;
    });
    drawVisualizer();
    vizRAF = requestAnimationFrame(stepVisualizer);
}
function startVisualizer() { if (!vizRAF) stepVisualizer(); }
function stopVisualizer() {
    cancelAnimationFrame(vizRAF);
    vizRAF = null;
    vizBars = vizBars.map(() => 0.08);
    drawVisualizer();
}

/* ---------- Core player logic ---------- */
function updateSong(index) {
    if (!playQueue.length) return;
    songIndex = ((index % playQueue.length) + playQueue.length) % playQueue.length;
    const song = playQueue[songIndex];
    cacheSong(song);
    audioElement.src = song.filePath;
    audioElement.currentTime = 0;
    masterSongName.innerText = song.songName;
    masterArtistName.innerText = artistsToString(song.artists);
    bannerSongName.innerText = song.songName;
    bannerArtists.innerText = artistsToString(song.artists);
    bannerCover.src = song.coverPath;
    miniCover.src = song.coverPath;
    bannerLike.className = isLiked(song) ? "fa-solid fa-heart liked" : "fa-regular fa-heart";
    showTrackInfo(song);

    // Recently Played
    recent = [songKey(song), ...recent.filter(fp => fp !== songKey(song))].slice(0, 25);
    lsSet(LS.recent, recent);

    refreshAllViews();
    syncFullPlayer();
    if (fullPlayerOverlay.classList.contains("show")) loadLyricsForCurrent();
}
function playCurrentSong() {
    // NOTE: we deliberately do NOT call ensureAudioGraph() here. Routing a
    // cross-origin (Discover/country/extended-library) stream through the
    // Web Audio graph silently mutes it in most browsers unless the remote
    // server sends specific CORS headers. The graph is now only built when
    // the user explicitly picks a non-flat equalizer preset — see
    // applyEqPreset() below. This keeps all streamed songs audible by default.
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    audioElement.play().catch(() => showToast("Couldn't play this track."));
    masterPlay.classList.remove("fa-circle-play");
    masterPlay.classList.add("fa-circle-pause");
    gif.style.opacity = 1;
    bannerCover.classList.add("spin");
    miniCover.classList.add("spin");
    startVisualizer();

    const song = playQueue[songIndex];
    const key = songKey(song);
    playCounts[key] = (playCounts[key] || 0) + 1;
    lsSet(LS.counts, playCounts);

    refreshAllViews();
    syncFullPlayer();
}
function pauseCurrentSong() {
    audioElement.pause();
    masterPlay.classList.remove("fa-circle-pause");
    masterPlay.classList.add("fa-circle-play");
    gif.style.opacity = 0;
    bannerCover.classList.remove("spin");
    miniCover.classList.remove("spin");
    stopVisualizer();
    refreshAllViews();
    syncFullPlayer();
}
function goToIndex(newIndex) {
    if (!playQueue.length) return;
    if (isShuffle) {
        if (playQueue.length > 1) {
            let r;
            do { r = Math.floor(Math.random() * playQueue.length); } while (r === songIndex);
            newIndex = r;
        } else newIndex = 0;
    } else {
        if (newIndex >= playQueue.length) {
            if (repeatMode !== "all") { pauseCurrentSong(); return; }
            newIndex = 0;
        }
        if (newIndex < 0) newIndex = playQueue.length - 1;
    }
    updateSong(newIndex);
    playCurrentSong();
}

masterPlay.addEventListener("click", () => {
    if (!playQueue.length) return;
    if (audioElement.paused) playCurrentSong(); else pauseCurrentSong();
});
next.addEventListener("click", () => goToIndex(songIndex + 1));
previous.addEventListener("click", () => {
    if (audioElement.currentTime > 3) { audioElement.currentTime = 0; return; }
    goToIndex(songIndex - 1);
});
audioElement.addEventListener("ended", () => {
    if (repeatMode === "one") { updateSong(songIndex); playCurrentSong(); }
    else goToIndex(songIndex + 1);
});
audioElement.addEventListener("timeupdate", () => {
    if (!isNaN(audioElement.duration)) {
        myProgressBar.value = (audioElement.currentTime / audioElement.duration) * 100 || 0;
        currentTimeEl.textContent = formatTime(audioElement.currentTime);
        durationTimeEl.textContent = formatTime(audioElement.duration);
        if (fullProgressBar) {
            fullProgressBar.value = myProgressBar.value;
            fullCurrentTime.textContent = currentTimeEl.textContent;
            fullDurationTime.textContent = durationTimeEl.textContent;
        }

        // Crossfade: simple fade-out as the track nears its end, then the
        // next track fades back in via playCurrentSong's own volume ramp.
        if (crossfadeEnabled && audioElement.duration - audioElement.currentTime < 3.2 && !audioElement._fading) {
            audioElement._fading = true;
            fadeAudio(audioElement.volume, 0, 900, () => { /* handled by 'ended' */ });
        }
        if (sleepEndOfSong && audioElement.duration - audioElement.currentTime < 0.4) {
            sleepEndOfSong = false;
            pauseCurrentSong();
            showToast("Sleep timer: stopped after this song");
        }
    }
});
function fadeAudio(from, to, ms, done) {
    const steps = 18;
    let i = 0;
    const stepMs = ms / steps;
    const id = setInterval(() => {
        i++;
        audioElement.volume = from + (to - from) * (i / steps);
        if (i >= steps) { clearInterval(id); if (done) done(); }
    }, stepMs);
}
audioElement.addEventListener("play", () => {
    audioElement._fading = false;
    fadeAudio(0, getBaseVolume(), 500);
});
function getBaseVolume() { return (volumeBar.value / 100); }

myProgressBar.addEventListener("input", () => {
    if (audioElement.duration) audioElement.currentTime = (myProgressBar.value * audioElement.duration) / 100;
});

/* ---------- Volume + mute (persisted) ---------- */
function setVolumeUI(v) {
    volumeBar.value = v;
    volumePct.textContent = `${v}%`;
    audioElement.volume = v / 100;
    muteBtn.className = "fa-solid " + (v == 0 ? "fa-volume-xmark" : v < 50 ? "fa-volume-low" : "fa-volume-high");
}
volumeBar.addEventListener("input", () => {
    setVolumeUI(Number(volumeBar.value));
    lsSet(LS.volume, Number(volumeBar.value));
    lsSet(LS.muted, false);
});
let lastVolume = lsGet(LS.volume, 80);
muteBtn.addEventListener("click", () => {
    const muted = lsGet(LS.muted, false);
    if (muted) { setVolumeUI(lastVolume || 80); lsSet(LS.muted, false); }
    else { lastVolume = Number(volumeBar.value) || 80; setVolumeUI(0); lsSet(LS.muted, true); }
});

/* ---------- Shuffle / Repeat (persisted) ---------- */
function updateRepeatUI() {
    repeatBtn.classList.toggle("activeToggle", repeatMode !== "off");
    repeatBtn.classList.toggle("repeatOneBadge", repeatMode === "one");
    repeatBtn.title = repeatMode === "off" ? "Repeat" : repeatMode === "all" ? "Repeat All" : "Repeat One";
}
shuffleBtn.classList.toggle("activeToggle", isShuffle);
updateRepeatUI();
shuffleBtn.addEventListener("click", () => {
    isShuffle = !isShuffle;
    shuffleBtn.classList.toggle("activeToggle", isShuffle);
    lsSet(LS.shuffle, isShuffle);
    showToast(isShuffle ? "Shuffle on" : "Shuffle off");
});
repeatBtn.addEventListener("click", () => {
    repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    lsSet(LS.repeat, repeatMode);
    updateRepeatUI();
    showToast(repeatMode === "off" ? "Repeat off" : repeatMode === "all" ? "Repeat all" : "Repeat one");
});

/* ---------- Banner quick actions ---------- */
bannerLike.addEventListener("click", () => toggleLike(playQueue[songIndex]));
bannerAdd.addEventListener("click", () => {
    if (!Object.keys(playlists).length) { openPlaylistModal(); return; }
    openRowMenu(bannerAdd, playQueue[songIndex], null);
    menuPlaylistSub.style.display = "block";
});

/* ---------- Tabs ---------- */
const TAB_HEADINGS = {
    library: "Welcome to Kinetic - Listen what you love!",
    discover: "Discover new music on Kinetic",
    playlists: "Your Playlists",
    liked: "Songs you've liked",
    recent: "Your recent listening",
    top: "Your most played, and picks for you"
};
navLinks.forEach(link => {
    link.addEventListener("click", () => {
        navLinks.forEach(l => l.classList.remove("active"));
        link.classList.add("active");
        activeTab = link.dataset.tab;
        [librarySection, discoverSection, playlistsSection, likedSection, recentSection, topSection].forEach(s => s.style.display = "none");
        ({ library: librarySection, discover: discoverSection, playlists: playlistsSection, liked: likedSection, recent: recentSection, top: topSection }[activeTab]).style.display = "block";
        pageHeading.textContent = TAB_HEADINGS[activeTab] || "";
        if (activeTab === "discover" && searchInput.value.trim().length >= 2 && discoverSongs.length === 0) searchAudius(searchInput.value.trim());
        else if (activeTab === "discover" && selectedCountry !== "all" && discoverSongs.length === 0) searchAudiusByCountry(selectedCountry);
        if (activeTab === "liked") renderLiked();
        if (activeTab === "recent") renderRecent();
        if (activeTab === "top") renderTop();
        if (activeTab === "playlists") renderPlaylists();
    });
});

/* ---------- Search ---------- */
searchInput.addEventListener("input", () => {
    const q = searchInput.value;
    clearSearch.style.display = q ? "inline-block" : "none";
    renderLibrary(q);
    clearTimeout(searchDebounce);
    if (q.trim().length >= 2 && countryChipsEl) {
        countryChipsEl.querySelectorAll(".countryChip").forEach(b => b.classList.toggle("active", b.dataset.country === "all"));
        selectedCountry = "all";
    }
    if (activeTab === "discover") {
        if (q.trim().length < 2) {
            discoverSongs = [];
            discoverIsFallback = false;
            discoverEmpty.textContent = "Type a song or artist above to discover new music — you'll always get results or related suggestions.";
            renderDiscover();
            return;
        }
        searchDebounce = setTimeout(() => searchAudius(q.trim()), 500);
    }
});
clearSearch.addEventListener("click", () => { searchInput.value = ""; searchInput.dispatchEvent(new Event("input")); });

/* ---------- Sleep timer ---------- */
sleepSelect.addEventListener("change", () => {
    clearTimeout(sleepTimeoutId);
    sleepEndOfSong = false;
    const val = sleepSelect.value;
    if (val === "0") { sleepStatus.textContent = ""; return; }
    if (val === "end") { sleepEndOfSong = true; sleepStatus.textContent = "Stopping after this song"; return; }
    const mins = Number(val);
    sleepTimeoutId = setTimeout(() => { pauseCurrentSong(); showToast("Sleep timer: playback paused"); sleepStatus.textContent = ""; sleepSelect.value = "0"; }, mins * 60000);
    sleepStatus.textContent = `Stopping in ${mins} min`;
});

/* ---------- Crossfade toggle ---------- */
crossfadeToggle.checked = crossfadeEnabled;
crossfadeToggle.addEventListener("change", () => {
    crossfadeEnabled = crossfadeToggle.checked;
    lsSet(LS.crossfade, crossfadeEnabled);
});

/* ---------- Theme ---------- */
function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    themeBtn.className = "fa-solid navIcon " + (theme === "dark" ? "fa-moon" : "fa-sun");
    lsSet(LS.theme, theme);
}
themeBtn.addEventListener("click", () => {
    const current = document.body.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
});

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener("keydown", (e) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    switch (e.key) {
        case " ": e.preventDefault(); masterPlay.click(); break;
        case "ArrowRight":
            if (e.shiftKey) next.click(); else audioElement.currentTime = Math.min(audioElement.duration || 0, audioElement.currentTime + 5);
            break;
        case "ArrowLeft":
            if (e.shiftKey) previous.click(); else audioElement.currentTime = Math.max(0, audioElement.currentTime - 5);
            break;
        case "ArrowUp": e.preventDefault(); setVolumeUI(Math.min(100, Number(volumeBar.value) + 5)); lsSet(LS.volume, Number(volumeBar.value)); break;
        case "ArrowDown": e.preventDefault(); setVolumeUI(Math.max(0, Number(volumeBar.value) - 5)); lsSet(LS.volume, Number(volumeBar.value)); break;
        case "m": case "M": muteBtn.click(); break;
        case "l": case "L": toggleLike(playQueue[songIndex]); break;
        case "s": case "S": shuffleBtn.click(); break;
        case "r": case "R": repeatBtn.click(); break;
    }
});

/* ---------- Info panel ---------- */
function openInfoPanel() {
    infoStats.innerHTML = `
        <div class="statCard"><span class="num">${librarySongs.length}</span><span class="label">Library songs</span></div>
        <div class="statCard"><span class="num">${liked.size}</span><span class="label">Liked songs</span></div>
        <div class="statCard"><span class="num">${Object.keys(playlists).length}</span><span class="label">Playlists</span></div>
        <div class="statCard"><span class="num">${isShuffle ? "On" : "Off"}</span><span class="label">Shuffle</span></div>
    `;
    settingsOverlay.classList.add("show");
}
settingsBtn.addEventListener("click", openInfoPanel);
closeSettings.addEventListener("click", () => settingsOverlay.classList.remove("show"));
settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.remove("show"); });

/* ---------- Ambient floating-notes background ---------- */
function spawnNote() {
    const note = document.createElement("span");
    const glyphs = ["♪", "♫", "♬", "♩"];
    note.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    note.style.left = Math.random() * 100 + "%";
    note.style.fontSize = 14 + Math.random() * 22 + "px";
    const duration = 14 + Math.random() * 10;
    note.style.animationDuration = duration + "s";
    bgFX.appendChild(note);
    setTimeout(() => note.remove(), duration * 1000 + 500);
}
if (bgFX) { for (let i = 0; i < 6; i++) setTimeout(spawnNote, i * 1500); setInterval(spawnNote, 2600); }

/* ============================================================
   FULL SCREEN PLAYER — big cover, mirrored transport controls,
   playback-speed slider, and a lyrics panel (via the free
   lyrics.ovh API). Lyrics are plain text, not time-synced, since
   no timestamped lyric source is available for these tracks.
   ============================================================ */
const fullPlayerOverlay = document.getElementById("fullPlayerOverlay");
const closeFullPlayerBtn = document.getElementById("closeFullPlayer");
const bannerExpand = document.getElementById("bannerExpand");
const miniExpand = document.getElementById("miniExpand");
const fullCover = document.getElementById("fullCover");
const fullSongName = document.getElementById("fullSongName");
const fullArtists = document.getElementById("fullArtists");
const fullLike = document.getElementById("fullLike");
const fullAdd = document.getElementById("fullAdd");
const fullQueueAdd = document.getElementById("fullQueueAdd");
const fullLyricsToggle = document.getElementById("fullLyricsToggle");
const fullProgressBar = document.getElementById("fullProgressBar");
const fullCurrentTime = document.getElementById("fullCurrentTime");
const fullDurationTime = document.getElementById("fullDurationTime");
const fullShuffleBtn = document.getElementById("fullShuffleBtn");
const fullPreviousBtn = document.getElementById("fullPrevious");
const fullMasterPlay = document.getElementById("fullMasterPlay");
const fullNextBtn = document.getElementById("fullNext");
const fullRepeatBtn = document.getElementById("fullRepeatBtn");
const speedSlider = document.getElementById("speedSlider");
const speedLabel = document.getElementById("speedLabel");
const speedBtn = document.getElementById("speedBtn");
const lyricsPanel = document.getElementById("lyricsPanel");
const lyricsBody = document.getElementById("lyricsBody");

function openFullPlayer() {
    syncFullPlayer();
    fullPlayerOverlay.classList.add("show");
    loadLyricsForCurrent();
}
function closeFullPlayerFn() { fullPlayerOverlay.classList.remove("show"); }
if (bannerExpand) bannerExpand.addEventListener("click", openFullPlayer);
if (miniExpand) miniExpand.addEventListener("click", openFullPlayer);
if (closeFullPlayerBtn) closeFullPlayerBtn.addEventListener("click", closeFullPlayerFn);

function syncFullPlayer() {
    if (!fullPlayerOverlay) return;
    const song = playQueue[songIndex];
    if (!song) return;
    fullCover.src = song.coverPath;
    fullSongName.textContent = song.songName;
    fullArtists.textContent = artistsToString(song.artists);
    fullLike.className = isLiked(song) ? "fa-solid fa-heart liked" : "fa-regular fa-heart";
    fullCover.classList.toggle("spin", !audioElement.paused);
    fullMasterPlay.classList.toggle("fa-circle-play", audioElement.paused);
    fullMasterPlay.classList.toggle("fa-circle-pause", !audioElement.paused);
    fullShuffleBtn.classList.toggle("activeToggle", isShuffle);
    fullRepeatBtn.classList.toggle("activeToggle", repeatMode !== "off");
    fullRepeatBtn.classList.toggle("repeatOneBadge", repeatMode === "one");
}
fullLike.addEventListener("click", () => toggleLike(playQueue[songIndex]));
fullAdd.addEventListener("click", () => bannerAdd.click());
fullQueueAdd.addEventListener("click", () => addToQueue(playQueue[songIndex]));
fullMasterPlay.addEventListener("click", () => masterPlay.click());
fullNextBtn.addEventListener("click", () => next.click());
fullPreviousBtn.addEventListener("click", () => previous.click());
fullShuffleBtn.addEventListener("click", () => shuffleBtn.click());
fullRepeatBtn.addEventListener("click", () => repeatBtn.click());
fullProgressBar.addEventListener("input", () => {
    if (audioElement.duration) audioElement.currentTime = (fullProgressBar.value * audioElement.duration) / 100;
});
fullLyricsToggle.addEventListener("click", () => {
    lyricsPanel.style.display = lyricsPanel.style.display === "none" ? "block" : "none";
});

/* ---------- Playback speed (0.5x – 2x) ---------- */
function setSpeed(rate) {
    rate = Math.min(2, Math.max(0.5, rate));
    audioElement.playbackRate = rate;
    speedSlider.value = rate;
    speedLabel.textContent = rate.toFixed(1) + "x";
    speedBtn.textContent = rate.toFixed(1).replace(/\.0$/, "") + "x";
    lsSet(LS.speed, rate);
}
speedSlider.addEventListener("input", () => setSpeed(Number(speedSlider.value)));
speedBtn.addEventListener("click", () => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const cur = Math.round(audioElement.playbackRate * 100) / 100;
    const idx = rates.indexOf(cur);
    setSpeed(rates[(idx + 1) % rates.length] ?? 1);
});

/* ---------- Lyrics (lyrics.ovh, best-effort, plain text) ---------- */
const lyricsCache = {};
async function loadLyricsForCurrent() {
    const song = playQueue[songIndex];
    if (!song || !lyricsBody) return;
    const key = songKey(song);
    if (lyricsCache[key]) { renderLyrics(lyricsCache[key]); return; }
    lyricsBody.classList.add("centered");
    lyricsBody.innerHTML = `<p class="hintText">Looking for lyrics&hellip;</p>`;
    const artist = (song.artists && song.artists[0]) || "";
    try {
        const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song.songName)}`);
        const data = await res.json();
        if (data && data.lyrics) {
            lyricsCache[key] = data.lyrics;
            renderLyrics(data.lyrics);
        } else {
            lyricsBody.classList.add("centered");
            lyricsBody.innerHTML = `<p class="hintText">No lyrics found for this track.</p>`;
        }
    } catch (err) {
        lyricsBody.classList.add("centered");
        lyricsBody.innerHTML = `<p class="hintText">Lyrics service unavailable right now.</p>`;
    }
}
function renderLyrics(text) {
    lyricsBody.classList.remove("centered");
    const lines = text.split("\n").filter(l => l.trim().length);
    lyricsBody.innerHTML = lines.map(l => `<span class="lyricsLine">${l.replace(/</g, "&lt;")}</span>`).join("\n");
}

/* ============================================================
   EXPANDED LIBRARY — pulls ~400 more real, playable tracks from
   the Audius open catalog straight into the main Library/search
   pool, so search isn't limited to the 7 starter MP3s.
   IMPORTANT HONESTY NOTE: Audius is an independent/open-upload
   catalog, not a licensed major-label service — it does not
   carry copyrighted commercial hits (Bollywood film songs,
   chart-topping label releases, etc.). These 400 tracks are real,
   independent-artist songs matched by genre/style tags: ~200 in
   Hindi/Bollywood-adjacent/Punjabi/Desi genres, and ~200 across
   globally popular contemporary genres (pop, hip-hop, EDM, K-pop,
   Latin, Afrobeats, R&B...). Everything stays fully playable and
   legal since it streams from Audius the same way Discover does.
   ============================================================ */
const INDIAN_SEED_TERMS = [
    "bollywood", "hindi pop", "hindi love song", "punjabi", "bhangra",
    "hindi rap", "desi hip hop", "hindi lofi", "bollywood remix",
    "indian folk", "hindi romantic", "punjabi pop", "indian indie",
    "hindi classical", "tamil"
];
const TRENDING_SEED_TERMS = [
    "pop", "hip hop", "edm", "k-pop", "latin", "r&b", "electronic",
    "indie pop", "dance", "trap", "afrobeats", "reggaeton", "house",
    "top hits", "chill"
];
const EXT_LIB_CACHE_KEY = "kinetic_extlibrary_v1";
const EXT_LIB_CACHE_TIME_KEY = "kinetic_extlibrary_v1_time";
const EXT_LIB_CACHE_MS = 12 * 60 * 60 * 1000; // 12 hours

async function fetchTermTracks(term, limit = 40) {
    try {
        return await fetchAudiusJSON(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(term)}&limit=${limit}&app_name=${AUDIUS_APP_NAME}`);
    } catch (err) { return []; }
}
async function buildPool(terms, target) {
    const perTerm = await Promise.all(terms.map(t => fetchTermTracks(t, 40)));
    const seen = new Set();
    const pool = [];
    let row = 0, addedAny = true;
    while (pool.length < target && addedAny) {
        addedAny = false;
        for (const arr of perTerm) {
            if (pool.length >= target) break;
            const track = arr[row];
            if (track && !seen.has(track.id)) {
                seen.add(track.id);
                pool.push(track);
                addedAny = true;
            }
        }
        row++;
    }
    return pool.slice(0, target);
}
async function loadExpandedLibrary() {
    const cachedSongs = lsGet(EXT_LIB_CACHE_KEY, null);
    const cachedTime = lsGet(EXT_LIB_CACHE_TIME_KEY, 0);
    if (cachedSongs && cachedSongs.length && Date.now() - cachedTime < EXT_LIB_CACHE_MS) {
        applyExpandedLibrary(cachedSongs, true);
        return;
    }
    try {
        const [indianTracks, trendingTracks] = await Promise.all([
            buildPool(INDIAN_SEED_TERMS, 200),
            buildPool(TRENDING_SEED_TERMS, 200)
        ]);
        const indianSongs = indianTracks.map(mapAudiusTrack).map(s => ({ ...s, region: "india" }));
        const trendingSongs = trendingTracks.map(mapAudiusTrack).map(s => ({ ...s, region: "global" }));
        const combined = [...indianSongs, ...trendingSongs];
        if (combined.length) {
            lsSet(EXT_LIB_CACHE_KEY, combined);
            lsSet(EXT_LIB_CACHE_TIME_KEY, Date.now());
        }
        applyExpandedLibrary(combined, false);
    } catch (err) {
        showToast("Couldn't load the extra songs right now — try refreshing.");
    }
}
function applyExpandedLibrary(songs, fromCache) {
    if (!songs || !songs.length) return;
    songs.forEach(cacheSong);
    const existing = new Set(librarySongs.map(s => s.filePath));
    songs.forEach(s => { if (!existing.has(s.filePath)) { librarySongs.push(s); existing.add(s.filePath); } });
    const libraryHint = document.getElementById("libraryHint");
    if (libraryHint) {
        const indianCount = librarySongs.filter(s => s.region === "india").length;
        const globalCount = librarySongs.filter(s => s.region === "global").length;
        libraryHint.textContent = `${librarySongs.length} songs total — including ${indianCount} Indian-genre 🇮🇳 and ${globalCount} global-trending 🌐 tracks from the Audius open catalog.`;
    }
    if (activeTab === "library") renderLibrary(searchInput.value);
    if (!fromCache) showToast(`Added ${songs.length} more songs to your library`);
}

/* ---------- Loading screen ---------- */
window.addEventListener("load", () => {
    setTimeout(() => loadingScreen.classList.add("hide"), 700);
});
setTimeout(() => { if (loadingScreen) loadingScreen.classList.add("hide"); }, 4000); // safety fallback

/* ---------- Init ---------- */
applyTheme(lsGet(LS.theme, "dark"));
const savedEq = lsGet(LS.eq, "flat");
eqPresets.querySelectorAll(".eqBtn").forEach(b => b.classList.toggle("active", b.dataset.preset === savedEq));

const muted = lsGet(LS.muted, false);
setVolumeUI(muted ? 0 : lsGet(LS.volume, 80));
lastVolume = lsGet(LS.volume, 80);

drawVisualizer();
setSpeed(lsGet(LS.speed, 1));
playQueue = librarySongs.slice();
updateSong(0);
renderQueuePanel();
loadExpandedLibrary();