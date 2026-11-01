const { app, BrowserWindow } = require("electron");
const path = require("node:path");

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 1100, height: 760, title: "HR Attendance" });
  if (process.env.VITE_DEV_URL) win.loadURL(process.env.VITE_DEV_URL);
  else win.loadFile(path.join(__dirname, "../dist/hr/index.html"));
});

app.on("window-all-closed", () => app.quit());
