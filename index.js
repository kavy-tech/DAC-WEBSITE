/* =========================
SUPABASE INITIALIZATION
========================= */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  "https://nsmioyqhnefljfpmzksk.supabase.co",
  "sb_publishable_skwyA6GX4YTiiRpvF8PWFw_iHUFgXCZ"
);

/* =========================
DATA & STATE
========================= */
let eventData = { events: [] };
let teamData = { members: [] };

/* =========================
NAVIGATION & HAMBURGER
========================= */
function initNavigation() {
  const hamburger = document.querySelector('.hamburger');
  const navPill = document.querySelector('.nav-pill');
  
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      navPill.classList.toggle('active');
      hamburger.classList.toggle('active');
    });
  }

  // Smooth scroll for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        // Close mobile menu if open
        if (navPill?.classList.contains('active')) {
          navPill.classList.remove('active');
          hamburger.classList.remove('active');
        }
      }
    });
  });
}

/* =========================
TIMELINE INTERACTIONS
========================= */
function initTimeline() {
  document.querySelectorAll('.timeline-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.timeline-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

/* =========================
EVENTS LOADING
========================= */
async function loadEventData() {
  try {
    const { data, error } = await supabase
      .from('db_upcoming_events')
      .select('*')
      .order('event_date', { ascending: true });

    if (error) throw error;

    eventData = {
      events: data.map(event => ({
        title: event.title,
        description: event.description,
        event_date: event.event_date
      }))
    };

    console.log('Event data loaded from Supabase');
    renderEvents();
  } catch (error) {
    console.error('Supabase failed, using local JSON', error);

    try {
      const localResponse = await fetch('./upcoming-events.json');
      eventData = await localResponse.json();
      renderEvents();
    } catch (localError) {
      console.error('Error loading local data:', localError);
      showError('Failed to load event data. Please try refreshing the page.');
    }
  }
}

function renderEvents() {
  const container = document.querySelector(".events-list");
  
  if (!container) return;

  container.innerHTML = "";

  eventData.events.forEach(e => {
    const newEvent = document.createElement("li");
    
    newEvent.innerHTML = `
      <strong>${e.title}</strong>
      <div>${e.description}</div>
      ${e.event_date ? `<div style="font-size: 0.9rem; color: var(--text-muted); margin-top: 8px;">${new Date(e.event_date).toLocaleDateString()}</div>` : ''}
    `;

    container.appendChild(newEvent);
  });
}

/* =========================
TEAM DATA LOADING
========================= */
async function loadTeamData() {
  try {
    const { data, error } = await supabase
      .from('db_team_members')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    teamData = {
      members: data.map(member => ({
        name: member.name,
        designation: member.designation,
        img: member.image_url,
        linkedIn: member.linkedin_url
      }))
    };

    console.log('Team data loaded from Supabase');
    renderTeam();
  } catch (error) {
    console.error('Supabase failed, using local JSON', error);

    try {
      const localResponse = await fetch('./team-data.json');
      teamData = await localResponse.json();
      renderTeam();
    } catch (localError) {
      console.error('Error loading local data:', localError);
      showError('Failed to load team data. Please try refreshing the page.');
    }
  }
}

function renderTeam() {
  const container = document.querySelector(".core-team-container");
  
  if (!container) return;

  container.innerHTML = "";

  teamData.members.forEach(m => {
    const newMember = document.createElement("div");
    newMember.className = "team-card";

    newMember.innerHTML = `
      <div class="image-container">
        <img src="${m.img}" alt="${m.name}">
      </div>
      <p class="role">
        <span class="team-name">${m.name}</span><br>
        <span class="team-designation">${m.designation}</span>
      </p>
      <div class="card-footer">
        <div class="social-icons">
          <a href="${m.linkedIn}" target="_blank" rel="noreferrer">
            <i class="fa-brands fa-linkedin"></i>
            <span class="linkedin-text">LinkedIn</span>
          </a>
        </div>
      </div>
    `;

    container.appendChild(newMember);
  });
}

/* =========================
CONTACT FORM SUBMISSION
========================= */
function initContactForm() {
  const form = document.querySelector(".form-container form");
  
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const name = formData.get('name').trim();
    const email = formData.get('email').trim();
    const message = formData.get('message').trim();

    // Validation
    if (!name || !email || !message) {
      showError('Please fill in all fields.');
      return;
    }

    try {
      const { error } = await supabase
        .from('db_contact_messages')
        .insert([
          {
            name: name,
            email: email,
            message: message,
            submitted_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;

      // Success message
      showSuccess('Message sent successfully! We will get back to you soon.');
      form.reset();
    } catch (error) {
      console.error('Error submitting form:', error);
      showError('Failed to send message. Please try again or email us directly.');
    }
  });
}

/* =========================
ERROR & SUCCESS HANDLING
========================= */
function showError(message) {
  console.error(message);
  // Create a temporary error notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 5000);
}

function showSuccess(message) {
  console.log(message);
  // Create a temporary success notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #44ff44;
    color: #333;
    padding: 16px 24px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 5000);
}

/* =========================
INITIALIZATION
========================= */
function initApp() {
  console.log('Initializing DAC website...');
  initNavigation();
  initTimeline();
  initContactForm();
  loadEventData();
  loadTeamData();
}

// Load when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
