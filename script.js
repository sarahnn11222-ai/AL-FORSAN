function toggleMenu() {

    const menu = document.getElementById("menuOverlay");

    menu.classList.toggle("show");

}

document.addEventListener("keydown", function(event) {

    if (event.key === "Escape") {

        document.getElementById("menuOverlay").classList.remove("show");

    }

});


async function loadDiscordAccount() { 
  const loginBtn = document.getElementById("discordLoginBtn");
  const userBox = document.getElementById("discordUser");
    const avatar = document.getElementById("discordAvatar");
    const username = document.getElementById("discordUsername");
    const logoutBtn = document.getElementById("discordLogoutBtn");
const applyBtn = document.getElementById("applyBtn");
const homeApplyBtn = document.getElementById("homeApplyBtn");
const homeDiscordLoginBtn = document.getElementById("homeDiscordLoginBtn");
  const brandLogo = document.getElementById("brandLogo");
  if (!loginBtn || !userBox) return;
try { const response = await fetch("/.netlify/functions/discord-me"); const data = await response.json();
if (data.loggedIn && data.user) {
  const homeHeroButtons = document.getElementById("homeHeroButtons");
if (homeHeroButtons) homeHeroButtons.classList.add("logged-in");
  if (applyBtn) applyBtn.hidden = false;
  if (homeApplyBtn) homeApplyBtn.hidden = false;
  loginBtn.hidden = true;
  userBox.hidden = false;
  username.textContent = data.user.username;

 const avatarUrl = data.user.avatar
  ? "https://cdn.discordapp.com/avatars/" + data.user.id + "/" + data.user.avatar + ".png"
  : "https://cdn.discordapp.com/embed/avatars/0.png";
  avatar.src = avatarUrl;
 if (brandLogo) brandLogo.hidden = true;
} else {
  loginBtn.hidden = false;
  if (brandLogo) brandLogo.hidden = false;
  userBox.hidden = true;
  if (applyBtn) applyBtn.hidden = true;
  if (homeApplyBtn) homeApplyBtn.hidden = true;
}
} catch (error) { console.error("Discord account error:", error); }
logoutBtn.addEventListener("click", async function () { await fetch("/.netlify/functions/discord-logout"); window.location.reload(); }); }
document.addEventListener("DOMContentLoaded", loadDiscordAccount);