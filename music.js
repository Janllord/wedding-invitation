
document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("weddingMusic");
  const musicButton = document.getElementById("musicToggle");

  if (!video || !musicButton) {
    console.error("Music video or button not found.");
    return;
  }

  video.volume = 0.5;
  video.muted = false;

  musicButton.textContent = "♫ MUSIC OFF";

  musicButton.addEventListener("click", async () => {
    try {
      if (video.paused) {
        await video.play();

        musicButton.textContent = "♫ MUSIC ON";
        musicButton.classList.add("playing");
      } else {
        video.pause();

        musicButton.textContent = "♫ MUSIC OFF";
        musicButton.classList.remove("playing");
      }
    } catch (error) {
      console.error("MP4 playback error:", error);
      alert("Unable to play music. Please check Download.mp4.");
    }
  });

  video.addEventListener("ended", () => {
    musicButton.textContent = "♫ MUSIC OFF";
    musicButton.classList.remove("playing");
  });

  video.addEventListener("error", () => {
    console.error("Unable to load Download.mp4. Check the file path and format.");
  });
});
