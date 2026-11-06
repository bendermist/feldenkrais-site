import { initScenes } from "./scenes.js";

// Header background after scrolling
const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("scrolled", scrollY > 40);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Mobile menu
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("site-nav");
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open);
  toggle.textContent = open ? "Close" : "Menu";
});
nav.addEventListener("click", (e) => {
  if (e.target.matches("a")) { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", false); toggle.textContent = "Menu"; }
});

// Reveal on scroll
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// Contact form → email draft
const form = document.getElementById("contact-form");
const to = document.querySelector("[data-contact-email]").textContent.trim();
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const d = new FormData(form);
  const subject = `Feldenkrais lesson enquiry from ${d.get("name")}`;
  const body = `${d.get("message")}\n\n${d.get("name")}\n${d.get("email")}`;
  location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});

document.getElementById("year").textContent = new Date().getFullYear();

initScenes();
