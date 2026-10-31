function toggleMenu() {

    const menu = document.getElementById("menuOverlay");

    menu.classList.toggle("show");

}

document.addEventListener("keydown", function(event) {

    if (event.key === "Escape") {

        document.getElementById("menuOverlay").classList.remove("show");

    }

});


async function loadDiscordAccount() { const loginBtn = document.getElementById("discordLoginBtn"); const userBox = document.getElementById("discordUser"); const avatar = document.getElementById("discordAvatar"); const username = document.getElementById("discordUsername"); const logoutBtn = document.getElementById("discordLogoutBtn");
if (!loginBtn || !userBox) return;
try { const response = await fetch("/.netlify/functions/discord-me"); const data = await response.json();
if (data.loggedIn && data.user) {
  loginBtn.hidden = true;
  userBox.hidden = false;

  username.textContent = data.user.username;

 const avatarUrl = data.user.avatar
  ? "https://cdn.discordapp.com/avatars/" + data.user.id + "/" + data.user.avatar + ".png"
  : "https://cdn.discordapp.com/embed/avatars/0.png";
  avatar.src = avatarUrl;
} else {
  loginBtn.hidden = false;
  userBox.hidden = true;
}
} catch (error) { console.error("Discord account error:", error); }
logoutBtn.addEventListener("click", async function () { await fetch("/.netlify/functions/discord-logout"); window.location.reload(); }); }
document.addEventListener("DOMContentLoaded", loadDiscordAccount);