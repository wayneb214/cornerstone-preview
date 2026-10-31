import {
  ANNUAL,
  ANNUAL_PER_MONTH,
  FREE_QUESTIONS,
  MONTHLY,
  ROME_FOR_SALE,
  ROME_PACK,
  TRIAL_DAYS,
  countsAsDailyCompletion,
  dayKey,
  englishChecked,
  englishDay,
  orderQuestions,
  recordStreak,
  remainingQuestions,
  selectFact,
} from "./rules.js";

const STORAGE = {
  streak: "cornerstone.preview.streak",
  quiz: "cornerstone.preview.quiz",
  member: "cornerstone.preview.member",
  interstitial: "cornerstone.preview.interstitialDay",
};

const ICONS = {
  today: '<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>',
  places: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/></svg>',
  quiz: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 1 1 3.6 2.7c-.7.3-1.1.8-1.1 1.5V14"/><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"/></svg>',
  members: '<svg viewBox="0 0 24 24"><path d="m12 3 1.6 4.7H18l-3.8 2.8 1.5 4.6L12 12.8 8.3 15.1 9.8 10.5 6 7.7h4.4z"/></svg>',
};

const state = {
  content: null,
  error: "",
  member: localStorage.getItem(STORAGE.member) === "1",
  route: "today",
  placeId: null,
  reviewId: null,
  plan: "annual",
  message: "",
  legal: null,
  streak: loadJson(STORAGE.streak, { current: 0, longest: 0, lastCompletedDayKey: null }),
  quiz: loadJson(STORAGE.quiz, { dayKey: "", answers: {} }),
};

const screen = document.querySelector("#screen");
const overlay = document.querySelector("#overlay");
const tabs = document.querySelector("#tabs");
const memberToggle = document.querySelector("#member-toggle");
memberToggle.checked = state.member;
memberToggle.addEventListener("change", () => setMember(memberToggle.checked));

document.querySelector("#tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;
  go(button.dataset.tab);
});

window.addEventListener("hashchange", readRoute);
readRoute();
loadContent();

function loadJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") };
  } catch {
    return fallback;
  }
}

function save() {
  localStorage.setItem(STORAGE.streak, JSON.stringify(state.streak));
  localStorage.setItem(STORAGE.quiz, JSON.stringify(state.quiz));
  localStorage.setItem(STORAGE.member, state.member ? "1" : "0");
}

function setMember(value) {
  state.member = value;
  memberToggle.checked = value;
  save();
  render();
}

function go(route, placeId) {
  state.placeId = placeId || null;
  state.message = "";
  location.hash = placeId ? `${route}/${placeId}` : route;
}

function readRoute() {
  const [route, id] = (location.hash || "#today").slice(1).split("/");
  state.route = ["today", "quiz", "places", "members", "about", "privacy", "terms"].includes(route) ? route : "today";
  state.placeId = id || null;
  if (state.route !== "quiz") state.reviewId = null;
  render();
}

async function loadContent() {
  try {
    const [facts, quiz, places, episodes, manifest] = await Promise.all(
      ["facts.json", "quiz.json", "places.json", "episodes.json", "manifest.json"].map((name) =>
        fetch(`Content/${name}`).then((response) => {
          if (!response.ok) throw new Error(`Could not load ${name}`);
          return response.json();
        })
      )
    );
    state.content = {
      facts: facts.facts,
      questions: quiz.questions,
      places: places.places,
      episodes: episodes.episodes,
      manifest,
    };
    state.error = "";
  } catch (error) {
    state.error = `${error.message}. Start the preview from the repository root with python3 -m http.server, then open /web-preview/. Opening the file directly cannot load the notes.`;
  }
  render();
}

function todayAnswers() {
  const key = dayKey(new Date());
  if (state.quiz.dayKey !== key) return {};
  return state.quiz.answers || {};
}

function episode(id) {
  return state.content.episodes.find((item) => item.id === id);
}

function render() {
  tabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("on", button.dataset.tab === (state.route === "about" || state.route === "privacy" || state.route === "terms" ? "today" : state.placeId ? "places" : state.route));
    button.innerHTML = `${ICONS[button.dataset.tab]}<span>${button.dataset.label}</span>`;
  });
  screen.dataset.ready = state.content || state.error ? "true" : "false";
  screen.dataset.screen = state.placeId ? "place" : state.route;
  if (state.error) {
    screen.innerHTML = `<div class="error"><h2 class="display">The notes didn’t load</h2><p>${escapeHtml(state.error)}</p></div>`;
    return;
  }
  if (!state.content) {
    screen.innerHTML = `<p class="note">Loading the notes…</p>`;
    return;
  }
  const view = {
    today: renderToday,
    quiz: renderQuiz,
    places: state.placeId ? renderPlace : renderPlaces,
    members: renderMembers,
    about: renderAbout,
    privacy: () => renderLegal("Privacy", "PRIVACY_POLICY.md"),
    terms: () => renderLegal("Terms", "TERMS_OF_USE.md"),
  }[state.route];
  screen.innerHTML = view();
  overlay.innerHTML = state.message ? modal(state.message) : "";
  bind();
  if (state.route === "places" && !state.placeId) mountMap("places-map", state.content.places);
  if (state.placeId) {
    const place = state.content.places.find((item) => item.id === state.placeId);
    if (place) mountMap("place-map", [place], true);
  }
}

function bind() {
  overlay.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", () => {
      state.message = "";
      render();
    });
  });
  screen.querySelectorAll("[data-go]").forEach((node) => {
    node.addEventListener("click", () => go(node.dataset.go, node.dataset.id));
  });
  screen.querySelectorAll("[data-choice]").forEach((node) => {
    node.addEventListener("click", () => answer(node.dataset.qid, Number(node.dataset.choice)));
  });
  screen.querySelectorAll("[data-plan]").forEach((node) => {
    node.addEventListener("click", () => {
      state.plan = node.dataset.plan;
      render();
    });
  });
  const buy = screen.querySelector("[data-buy]");
  if (buy) buy.addEventListener("click", previewPurchase);
  const restore = screen.querySelector("[data-restore]");
  if (restore) restore.addEventListener("click", () => {
    state.message = "Preview only. Nothing was restored, and nothing was charged.";
    render();
  });
  const next = screen.querySelector("[data-next]");
  if (next) next.addEventListener("click", () => {
    state.reviewId = null;
    maybeInterstitial();
    render();
  });
  screen.querySelectorAll("[data-watch]").forEach((node) => {
    node.addEventListener("click", () => watch(node.dataset.watch));
  });
  screen.querySelectorAll("[data-external]").forEach((node) => {
    node.addEventListener("click", () => window.open(node.dataset.external, "_blank", "noopener"));
  });
  const close = screen.querySelector("[data-close-modal]");
  if (close) close.addEventListener("click", () => {
    state.message = "";
    render();
  });
}

function renderToday() {
  const date = new Date();
  const selection = selectFact(state.content.facts, date);
  const fact = selection.primary;
  const show = episode(fact.episode_id);
  const label = selection.matchedCalendar ? `On this day · ${englishDay(date)}` : `From the archive · ${englishDay(date)}`;
  const also = selection.alsoOnThisDay.slice(0, 2).map((item) => `<p class="small-serif">${escapeHtml(item.text)}</p>`).join("");
  return `
    <div class="toprow">
      <div class="brand">
        <img src="images/keystone.png" alt="">
        <div>
          <h1>Cornerstone History</h1>
          <p>Documentaries on the places that made history</p>
        </div>
      </div>
      <button class="icon-btn" data-go="about" aria-label="About">ⓘ</button>
    </div>
    <p class="kicker">${escapeHtml(label)}</p>
    ${selection.matchedCalendar ? "" : `<p class="note">Nothing in the notes falls on this exact date. Here is another sourced note.</p>`}
    <article class="card">
      <p class="serif">${escapeHtml(fact.text)}</p>
      ${sourceBlock(fact)}
      ${watchBlock(show)}
    </article>
    ${also ? `<p class="kicker">Also in the notes for this date</p>${also}` : ""}
    ${state.member ? "" : simulatedAd()}
  `;
}

function renderQuiz() {
  const date = new Date();
  const ordered = orderQuestions(state.content.questions, date);
  const answers = todayAnswers();
  const remaining = remainingQuestions(ordered, Object.keys(answers), state.member);
  const review = state.reviewId ? ordered.find((item) => item.id === state.reviewId) : null;
  const question = review || remaining[0];
  const score = scoreToday(ordered);
  const limit = state.member ? ordered.length : Math.min(FREE_QUESTIONS, ordered.length);
  const head = `
    <div class="quiz-head">
      <h2 class="display">Daily quiz</h2>
      <span class="streak">${state.streak.current ? `${state.streak.current}-day streak` : "Start a streak"}</span>
    </div>`;
  if (!question) {
    return `${head}
      <p class="serif" style="margin-top:18px">That’s today’s quiz.</p>
      <p class="note">${score.correct} correct out of ${score.answered}. Streak: ${state.streak.current}.</p>
      ${state.member
        ? `<p>You’ve answered every question in today’s order. They’ll be shuffled again tomorrow.</p>`
        : `<p>Free quizzes are ${FREE_QUESTIONS} questions a day. Membership is unlimited quizzes, and the app is ad-free.</p>
           <p class="note">Come back tomorrow to keep the streak, or preview the member view with the switch above.</p>`}`;
  }
  const revealed = answers[question.id] !== undefined;
  const choices = question.choices.map((text, index) => {
    const letter = "ABCDE"[index];
    let cls = "choice";
    if (revealed && index === question.correct_index) cls += " correct";
    if (revealed && answers[question.id] === index && index !== question.correct_index) cls += " wrong";
    return `<button class="${cls}" data-choice="${index}" data-qid="${escapeHtml(question.id)}" ${revealed ? "disabled" : ""}>
      <span class="letter">${letter}</span><span>${escapeHtml(text)}</span>
      ${revealed && index === question.correct_index ? "<span>✓</span>" : ""}
    </button>`;
  }).join("");
  const number = Math.min(Object.keys(answers).length + (review ? 0 : 1), Math.max(limit, 1));
  return `${head}
    <div class="row" style="margin-top:14px">
      <span class="note">Question ${number} of ${limit}</span>
      <span class="note">${score.correct} correct</span>
    </div>
    <progress value="${Object.keys(answers).length}" max="${limit}"></progress>
    <p class="kicker">${escapeHtml(question.topic)}</p>
    <p class="serif">${escapeHtml(question.prompt)}</p>
    ${choices}
    ${revealed ? explanation(question, answers[question.id]) + `<button class="gold-btn" data-next>${remaining.length && remaining[0].id !== question.id ? "Next question" : "See today’s result"}</button>` : ""}`;
}

function explanation(question, selected) {
  const correct = selected === question.correct_index;
  return `<article class="card gold">
    <p style="color:var(--gold);font-weight:600;margin:0 0 6px">${correct ? "Correct." : "Not quite."}</p>
    <p style="margin:0">${escapeHtml(question.explanation)}</p>
    ${sourceBlock(question)}
  </article>`;
}

function answer(id, choice) {
  const key = dayKey(new Date());
  if (state.quiz.dayKey !== key) state.quiz = { dayKey: key, answers: {} };
  if (state.quiz.answers[id] !== undefined) return;
  const before = Object.keys(state.quiz.answers).length;
  state.quiz.answers[id] = choice;
  state.reviewId = id;
  const ordered = orderQuestions(state.content.questions, new Date());
  const after = Object.keys(state.quiz.answers).length;
  if (!countsAsDailyCompletion(before, ordered.length) && countsAsDailyCompletion(after, ordered.length)) {
    state.streak = recordStreak(state.streak, new Date());
  }
  save();
  render();
}

function maybeInterstitial() {
  if (state.member) return;
  const remaining = remainingQuestions(
    orderQuestions(state.content.questions, new Date()),
    Object.keys(todayAnswers()),
    false
  );
  if (remaining.length) return;
  const key = dayKey(new Date());
  if (localStorage.getItem(STORAGE.interstitial) === key) return;
  localStorage.setItem(STORAGE.interstitial, key);
  state.message = "Simulated full-screen ad. In the real app this can appear once a day after the free quiz, and never for a member. Nothing was loaded from an ad network.";
}

function scoreToday() {
  const answers = todayAnswers();
  const byId = new Map(state.content.questions.map((question) => [question.id, question]));
  let correct = 0;
  for (const [id, choice] of Object.entries(answers)) {
    if (byId.get(id)?.correct_index === choice) correct += 1;
  }
  return { correct, answered: Object.keys(answers).length };
}

function renderPlaces() {
  const rows = state.content.places.map((place) => `
    <button class="card place-row" data-go="places" data-id="${escapeHtml(place.id)}">
      <h3>${escapeHtml(place.name)}</h3>
      <p class="meta">${escapeHtml(place.city)}, ${escapeHtml(place.country)}</p>
      <p class="tbc">${place.opening_times_verified ? "" : "Opening times TBC — verify"}</p>
    </button>`).join("");
  return `
    <h2 class="display">Places</h2>
    <div id="places-map" class="map"></div>
    <p class="note">${escapeHtml(state.content.manifest.visitor_disclaimer)}</p>
    ${rows}
    ${state.member ? "" : simulatedAd()}
  `;
}

function renderPlace() {
  const place = state.content.places.find((item) => item.id === state.placeId);
  if (!place) return `<p>That place is not in this build.</p><button class="back" data-go="places">Back</button>`;
  const history = place.history_points.map((point) => `
    <article class="card">
      <p class="small-serif">${escapeHtml(point.text)}</p>
      ${sourceBlock(point)}
    </article>`).join("");
  const show = episode(place.episode_id);
  const extras = (place.extra_links || []).map((link) =>
    `<button class="outline-btn" data-external="${escapeHtml(link.url)}">${escapeHtml(link.label)}</button>`
  ).join("");
  const affiliates = (place.affiliate_links || []).map((link) => `
    <button class="card place-row" data-external="${escapeHtml(fillAffiliate(link.url_template))}">
      <strong>${escapeHtml(link.vendor)}</strong>
      <p class="meta">Opens in a new tab. Partner ID not set yet, so this is only the public search page. Nothing is booked here.</p>
    </button>`).join("");
  const also = (place.also_episode_ids || []).map((id) => {
    const item = episode(id);
    return item ? `<button class="back" data-watch="${escapeHtml(id)}">${escapeHtml(item.title)}</button>` : "";
  }).join("");
  return `
    <button class="back" data-go="places">Places</button>
    <h2 class="display">${escapeHtml(place.name)}</h2>
    <p class="note">${escapeHtml(place.city)} · ${escapeHtml(place.region)}</p>
    <p>${escapeHtml(place.site_label)}</p>
    <div id="place-map" class="map small"></div>
    <p class="kicker">From the notes</p>
    ${history}
    <p class="kicker">Before you go</p>
    ${visitorRow("Opening times", place.opening_times, place.opening_times_verified)}
    ${visitorRow("Admission", place.admission, place.admission_verified)}
    ${visitorRow("Best time to visit", place.best_time_to_visit, place.best_time_verified)}
    <p class="note">Last checked ${escapeHtml(englishChecked(place.last_checked))}. ${escapeHtml(place.official_url_note || "")}</p>
    <p class="uncertainty">Check the official site before you travel. This preview does not sell tickets, and a time or price that says TBC has not been confirmed.</p>
    <button class="outline-btn" data-external="${escapeHtml(place.official_url)}">${escapeHtml(place.official_url_label)}</button>
    ${extras}
    <p class="kicker">Watch before you go</p>
    ${watchBlock(show)}
    ${also}
    <p class="kicker">Tickets and tours</p>
    <p class="note">Affiliate links leave this page. They are not a purchase inside the app.</p>
    ${affiliates}
  `;
}

function visitorRow(title, value, verified) {
  return `<article class="card ${verified ? "" : "gold"}">
    <p class="tbc">${escapeHtml(title)}</p>
    <p style="margin:4px 0 0">${escapeHtml(value)}</p>
    ${verified ? "" : `<p class="note">Not confirmed</p>`}
  </article>`;
}

function renderMembers() {
  if (state.member) {
    return `
      ${membersIntro()}
      <article class="card gold">
        <p class="serif">You’re a member</p>
        <p class="note">In this preview the switch above is pretending. Quizzes are unlimited and the simulated ads are hidden. Nothing was charged.</p>
        <button class="outline-btn" data-buy>Turn the preview off</button>
      </article>
      ${comingSoon()}
      ${memberFooter()}
    `;
  }
  return `
    ${membersIntro()}
    <button class="plan ${state.plan === "annual" ? "on" : ""}" data-plan="annual">
      <span class="row"><strong>Yearly</strong><span class="badge">Best value</span></span>
      <span class="row"><span class="note">About ${ANNUAL_PER_MONTH} a month, billed yearly · ${TRIAL_DAYS}-day free trial</span><span class="price">${ANNUAL}</span></span>
    </button>
    <button class="plan ${state.plan === "monthly" ? "on" : ""}" data-plan="monthly">
      <strong>Monthly</strong>
      <span class="row"><span class="note">Billed every month. Cancel anytime.</span><span class="price">${MONTHLY}</span></span>
    </button>
    <button class="gold-btn" data-buy>${state.plan === "annual" ? `Start ${TRIAL_DAYS}-day free trial` : "Subscribe monthly"}</button>
    <p class="fine">Then ${ANNUAL}/year if you keep the yearly plan, or ${MONTHLY}/month. In the real app this is billed by Apple. Here it only changes the preview.</p>
    ${comingSoon()}
    ${memberFooter()}
  `;
}

function membersIntro() {
  return `
    <img src="images/keystone.png" alt="" width="56" height="56">
    <h2 class="display">Cornerstone Members</h2>
    <p class="note" style="font-family:var(--serif);font-style:italic">Go deeper into the places that made history</p>
    <p class="perk"><i>◆</i> Ad-free</p>
    <p class="perk"><i>◆</i> Unlimited daily quizzes</p>
    <p class="fine">That’s the membership in this version. Walking routes and offline city guides are not included.</p>
  `;
}

function comingSoon() {
  return `<article class="card">
    <p class="kicker">Coming soon</p>
    <p><strong>Rome city pack · ${ROME_PACK}</strong></p>
    <p class="note">Walking routes and offline city guides are not for sale. ${ROME_FOR_SALE ? "" : "There is no buy button until that guide exists."}</p>
    <p class="fine">uk.cornerstonehistory.citypack.rome</p>
  </article>`;
}

function memberFooter() {
  return `<button class="back" data-restore>Restore purchases</button>
    <p class="links"><button data-go="terms">Terms</button><button data-go="privacy">Privacy</button><button data-go="about">About</button></p>`;
}

function previewPurchase() {
  if (state.member) {
    setMember(false);
    state.message = "Preview only. The member view is off. Nothing was refunded.";
    return;
  }
  state.message = "Preview only. Nothing was charged. The member view is on so you can see an ad-free quiz.";
  setMember(true);
}

function renderAbout() {
  const count = state.content;
  return `
    <button class="back" data-go="today">Today</button>
    <h2 class="display">About</h2>
    <p>Cornerstone History is a companion to a YouTube channel of documentaries about the places that made history. The films stay on YouTube. This app does not host video.</p>
    <p class="kicker">Where the notes come from</p>
    <p>On this day facts and quiz questions are built only from the channel’s fact-checked claim files. Each one keeps the source it was checked against. This build has ${count.facts.length} notes, ${count.questions.length} questions and ${count.places.length} places.</p>
    <p class="kicker">AI-assisted content</p>
    <p>Some of the research notes were prepared with AI assistance and then checked against the sources cited in the app. The app does not present an unsourced AI line as a fact. If a later update adds generated pictures, they will be labelled “Artistic reconstruction”. This version does not show generated scene pictures. The keystone arch is the channel’s logo.</p>
    <p class="kicker">Places</p>
    <p>The launch places are in Italy: Pompeii, the Colosseum, Vatican City, Florence Cathedral, Palazzo Medici Riccardi and the Medici Chapels. Opening times and prices are marked TBC until they are checked.</p>
    <p class="kicker">This page</p>
    <p>This is a browser preview of the iPhone app. Payments and ads are simulated. No payment, advertising, or analytics service is loaded.</p>
    <p class="links"><button data-go="privacy">Privacy</button><button data-go="terms">Terms</button></p>
    <p class="fine">Preview · version 1.0</p>
  `;
}

function renderLegal(title, file) {
  const text = "The full draft is not part of this public preview. Preview, no real payments.";
  return `<button class="back" data-go="about">About</button><h2 class="display">${title}</h2><div class="legal">${escapeHtml(text)}</div>`;
}

function watch(id) {
  const item = episode(id);
  if (!item) return;
  if (!item.youtube_is_placeholder && item.youtube_url) {
    window.open(item.youtube_url, "_blank", "noopener");
    return;
  }
  state.message = `${item.title} is not on YouTube yet. The link in the content files is still ${item.youtube_id}. When a real video id is added, this button opens it outside the app.`;
  render();
}

function watchBlock(item) {
  if (!item) return "";
  const note = item.youtube_is_placeholder
    ? (item.title_is_placeholder
      ? "YouTube link not published yet. This film also has no publishing title in the build."
      : "YouTube link not published yet.")
    : "Opens outside this page. This app does not host the film.";
  return `<button class="gold-btn" data-watch="${escapeHtml(item.id)}">Watch the documentary</button><p class="note">${escapeHtml(note)}</p>`;
}

function sourceBlock(item) {
  const source = item.source || "";
  const uncertainty = item.uncertainty ? `<p class="uncertainty">${escapeHtml(item.uncertainty)}</p>` : "";
  const link = /^https?:\/\//i.test(source)
    ? `<p class="source"><a href="${escapeHtml(source)}" target="_blank" rel="noopener">Source</a><br>${escapeHtml(source)}</p>`
    : `<p class="source">Source: ${escapeHtml(source)}</p>`;
  return uncertainty + link;
}

function simulatedAd() {
  return `<div class="ad">Simulated ad. This preview does not load an ad, a tracker, or an analytics tool.</div>`;
}

function modal(text, compact) {
  return `<div class="${compact ? "alert" : "modal"}" role="dialog">
    <div class="sheet">
      <p class="kicker">Preview</p>
      <p>${escapeHtml(text)}</p>
      <button class="gold-btn" data-close-modal>Close</button>
    </div>
  </div>`;
}

function fillAffiliate(template) {
  return template
    .replaceAll("{GETYOURGUIDE_PARTNER_ID}", "PLACEHOLDER_GYG")
    .replaceAll("{VIATOR_PID}", "PLACEHOLDER_VIATOR")
    .replaceAll("{BOOKING_AID}", "PLACEHOLDER_BOOKING");
}

function mountMap(id, places, small) {
  const node = document.getElementById(id);
  if (!node || !window.L) return;
  const map = L.map(node, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const bounds = [];
  for (const place of places) {
    const points = place.map_points?.length ? place.map_points : [{ name: place.name, latitude: place.latitude, longitude: place.longitude }];
    for (const point of points) {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [18, 18], iconAnchor: [9, 16] }),
      }).addTo(map);
      marker.bindTooltip(point.name, { direction: "top" });
      if (!small) marker.on("click", () => go("places", place.id));
      bounds.push([point.latitude, point.longitude]);
    }
  }
  if (bounds.length === 1) map.setView(bounds[0], 13);
  else if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
  setTimeout(() => map.invalidateSize(), 50);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
